# =============================================================================
# Refresh frontend/tooling-data.js from the Google Sheet the office actually
# keeps ("HF Bored Piles Malaysia" -> "Master List (Updated)", Tools section).
#
#   python3 tools/pull-tooling.py
#
# The dashboard has no tooling table in the database yet, so the Tooling page
# reads a SNAPSHOT of that sheet. Re-run this whenever the sheet changes; the
# page shows the pull date so nobody mistakes an old snapshot for live stock.
# (tools/tooling-api.py re-runs it for you after it saves an edit.)
#
# Needs a Google service-account key with access to the sheet:
#   HF_SHEETS_KEY=/path/to/key.json python3 tools/pull-tooling.py
# =============================================================================
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tooling_sheet as T


def main():
    svc = T.service(readonly=True)
    rows, meta = T.read_tools(svc)
    opts = T.site_options(svc, rows)
    pulled = os.environ.get("HF_PULL_DATE") or datetime.date.today().isoformat()
    path, n = T.write_data_js(rows, meta, opts, pulled)
    print("wrote %s — %d tool rows (sheet rows %d-%d), %d site options"
          % (os.path.abspath(path), n, meta["firstRow"], meta["lastRow"], len(opts)))


if __name__ == "__main__":
    main()
