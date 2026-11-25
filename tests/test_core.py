import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import main  # noqa: E402


class TmpDirCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.d = Path(self._tmp.name).resolve()

    def tearDown(self):
        self._tmp.cleanup()

    def touch(self, rel, text="x"):
        p = self.d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        return p


class ResolveTarget(TmpDirCase):
    def test_file_uses_parent_as_root(self):
        f = self.touch("a.md")
        self.assertEqual(main.resolve_target(str(f), Path("/")), (self.d, "a.md"))

    def test_dir_prefers_readme_then_index(self):
        self.touch("index.md")
        self.assertEqual(main.resolve_target(str(self.d), Path("/")), (self.d, "index.md"))
        self.touch("README.md")
        self.assertEqual(main.resolve_target(str(self.d), Path("/")), (self.d, "README.md"))

    def test_dir_without_readme(self):
        self.touch("other.md")
        self.assertEqual(main.resolve_target(str(self.d), Path("/")), (self.d, None))

    def test_none_uses_cwd(self):
        self.touch("README.md")
        self.assertEqual(main.resolve_target(None, self.d), (self.d, "README.md"))

    def test_relative_path_against_cwd(self):
        self.touch("sub/a.md")
        self.assertEqual(main.resolve_target("sub/a.md", self.d), (self.d / "sub", "a.md"))

    def test_missing_path_exits_2(self):
        with mock.patch("sys.stderr"), self.assertRaises(SystemExit) as cm:
            main.resolve_target(str(self.d / "nope.md"), Path("/"))
        self.assertEqual(cm.exception.code, 2)


class SafePath(TmpDirCase):
    def test_inside(self):
        self.touch("docs/a.md")
        self.assertEqual(main.safe_path(self.d, "docs/a.md"), self.d / "docs/a.md")

    def test_root_itself(self):
        self.assertEqual(main.safe_path(self.d, ""), self.d)

    def test_dotdot(self):
        self.assertIsNone(main.safe_path(self.d, "../x"))
        self.assertIsNone(main.safe_path(self.d, "docs/../../x"))

    def test_absolute_is_relative_to_root(self):
        self.touch("a.md")
        self.assertEqual(main.safe_path(self.d, "/a.md"), self.d / "a.md")
        self.assertIsNone(main.safe_path(self.d, "/../etc/passwd"))

    def test_symlink_outside(self):
        with tempfile.TemporaryDirectory() as outside:
            Path(outside, "f.md").write_text("secret")
            os.symlink(outside, self.d / "link")
            self.assertIsNone(main.safe_path(self.d, "link/f.md"))

    def test_unicode_and_space(self):
        self.touch("日本語 ファイル.md")
        self.assertEqual(main.safe_path(self.d, "日本語 ファイル.md"), self.d / "日本語 ファイル.md")


class BuildTree(TmpDirCase):
    def test_only_markdown_and_sorting(self):
        for f in ["B.md", "a.markdown", "z.txt", "sub/c.md", "empty/x.txt"]:
            self.touch(f)
        self.assertEqual(main.build_tree(self.d), [
            {"type": "dir", "name": "sub", "path": "sub",
             "children": [{"type": "file", "name": "c.md", "path": "sub/c.md"}]},
            {"type": "file", "name": "a.markdown", "path": "a.markdown"},
            {"type": "file", "name": "B.md", "path": "B.md"},
        ])

    def test_uppercase_extension(self):
        self.touch("NOTES.MD")
        self.assertEqual([n["name"] for n in main.build_tree(self.d)], ["NOTES.MD"])

    def test_excluded_dirs_not_descended(self):
        for f in [".git/a.md", "node_modules/p/a.md", "__pycache__/a.md", "venv/a.md", ".hidden.md", "ok.md"]:
            self.touch(f)
        real_walk = os.walk
        seen = []

        def spy(*a, **k):
            for dirpath, dirs, files in real_walk(*a, **k):
                seen.append(dirpath)
                yield dirpath, dirs, files

        with mock.patch("main.os.walk", spy):
            tree = main.build_tree(self.d)
        self.assertEqual(tree, [{"type": "file", "name": "ok.md", "path": "ok.md"}])
        self.assertFalse([s for s in seen if "node_modules" in s or ".git" in s])


class BindServer(unittest.TestCase):
    def _busy(self, port):
        s = socket.socket()
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", port))
        s.listen()
        self.addCleanup(s.close)
        return s

    def test_auto_skips_busy_port(self):
        try:
            self._busy(8000)
        except OSError:
            pass  # already busy by something else: still busy
        srv = main.bind_server(None, main.http.server.BaseHTTPRequestHandler)
        self.addCleanup(srv.server_close)
        self.assertGreater(srv.server_address[1], 8000)
        self.assertEqual(srv.server_address[0], "127.0.0.1")

    def test_explicit_busy_exits_1(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        s.listen()
        self.addCleanup(s.close)
        port = s.getsockname()[1]
        with mock.patch("sys.stderr"), self.assertRaises(SystemExit) as cm:
            main.bind_server(port, main.http.server.BaseHTTPRequestHandler)
        self.assertEqual(cm.exception.code, 1)


class ParseArgs(unittest.TestCase):
    def test_defaults(self):
        a = main.parse_args([])
        self.assertEqual((a.path, a.port, a.no_open), (None, None, False))

    def test_flags(self):
        a = main.parse_args(["docs", "-p", "9000", "--no-open"])
        self.assertEqual((a.path, a.port, a.no_open), ("docs", 9000, True))


if __name__ == "__main__":
    unittest.main()
