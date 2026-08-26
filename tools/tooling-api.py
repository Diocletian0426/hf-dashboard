# =============================================================================
# The save endpoint behind the Tooling page's editable cells.
#
#   python3 tools/tooling-api.py        (listens on http://127.0.0.1:8125)
#
# WHY THIS EXISTS AT ALL. The dashboard is a static site: it has no server of
# its own, and the Google service-account key can NEVER go into a page — anyone
# who opened the site would then hold edit rights to the company spreadsheet.
# So the key stays here, on the machine, and the page asks this process to save.
# No key in the browser, and nothing to reach if the page is ever published.
#
# WHAT IT WILL TOUCH — deliberately small, because it edits a live company sheet
# that several people rely on:
#   * only the Tools section of "Master List (Updated)"
#   * only columns B..H — the seven the sheet itself has. Column A (the No.
#     column) is never touched.
#   * only rows the client can still identify: the "was" description AND code it
#     sends must still match what is in the sheet, or that row is refused and
#     reported. "was" is the ORIGINAL pair, which is what lets an item be renamed
#     without the guard mistaking the rename for a shifted row.
#     This is the guard against the office inserting a row after the snapshot was
#     taken — without it, every later row would be written one line off.
#   * new items are appended after the last Tools row, never inserted
# It binds to 127.0.0.1, so nothing off this machine can reach it.
#
# Dates go in as SERIAL NUMBERS (see tooling_sheet.py) — the sheet's locale is
# en_US while the column is formatted d/m/yyyy, so a "20/8/2026" string would
# land as text in a date column.
# =============================================================================
import datetime
import json
import os
import sys
import threading
import time
import http.server

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tooling_sheet as T

PORT = 8125
# the dev server that serves the page — both spellings of "this machine",
# because a page opened at 127.0.0.1 has a different origin to one at localhost
ORIGINS = ("http://localhost:8123", "http://127.0.0.1:8123")
MAX_EDITS = 200
MAX_ADDS = 20

# ---------------------------------------------------------------------------
# KEEPING THE PAGE IN STEP WITH THE SHEET.
#
# The office edits the spreadsheet all day. Without this, tooling-data.js is
# whatever was pulled last, and the page's own caption has to apologise for it.
# So: read the Tools section every SYNC_SECONDS and rewrite the file WHEN, AND
# ONLY WHEN, something actually changed. Writing an identical file would make
# the dev server reload the browser for nothing.
#
# The reverse direction — the page's own edits — already goes straight into the
# sheet through /save, and that path re-pulls when it is done. So the two ends
# agree in both directions, and this loop mostly finds nothing to do.
#
#   HF_TOOLING_SYNC_SECONDS=0   turns it off (then it is a snapshot again)
# ---------------------------------------------------------------------------
SYNC_SECONDS = int(os.environ.get("HF_TOOLING_SYNC_SECONDS", "120"))

# One writer at a time: /save re-pulls at the end, and the loop below writes the
# same file. Neither is slow, but a half-written tooling-data.js is a page that
# will not load at all.
WRITE_LOCK = threading.Lock()

SYNC = {"on": SYNC_SECONDS > 0, "every": SYNC_SECONDS,
        "checked": None, "changed": None, "rows": 0, "error": None}


def _stamp():
    return datetime.datetime.now().strftime("%H:%M:%S")


def sync_loop():
    """Poll the sheet; rewrite frontend/tooling-data.js only when it moved."""
    svc = None
    last = None
    while True:
        try:
            if svc is None:
                svc = T.service(readonly=True)
            rows, meta = T.read_tools(svc)
            opts = T.site_options(svc, rows)
            # the signature deliberately leaves the pull DATE out: a new day is
            # not a change to the sheet, and re-writing at midnight would reload
            # every open browser for nothing
            sig = json.dumps([rows, meta, opts], sort_keys=True, default=str)
            if sig != last:
                with WRITE_LOCK:
                    T.write_data_js(rows, meta, opts, datetime.date.today().isoformat())
                if last is not None:          # the first pass is not "a change"
                    print("sync %s — sheet moved, %d rows written" % (_stamp(), len(rows)))
                    SYNC["changed"] = _stamp()
                last = sig
            SYNC["checked"] = _stamp()
            SYNC["rows"] = len(rows)
            SYNC["error"] = None
        except Exception as e:
            SYNC["error"] = str(e)
            svc = None                        # a dead credential is worth rebuilding
            print("SYNC FAILED:", e)
        time.sleep(SYNC_SECONDS)


