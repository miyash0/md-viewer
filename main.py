#!/usr/bin/env python3
"""md: ローカルの Markdown をブラウザでプレビューする。

~/.local/bin/md からこのファイルへのシンボリックリンクで起動する想定。
Python 標準ライブラリのみを使う。
"""
import argparse
import http.server
import json
import mimetypes
import os
import queue
import sys
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
DEFAULT_PORT = 8000
PORT_SEARCH = 100
MD_EXTS = {".md", ".markdown"}
EXCLUDED_DIRS = {"node_modules", "__pycache__", "venv"}
INDEX_NAMES = ("README.md", "index.md")
MAX_INTERVAL = 10.0
DIST_DIR = Path(__file__).resolve().parent / "frontend" / "dist"


def parse_args(argv):
    p = argparse.ArgumentParser(prog="md", description="Markdown をブラウザでプレビューする")
    p.add_argument("path", nargs="?", help="Markdown ファイルまたはディレクトリ（省略時はカレントディレクトリ）")
    p.add_argument("-p", "--port", type=int, help=f"ポート（省略時は {DEFAULT_PORT} から空きを探す）")
    p.add_argument("--no-open", action="store_true", help="ブラウザを開かない")
    return p.parse_args(argv)


def resolve_target(path, cwd):
    """(root, initial) を返す。initial はルート相対の '/' 区切りパスか None。"""
    target = (Path(cwd) / path) if path else Path(cwd)
    if not target.exists():
        print(f"見つかりません: {path}", file=sys.stderr)
        raise SystemExit(2)
    target = target.resolve()
    if target.is_file():
        return target.parent, target.name
    for name in INDEX_NAMES:
        if (target / name).is_file():
            return target, name
    return target, None


def safe_path(root, rel):
    """URL デコード済みの相対パスをルート配下に解決する。外を指すなら None。"""
    candidate = (root / rel.lstrip("/")).resolve()
    if candidate == root or root in candidate.parents:
        return candidate
    return None


def is_markdown(p):
    return Path(p).suffix.lower() in MD_EXTS


def _excluded(name):
    if name.startswith(".") or name in EXCLUDED_DIRS:
        return True
    try:
        name.encode("utf-8")  # UTF-8 でない名前（surrogateescape）は JSON にできないので扱わない
    except UnicodeEncodeError:
        return True
    return False


def next_interval(base, took):
    """走査に時間がかかるほど間隔を空ける（巨大ディレクトリで CPU を使い続けないため）。"""
    return min(MAX_INTERVAL, max(base, 2 * took))


def build_tree(root):
    """root 以下の Markdown を TreeNode のリストで返す。"""
    files_of = {}  # 相対ディレクトリ -> ファイルノード
    subdirs_of = {}  # 相対ディレクトリ -> 子ディレクトリ名
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not _excluded(d)]
        rel_dir = os.path.relpath(dirpath, root)
        rel_dir = "" if rel_dir == "." else rel_dir.replace(os.sep, "/")
        prefix = f"{rel_dir}/" if rel_dir else ""
        subdirs_of[rel_dir] = list(dirs)
        files_of[rel_dir] = [
            {"type": "file", "name": f, "path": prefix + f}
            for f in files if not _excluded(f) and is_markdown(f)
        ]

    def assemble(rel_dir):
        prefix = f"{rel_dir}/" if rel_dir else ""
        children = list(files_of.get(rel_dir, []))
        for name in subdirs_of.get(rel_dir, []):
            sub_children = assemble(prefix + name)
            if sub_children:
                children.append({"type": "dir", "name": name, "path": prefix + name,
                                 "children": sub_children})
        children.sort(key=lambda n: (n["type"] != "dir", n["name"].lower()))
        return children

    return assemble("")


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True


def bind_server(port, handler):
    if port is not None:
        try:
            return Server((HOST, port), handler)
        except OSError:
            print(f"ポート {port} は使用中です", file=sys.stderr)
            raise SystemExit(1)
    for p in range(DEFAULT_PORT, DEFAULT_PORT + PORT_SEARCH):
        try:
            return Server((HOST, p), handler)
        except OSError:
            continue
    print(f"空きポートが見つかりません（{DEFAULT_PORT}〜{DEFAULT_PORT + PORT_SEARCH - 1}）", file=sys.stderr)
    raise SystemExit(1)


def tree_response(root, initial):
    return {"rootName": root.name, "initial": initial, "tree": build_tree(root)}


def _md_paths(tree):
    for n in tree:
        if n["type"] == "dir":
            yield from _md_paths(n["children"])
        else:
            yield n["path"]


