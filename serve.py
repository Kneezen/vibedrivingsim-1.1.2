#!/usr/bin/env python3
"""Simple HTTP server with no-cache headers to prevent browser caching."""
import http.server
import sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    server = http.server.HTTPServer(('0.0.0.0', port), NoCacheHandler)
    print(f'Serving on port {port} (no-cache)')
    server.serve_forever()
