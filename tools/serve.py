#!/usr/bin/env python3
"""Static dev server for TREE.

Plain `python -m http.server` sends no Cache-Control, so browsers fall back to
heuristic caching and keep serving stale ES modules after an edit. This sends
no-store, which makes a plain reload always pick up the latest source.
"""
import argparse
import http.server
import socketserver
from functools import partial


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_request(self, code="-", size="-"):   # quieter: only non-2xx
        if not (isinstance(code, int) and 200 <= code < 300):
            super().log_request(code, size)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8123)
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--dir", default=".")
    a = ap.parse_args()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((a.bind, a.port), partial(Handler, directory=a.dir)) as httpd:
        print(f"TREE dev server on http://{a.bind}:{a.port}/  (no-store)")
        httpd.serve_forever()
