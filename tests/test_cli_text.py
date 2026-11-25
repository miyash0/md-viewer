import io
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import main  # noqa: E402

JAPANESE = re.compile(r"[぀-ヿ一-鿿]")


def run(fn, *a):
    out, err = io.StringIO(), io.StringIO()
    code = None
    with redirect_stdout(out), redirect_stderr(err):
        try:
            fn(*a)
        except SystemExit as e:
            code = e.code
    return code, out.getvalue(), err.getvalue()


class HelpTest(unittest.TestCase):
    def test_help_exits_0_with_examples(self):
        code, out, _ = run(main.parse_args, ["--help"])
        self.assertEqual(code, 0)
        self.assertIn("Preview Markdown in your browser.", out)
        self.assertIn("examples:", out)
        for line in ["md               open the current directory",
                     "md FILE.md       open FILE.md (root: its parent directory)",
                     "md DIR/          open DIR/README.md or DIR/index.md, or a listing",
                     "md -p 9000 DIR/  use port 9000 (fails if it is in use)"]:
            self.assertIn(line, out)

    def test_help_has_no_japanese(self):
        _, out, _ = run(main.parse_args, ["-h"])
        self.assertIsNone(JAPANESE.search(out), out)

    def test_help_works_without_build(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(main, "DIST_DIR", Path(d)):
            code, out, _ = run(main.main, ["--help"])
        self.assertEqual(code, 0)
        self.assertIn("usage: md", out)


class MessagesTest(unittest.TestCase):
    def assert_english(self, text):
        self.assertTrue(text.strip())
        self.assertIsNone(JAPANESE.search(text), text)

    def test_missing_path(self):
        code, _, err = run(main.resolve_target, "/nonexistent/x.md", Path("/"))
        self.assertEqual(code, 2)
        self.assertEqual(err.strip(), "md: not found: /nonexistent/x.md")

    def test_port_in_use(self):
        import socket
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        s.listen()
        self.addCleanup(s.close)
        port = s.getsockname()[1]
        code, _, err = run(main.bind_server, port, main.http.server.BaseHTTPRequestHandler)
        self.assertEqual(code, 1)
        self.assertEqual(err.strip(), f"md: port {port} is already in use")

    def test_not_built(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(main, "DIST_DIR", Path(d)):
            code, _, err = run(main.main, [d, "--no-open"])
        self.assertEqual(code, 1)
        self.assert_english(err)
        self.assertIn("npm run build", err)

    def test_root_md_warning(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "_md").mkdir()
            self.assert_english(main.root_warnings(Path(d))[0])

    def test_no_japanese_in_cli_strings(self):
        src = Path(main.__file__).read_text(encoding="utf-8")
        strings = re.findall(r'(?:print\(|help=|description=|epilog=)\s*f?"([^"]*)"', src)
        strings += re.findall(r'return \[f"([^"]*)"\]', src)
        self.assertTrue(strings)
        for s in strings:
            self.assertIsNone(JAPANESE.search(s), s)