def a1(col, row):
    return "'%s'!%s%d" % (T.TAB, col, row)


def save(payload):
    edits = payload.get("edits") or []
    adds = payload.get("adds") or []
    # dry_run answers "what exactly would you write, and where" without writing.
    # The append arithmetic has to be checkable without a live company sheet
    # standing in as the test fixture.
    dry = bool(payload.get("dry_run"))
    if len(edits) > MAX_EDITS or len(adds) > MAX_ADDS:
        raise ValueError("too many changes in one save (%d edits, %d new items)" % (len(edits), len(adds)))

    svc = T.service(readonly=False)
    rows, meta = T.read_tools(svc)            # fresh read: the sheet may have moved on
    by_row = {r["row"]: r for r in rows}

    data, refused = [], []

    for e in edits:
        row = int(e.get("row", 0))
        cur = by_row.get(row)
        was = e.get("was") or {}
        setv = e.get("set") or {}
        if not cur:
            refused.append({"row": row, "why": "that line is no longer in the Tools section"})
            continue
        # identity check — the row number alone is not proof it is the same tool
        if cur["desc"] != str(was.get("desc", "")).strip() or cur["code"] != str(was.get("code", "")).strip():
            refused.append({"row": row,
                            "why": "the sheet now has \"%s\" (%s) on that line, not \"%s\" (%s) — "
                                   "somebody edited or inserted rows. Re-pull and try again."
                                   % (cur["desc"], cur["code"] or "no code",
                                      was.get("desc", ""), was.get("code", "") or "no code")})
            continue

        for field, col in T.COL.items():
            if field not in setv:
                continue
            val = setv[field]
            if field == "moved":
                serial = T.iso_to_serial(val)
                val = serial if serial is not None else ""
            elif field == "qty":
                val = str(val).strip()
                val = float(val) if _num(val) else val
            else:
                val = str(val or "")
            data.append({"range": a1(col, row), "values": [[val]]})

    if dry:
        return {"ok": True, "dry_run": True, "saved": 0, "added": 0, "would_write": data,
                "would_append_at": [meta["lastRow"] + 1 + i for i in range(len(adds))],
                "refused": refused, "toolsRange": [meta["firstRow"], meta["lastRow"]]}

    if data:
        svc.spreadsheets().values().batchUpdate(
            spreadsheetId=T.SHEET_ID,
            body={"valueInputOption": "RAW", "data": data}).execute()

    added = 0
    if adds:
        last = meta["lastRow"]
        sheet_id = _tab_id(svc)
        for i, item in enumerate(adds):
            row = last + 1 + i
            # carry the row above's look and its Site dropdown down to the new
            # line. Copying the validation is what keeps the chip style — a rule
            # written from scratch renders as a plain arrow instead.
            svc.spreadsheets().batchUpdate(spreadsheetId=T.SHEET_ID, body={"requests": [
                {"copyPaste": {
                    "source": {"sheetId": sheet_id, "startRowIndex": last - 1, "endRowIndex": last,
                               "startColumnIndex": 0, "endColumnIndex": 8},
                    "destination": {"sheetId": sheet_id, "startRowIndex": row - 1, "endRowIndex": row,
                                    "startColumnIndex": 0, "endColumnIndex": 8},
                    "pasteType": "PASTE_FORMAT"}},
                {"copyPaste": {
                    "source": {"sheetId": sheet_id, "startRowIndex": last - 1, "endRowIndex": last,
                               "startColumnIndex": 5, "endColumnIndex": 6},
                    "destination": {"sheetId": sheet_id, "startRowIndex": row - 1, "endRowIndex": row,
                                    "startColumnIndex": 5, "endColumnIndex": 6},
                    "pasteType": "PASTE_DATA_VALIDATION"}}
            ]}).execute()

            qty = str(item.get("qty", "")).strip()
            serial = T.iso_to_serial(item.get("moved", ""))
            svc.spreadsheets().values().update(
                spreadsheetId=T.SHEET_ID, range="'%s'!B%d:H%d" % (T.TAB, row, row),
                valueInputOption="RAW",
                body={"values": [[str(item.get("desc", "")).strip(),
                                  str(item.get("spec", "")).strip(),
                                  str(item.get("code", "")).strip(),
                                  float(qty) if _num(qty) else qty,
                                  str(item.get("site", "")).strip(),
                                  serial if serial is not None else "",
                                  str(item.get("remark", "")).strip()]]}).execute()
            added += 1

    # leave the page's copy agreeing with the sheet it just changed
    rows, meta = T.read_tools(svc)
    opts = T.site_options(svc, rows)
    with WRITE_LOCK:
        T.write_data_js(rows, meta, opts, datetime.date.today().isoformat())

    return {"ok": True, "saved": len([d for d in data]), "added": added,
            "refused": refused, "rows": len(rows)}


