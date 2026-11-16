#!/usr/bin/env python3
"""Serve the dashboard on the internal network, for testing on a real tablet or phone.

    uv run --no-project scripts/serve.py            # every interface, port 4173
    uv run --no-project scripts/serve.py --local    # this machine only

It serves the demo, which holds synthetic data only, so nothing real is exposed.
Do NOT use it for a live backend: without a login in front of it, anyone on the
network could control the house.

Standard library only. Responses are never cached, so the device always shows
the current files. The build information (Settings, About) is read from git on
each request, so it names the commit that is checked out.
"""

import argparse
import datetime
import http.server
import json
import pathlib
import socket
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "app" / "frontend"


def git(*args: str) -> str:
    """One line of git output, or an empty string outside a checkout."""
    try:
        out = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.SubprocessError):
        return ""
    return out.stdout.strip() if out.returncode == 0 else ""


def build_info() -> str:
    """The same shape scripts/build-info.mjs writes for an image, read live from the checkout."""
    tags = [tag for tag in git("tag", "--points-at", "HEAD").splitlines() if tag.startswith("v")]
    info = {
        "version": json.loads((ROOT / "package.json").read_text())["version"],
        "channel": "dev",
        "commit": git("rev-parse", "--short=12", "HEAD"),
        "modified": bool(git("status", "--porcelain")),
        "tag": tags[0] if tags else "",
        "builtOn": datetime.date.today().isoformat(),
    }
    return f"export const BUILD = {json.dumps(info, indent=2)};\n"


def lan_address() -> str:
    """This machine's address on the internal network. Nothing is sent: a UDP socket only picks a route."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 9))  # a documentation address, never reached
        return probe.getsockname()[0]
    except OSError:
        return ""
    finally:
        probe.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/js/build-info.js":
            body = build_info().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--local", dest="loopback", action="store_true", help="listen on this machine only")
    args = parser.parse_args()

    host = "127.0.0.1" if args.loopback else "0.0.0.0"
    server = http.server.ThreadingHTTPServer((host, args.port), Handler)
    print(f"On this machine:  http://localhost:{args.port}")
    address = "" if args.loopback else lan_address()
    if address:
        print(f"On your network:  http://{address}:{args.port}   (open this on the tablet or phone)")
    elif not args.loopback:
        print("No network address found. Is this machine connected?")
    print("Demo data only. Stop with Ctrl+C.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
