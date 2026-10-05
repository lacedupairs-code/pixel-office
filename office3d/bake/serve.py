"""Serves the 3D office locally the way the Pixel Office server does, for baking its lighting.

    python office3d/bake/serve.py <synty folder> [port]

Open http://127.0.0.1:8770/?bake=export&demo=1 and the page sends the building and its lights here;
they are saved in <synty folder>/baked/ (office-export.glb, office-lights.json) for build_office.py.
(POST /bake/shot-<name>.png saves a screenshot of the canvas there too, for checking a bake.)
Local only (127.0.0.1). The Synty folder is the owner's licensed copy: nothing here goes into git.
"""
import json
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SYNTY = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "private-assets", "synty")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8770
MOUNTS = [("/office/", os.path.join(ROOT, "office3d")), ("/synty/", SYNTY),
          ("/vendor/three/", os.path.join(ROOT, "node_modules", "three"))]
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("model/gltf-binary", ".glb")
mimetypes.add_type("model/gltf+json", ".gltf")


class Handler(BaseHTTPRequestHandler):
    def send(self, code, body=b"", kind="text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        for i in range(0, len(body), 65536):  # one big write can fail on Windows (no buffer space)
            self.wfile.write(body[i:i + 65536])

    def do_GET(self):
        url = self.path.split("?")[0]
        if url == "/api/office-config":
            return self.send(200, json.dumps({"syntyReady": True, "hqUrl": None}).encode(), "application/json")
        if url in ("/", "/index.html"):
            url = "/office/index.html"
        for prefix, folder in MOUNTS:
            if url.startswith(prefix):
                path = os.path.normpath(os.path.join(folder, url[len(prefix):].replace("%20", " ")))
                if path.startswith(os.path.normpath(folder)) and os.path.isfile(path):
                    with open(path, "rb") as f:
                        return self.send(200, f.read(), mimetypes.guess_type(path)[0] or "application/octet-stream")
        self.send(404, b"not found")

    def do_POST(self):
        m = re.fullmatch(r"/bake/(office-export\.glb|office-lights\.json|shot-[a-z0-9-]{1,40}\.png)", self.path)
        if not m:
            return self.send(400, b"bad name")
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        os.makedirs(os.path.join(SYNTY, "baked"), exist_ok=True)
        with open(os.path.join(SYNTY, "baked", m.group(1)), "wb") as f:
            f.write(body)
        self.send(200, b"saved")

    def log_message(self, *a):
        pass


print(f"office on http://127.0.0.1:{PORT}/  (Synty files: {SYNTY})", flush=True)
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
