# Local development server for the dashboard.
# Same as `python -m http.server` but sends no-cache headers, so the browser
# always fetches the latest files — no more stale-page confusion during dev.
# Run from anywhere:  python tools/serve.py   (serves ../frontend on :8123)
import http.server
import os

PORT = 8123
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    print(f"Serving {os.path.abspath(ROOT)} at http://localhost:{PORT} (no-cache)")
    http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler).serve_forever()