class Watcher:
    """root 以下の Markdown を定期的に stat し、変化を購読キューへ流す。"""

    def __init__(self, root, interval=0.3, extra=()):
        self.root = root
        self.interval = interval
        self.extra = [p for p in extra if p]  # ツリーに出ない初期ファイル（隠しファイルなど）も監視する
        self._subs = set()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None

    def subscribe(self):
        q = queue.Queue()
        with self._lock:
            self._subs.add(q)
        return q

    def unsubscribe(self, q):
        with self._lock:
            self._subs.discard(q)

    def _publish(self, kind, data):
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            q.put((kind, data))

    def _snapshot(self):
        tree = build_tree(self.root)
        mtimes = {}
        for p in [*_md_paths(tree), *self.extra]:
            try:
                mtimes[p] = (self.root / p).stat().st_mtime_ns
            except OSError:
                pass
        return tree, mtimes

    def _run(self):
        _, prev = self._snapshot()
        wait = self.interval
        while not self._stop.wait(wait):
            started = time.monotonic()
            try:
                tree, cur = self._snapshot()
            except OSError:
                continue
            wait = next_interval(self.interval, time.monotonic() - started)
            for p, m in cur.items():
                if prev.get(p) != m:  # 変更、または一度消えて再出現（atomic save）
                    self._publish("change", {"path": p})
            if {p for p in cur if p not in self.extra} != {p for p in prev if p not in self.extra}:
                self._publish("tree", {"rootName": self.root.name, "initial": None, "tree": tree})
            prev = cur

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._publish(None, None)  # SSE ハンドラを終わらせる


def make_handler(root, initial, watcher, dist):
    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def _send(self, status, body, ctype, headers=()):
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            for k, v in headers:
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)

        def _error(self, status):
            self._send(status, f"{status}\n".encode(), "text/plain; charset=utf-8")

        def _file(self, p, headers=()):
            if p is None:
                return self._error(403)
            if p.is_dir() and (p / "index.html").is_file() and p == dist:
                p = p / "index.html"
            if not p.is_file():
                return self._error(404)
            ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            if ctype.startswith("text/") or is_markdown(p):
                ctype = ("text/plain" if is_markdown(p) else ctype) + "; charset=utf-8"
            self._send(200, p.read_bytes(), ctype, headers)

        def _spa(self):
            # Markdown 内の生 HTML からのスクリプト実行と外部送信を防ぐ
            csp = (f"default-src 'self'; script-src http://{self.headers['Host']}/_md/; "
                   "style-src 'self' 'unsafe-inline'; img-src * data: blob:; font-src 'self' data:; "
                   "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            return self._file(dist / "index.html", [("Content-Security-Policy", csp)])

        def _hidden(self, rel):
            rel = rel.strip("/")
            return rel != initial and any(part.startswith(".") for part in rel.split("/"))

        def do_GET(self):
            port = self.server.server_address[1]
            if self.headers.get("Host") not in (f"{HOST}:{port}", f"localhost:{port}"):
                return self._error(403)  # DNS リバインディング対策
            url = urllib.parse.urlsplit(self.path)
            path = urllib.parse.unquote(url.path)
            if path.startswith("/_md/api/"):
                return self._api(path[len("/_md/api/"):], urllib.parse.parse_qs(url.query))
            if path == "/_md" or path.startswith("/_md/"):
                return self._file(safe_path(dist, path[len("/_md"):]))
            target = safe_path(root, path)
            if target is None:
                return self._error(403)
            wants_html = "text/html" in self.headers.get("Accept", "")
            if wants_html and (target.is_dir() or is_markdown(target)):
                return self._spa()
            if self._hidden(path):
                return self._error(404)
            # ユーザーのファイル（.html や .svg を含む）は直接開かれてもスクリプトを実行させない
            return self._file(target, [("Content-Security-Policy", "sandbox")])

        def _api(self, name, qs):
            if name == "tree":
                body = json.dumps(tree_response(root, initial), ensure_ascii=False).encode()
                return self._send(200, body, "application/json; charset=utf-8")
            if name == "raw":
                rel = qs.get("path", [""])[0]
                p = safe_path(root, rel)
                if p is None:
                    return self._error(403)
                if self._hidden(rel):
                    return self._error(404)
                return self._file(p) if p.is_file() else self._error(404)
            if name == "events":
                return self._events()
            return self._error(404)

        def _events(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            q = watcher.subscribe()
            self.close_connection = True
            try:
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()
                while True:
                    try:
                        kind, data = q.get(timeout=15)
                    except queue.Empty:
                        msg = ": ping\n\n"
                    else:
                        if kind is None:
                            return
                        msg = f"event: {kind}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                    self.wfile.write(msg.encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                watcher.unsubscribe(q)

    return Handler


def start_url(port, initial):
    return f"http://{HOST}:{port}/" + (urllib.parse.quote(initial) if initial else "")


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if not (DIST_DIR / "index.html").is_file():
        print(f"フロントエンドが未ビルドです。cd {DIST_DIR.parent} && npm install && npm run build を実行してください",
              file=sys.stderr)
        raise SystemExit(1)
    root, initial = resolve_target(args.path, Path.cwd())
    watcher = Watcher(root, extra=[initial])
    srv = bind_server(args.port, make_handler(root, initial, watcher, DIST_DIR))
    watcher.start()
    url = start_url(srv.server_address[1], initial)
    print(url, flush=True)
    if not args.no_open:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        watcher.stop()
        srv.server_close()


if __name__ == "__main__":
    main()