def _num(s):
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


def _tab_id(svc):
    meta = svc.spreadsheets().get(spreadsheetId=T.SHEET_ID, fields="sheets.properties").execute()
    for sh in meta["sheets"]:
        if sh["properties"]["title"] == T.TAB:
            return sh["properties"]["sheetId"]
    raise RuntimeError("tab %s not found" % T.TAB)


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get("Origin") or ""
        self.send_header("Access-Control-Allow-Origin", origin if origin in ORIGINS else ORIGINS[0])
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            # the page asks this before it shows anything editable — it also
            # tells the page whether it is looking at a live copy or a snapshot
            return self._json(200, {"ok": True, "sheet": T.TAB, "sync": SYNC})
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path.startswith("/consumables"):
            return self._consumables()
        if not self.path.startswith("/save"):
            return self._json(404, {"ok": False, "error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(n) or b"{}")
            result = save(payload)
            print("%ssaved %d cell(s), added %d row(s), refused %d"
                  % ("DRY RUN — " if result.get("dry_run") else "",
                     result.get("saved", 0), result.get("added", 0),
                     len(result.get("refused", []))))
            self._json(200, result)
        except Exception as e:
            print("SAVE FAILED:", e)
            self._json(500, {"ok": False, "error": str(e)})

    # Consumables are a LOCAL record, not part of the spreadsheet — the office's
    # sheet has no consumables section and this machine cannot add one to a file
    # it does not own. So this writes frontend/consumable-data.js and nothing
    # else. Same shape in, same shape out; the page sends the whole document
    # because there is a single person editing a single file.
    def _consumables(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            doc = json.loads(self.rfile.read(n) or b"{}")
            items = doc.get("items") or []
            stock = doc.get("stock") or []
            if not isinstance(items, list) or not isinstance(stock, list):
                raise ValueError("items and stock must both be lists")
            if len(items) > 500 or len(stock) > 5000:
                raise ValueError("that is far more rows than this list should ever hold")

            path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "frontend", "consumable-data.js")
            header = ""
            if os.path.exists(path):
                # keep the file's own explanation of itself at the top
                with open(path, encoding="utf-8") as fh:
                    for line in fh:
                        if line.startswith("window.CONSUMABLE_DATA"):
                            break
                        header += line

            body = header + "window.CONSUMABLE_DATA = {\n"
            body += '  updated: "%s",\n' % datetime.date.today().isoformat()
            body += "  items: [\n" + ",\n".join(
                "    " + json.dumps(it, ensure_ascii=False) for it in items) + "\n  ],\n"
            body += "  stock: [\n" + ",\n".join(
                "    " + json.dumps(st, ensure_ascii=False) for st in stock) + "\n  ]\n};\n"

            with open(path, "w", encoding="utf-8") as fh:
                fh.write(body)
            print("consumables saved — %d items, %d stock lines" % (len(items), len(stock)))
            self._json(200, {"ok": True, "items": len(items), "stock": len(stock)})
        except Exception as e:
            print("CONSUMABLES SAVE FAILED:", e)
            self._json(500, {"ok": False, "error": str(e)})

    def log_message(self, *args):
        pass                                   # the prints above are the log


if __name__ == "__main__":
    print("Tooling save endpoint on http://127.0.0.1:%d — writing to \"%s\"" % (PORT, T.TAB))
    print("Only the Tools section, and only rows whose item still matches.")
    if SYNC["on"]:
        print("Watching the sheet every %ds — frontend/tooling-data.js is rewritten when it moves."
              % SYNC_SECONDS)
        threading.Thread(target=sync_loop, daemon=True).start()
    else:
        print("Sheet watching is OFF (HF_TOOLING_SYNC_SECONDS=0) — the page shows a snapshot.")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
