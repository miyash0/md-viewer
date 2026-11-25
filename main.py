#!/usr/bin/env python3
"""md: ローカルの Markdown をブラウザでプレビューする。

~/.local/bin/md からこのファイルへのシンボリックリンクで起動する想定。
Python 標準ライブラリのみを使う。
"""
import argparse
import http.server
import os
import socket
import sys
from pathlib import Path

HOST = "127.0.0.1"
DEFAULT_PORT = 8000
PORT_SEARCH = 100
MD_EXTS = {".md", ".markdown"}
EXCLUDED_DIRS = {"node_modules", "__pycache__", "venv"}
INDEX_NAMES = ("README.md", "index.md")
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
    return name.startswith(".") or name in EXCLUDED_DIRS


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


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    resolve_target(args.path, Path.cwd())


if __name__ == "__main__":
    main()
