# Local development server WITH LIVE RELOAD.
#
# Same no-cache behaviour as tools/serve.py, plus: the browser refreshes itself
# whenever a file under frontend/ changes.
#   - edit styles.css      -> the stylesheet is hot-swapped in place (no reload,
#                             so you keep your login, scroll position and any
#                             open cards — this is what you want 90% of the time
#                             while pushing pixels around)
#   - edit .html / .js     -> full page reload
#
# The reload client is injected into the HTML *response*, never written to the
# files on disk — nothing about this leaks into the repo or into the GitHub
# Pages build. No dependencies, no build step; stdlib only, in keeping with the
# rest of this project.
#
# Run from anywhere:  python3 tools/serve-live.py   (serves ../frontend on :8123)
import http.server
import os
import queue
import threading
import time

PORT = 8123
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend"))
POLL_SECONDS = 0.4

# The page-side half of live reload. Injected before </body> on every HTML
# response. Kept in the same plain ES5 style as the rest of the frontend.
CLIENT_JS = """
(function () {
  if (window.__hfLiveReload) return;          // survives double-injection
  window.__hfLiveReload = true;
  var es = new EventSource("/__livereload");
  es.onmessage = function (e) {
    if (e.data === "css") {                   // swap stylesheets, keep the page
      var links = document.querySelectorAll('link[rel="stylesheet"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute("href");
        if (!href) continue;
        links[i].setAttribute("href", href.split("?")[0] + "?live=" + Date.now());
      }
      return;
    }
    // A page can refuse a reload while it is holding something the user has
    // not saved. It matters now that tooling-data.js is rewritten on its own
    // whenever the spreadsheet moves: a reload arriving mid-edit would take
    // twenty typed changes with it and leave nothing on screen to say so.
    if (window.__hfHoldReload) {
      try {
        if (window.__hfHoldReload()) {
          window.__hfReloadPending = true;    // the page can offer it later
          if (window.__hfOnHeldReload) window.__hfOnHeldReload();
          return;
        }
      } catch (err) { /* a page that throws here still gets its reload */ }
    }
    window.location.reload();
  };
})();
"""

# ---------------------------- subscriber registry ----------------------------
# One queue per connected browser tab.

_subs = []
_subs_lock = threading.Lock()


def broadcast(kind):
    with _subs_lock:
        targets = list(_subs)
    for q in targets:
        try:
            q.put_nowait(kind)
        except Exception:
            pass


# --------------------------------- watcher -----------------------------------
# Polling (0.4s) rather than fsevents: no dependency, and frontend/ is ~25 files.


def snapshot():
    out = {}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fn in filenames:
            if fn.startswith("."):
                continue
            p = os.path.join(dirpath, fn)
            try:
                out[p] = os.stat(p).st_mtime_ns
            except OSError:
                pass
    return out


def watch():
    prev = snapshot()
    while True:
        time.sleep(POLL_SECONDS)
        cur = snapshot()
        changed = set(p for p in cur if prev.get(p) != cur[p])
        changed |= set(p for p in prev if p not in cur)
        if changed:
            names = sorted(os.path.relpath(p, ROOT) for p in changed)
            # CSS-only edits hot-swap; anything else needs a real reload
            kind = "css" if all(n.endswith(".css") for n in names) else "reload"
            print("  changed: " + ", ".join(names) + "  -> " + kind, flush=True)
            broadcast(kind)
        prev = cur


# --------------------------------- handler -----------------------------------


class LiveHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "__livereload" in self.path:
            return                                    # don't narrate the event stream
        super().log_message(fmt, *args)

    def do_GET(self):
        if self.path.split("?")[0] == "/__livereload":
            return self.serve_events()
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, "index.html")
        if path.endswith(".html") and os.path.isfile(path):
            return self.serve_html(path)
        return super().do_GET()

    def serve_html(self, path):
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_error(404, "File not found")

        inject = ("<script>" + CLIENT_JS + "</script>").encode("utf-8")
        at = body.lower().rfind(b"</body>")
        body = body + inject if at == -1 else body[:at] + inject + body[at:]

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_events(self):
        q = queue.Queue()
        with _subs_lock:
            _subs.append(q)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    kind = q.get(timeout=15)
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")   # keep the connection warm
                    self.wfile.flush()
                    continue
                self.wfile.write(("data: " + kind + "\n\n").encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass                                      # tab closed — normal
        finally:
            with _subs_lock:
                if q in _subs:
                    _subs.remove(q)


if __name__ == "__main__":
    threading.Thread(target=watch, daemon=True).start()
    print("Serving " + ROOT + " at http://localhost:" + str(PORT), flush=True)
    print("Live reload ON — watching frontend/ (CSS hot-swaps, HTML/JS reloads)", flush=True)
    http.server.ThreadingHTTPServer(("", PORT), LiveHandler).serve_forever()
