# =============================================================================
# Shared Google-Sheets plumbing for the Tooling page.
#
#   pull-tooling.py   reads the sheet -> frontend/tooling-data.js
#   tooling-api.py    writes the page's edits back into the same sheet
#
# Both go through here so there is ONE definition of where the data lives, what
# a row means, and how a date is stored.
#
# THE DATE TRAP, since it will bite whoever touches this next: the spreadsheet's
# locale is en_US but the Last Movement Date column is FORMATTED d/m/yyyy. The
# cells hold real dates (serial numbers), not text. Writing "20/8/2026" with
# USER_ENTERED would make en_US read month 20, fail, and silently store TEXT in
# a date column. So dates are written as SERIAL NUMBERS with RAW, which no
# locale can misread, and the cell's own d/m/yyyy format displays them.
# =============================================================================
import datetime
import os
import re

# HF_TOOLING_SHEET_ID / HF_TOOLING_OUT exist so this can be pointed at a scratch
# spreadsheet and a scratch output file. The write path MUST be testable without
# a company sheet standing in as the test fixture.
SHEET_ID = os.environ.get("HF_TOOLING_SHEET_ID", "1OXWpedFHDfGy0J6qtDWGC4LaEUg3oWg2vSp487yVkq0")
TAB = os.environ.get("HF_TOOLING_TAB", "Master List (Updated)")
KEY = os.environ.get("HF_SHEETS_KEY",
                     os.path.expanduser("~/Downloads/yun-lounge-pos-system-cad4637b53f0.json"))
FRONTEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")

# columns, as the sheet has them
COL = {"desc": "B", "spec": "C", "code": "D", "qty": "E",
       "site": "F", "moved": "G", "remark": "H"}

EPOCH = datetime.date(1899, 12, 30)      # what a Google Sheets serial counts from


def service(readonly=True):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    scope = "https://www.googleapis.com/auth/spreadsheets" + (".readonly" if readonly else "")
    cred = service_account.Credentials.from_service_account_file(KEY, scopes=[scope])
    return build("sheets", "v4", credentials=cred)


def serial_to_iso(n):
    try:
        return (EPOCH + datetime.timedelta(days=int(n))).isoformat()
    except (TypeError, ValueError):
        return ""


def iso_to_serial(iso):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", (iso or "").strip())
    if not m:
        return None
    y, mo, d = (int(x) for x in m.groups())
    return (datetime.date(y, mo, d) - EPOCH).days


def read_tools(svc):
    """Every row of the Tools section, with the sheet row number it came from.

    Values come back UNFORMATTED so the date column arrives as the serial it
    really is — FORMATTED_VALUE would hand us "7/8/2026" and leave us guessing
    whether that is 7 August or 8 July."""
    got = svc.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range="'%s'!A1:H2000" % TAB,
        valueRenderOption="UNFORMATTED_VALUE").execute().get("values", [])

    # Find the "Tools" label rather than trusting a row number: the office adds
    # machinery above it and the whole section slides down.
    start = None
    for i, row in enumerate(got):
        if row and str(row[0]).strip().lower() == "tools":
            start = i + 1
            break
    if start is None:
        raise RuntimeError("Could not find the 'Tools' section label in %s" % TAB)

    rows, last = [], start
    for i in range(start, len(got)):
        r = (list(got[i]) + [""] * 8)[:8]
        desc = str(r[1]).strip()
        if not desc:
            continue                                  # blank spacer rows
        last = i + 1
        rows.append({"row": i + 1, "desc": desc, "spec": _txt(r[2]), "code": _txt(r[3]),
                     "qty": _txt(r[4]), "site": _txt(r[5]),
                     "moved": serial_to_iso(r[6]) if isinstance(r[6], (int, float)) else "",
                     "remark": _txt(r[7])})
    return rows, {"firstRow": start + 1, "lastRow": last}


def _txt(v):
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        v = int(v)
    return str(v).strip()


def site_options(svc, rows):
    """What the Site cell may be set to.

    The sheet's own dropdown, PLUS every value already present in the data. The
    two differ: the validation list was only ever re-applied to part of the
    column, so "Kemubu Kelantan" is on four rows but not in the list. Offering
    only the list would quietly drop those the first time anyone saved."""
    opts = []
    try:
        r = svc.spreadsheets().get(
            spreadsheetId=SHEET_ID, ranges=["'%s'!F%d" % (TAB, 60)], includeGridData=True,
            fields="sheets.data.rowData.values.dataValidation").execute()
        dv = r["sheets"][0]["data"][0]["rowData"][0]["values"][0].get("dataValidation")
        if dv:
            opts = [v.get("userEnteredValue", "") for v in dv["condition"].get("values", [])]
    except Exception:
        opts = []                                     # the data's own values still stand
    for r in rows:
        if r["site"] and r["site"] not in opts:
            opts.append(r["site"])
    return [o for o in opts if o]


def write_data_js(rows, meta, opts, pulled, path=None):
    import json
    path = path or os.environ.get("HF_TOOLING_OUT") or os.path.join(FRONTEND, "tooling-data.js")
    body = (
        "// GENERATED FILE — do not hand-edit. Run tools/pull-tooling.py to refresh.\n"
        "//\n"
        "// A snapshot of the office's own tooling record: the Google Sheet\n"
        '// "HF Bored Piles Malaysia" → "%s", the Tools section.\n'
        "//\n"
        "// It is a snapshot, not a feed. tooling.html prints the pull date, because an\n"
        "// inventory figure with no date on it is a rumour.\n"
        "//\n"
        "// Each row carries the SHEET ROW NUMBER it came from (last field). That is what\n"
        "// lets the page's edits go back to the right line — and tools/tooling-api.py\n"
        "// still re-checks the description and code before it writes, in case somebody\n"
        "// inserted a row in the meantime.\n"
        "//\n"
        "// Columns, in the sheet's own order:\n"
        "//   [ description, size/model, code, quantity, site, last movement (ISO), remark, sheet row ]\n"
        "window.TOOLING_DATA = {\n"
        '  source: "HF Bored Piles Malaysia → %s (Tools)",\n'
        '  pulled: "%s",\n'
        '  sheet: { tab: %s, firstRow: %d, lastRow: %d },\n'
        "  siteOptions: %s,\n"
        "  rows: [\n%s\n  ]\n};\n"
    ) % (TAB, TAB, pulled, json.dumps(TAB), meta["firstRow"], meta["lastRow"],
         json.dumps(opts, ensure_ascii=False),
         ",\n".join("    " + json.dumps([r["desc"], r["spec"], r["code"], r["qty"],
                                         r["site"], r["moved"], r["remark"], r["row"]],
                                        ensure_ascii=False) for r in rows))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(body)
    return path, len(rows)
