import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import main  # noqa: E402

JP = "docs/日本語 ファイル.md"
JP_URL = urllib.parse.quote(JP)
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 16
INDEX = b"<!doctype html><title>fake spa</title>"


class ServerCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        base = Path(self._tmp.name).resolve()
        self.root = base / "root"
        (self.root / "docs").mkdir(parents=True)
        (self.root / "img").mkdir()
        (self.root / "README.md").write_text("# hello", encoding="utf-8")
        (self.root / JP).write_text("# 日本語", encoding="utf-8")
        (self.root / "img/a.png").write_bytes(PNG)
        (base / "secret").write_text("secret")
        self.dist = base / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_bytes(INDEX)
        self.watcher = main.Watcher(self.root, interval=0.05)
        self.watcher.start()
        handler = main.make_handler(self.root, "README.md", self.watcher, self.dist)
        self.srv = main.bind_server(None, handler)
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.watcher.stop()
        self._tmp.cleanup()

    def get(self, path, accept=None):
        req = urllib.request.Request(self.base + path)
        if accept:
            req.add_header("Accept", accept)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.headers.get("Content-Type", ""), r.read()
        except urllib.error.HTTPError as e:
            with e:
                return e.code, e.headers.get("Content-Type", ""), e.read()

    HTML = "text/html,application/xhtml+xml,*/*;q=0.8"

    def test_html_navigation_returns_spa(self):
        self.assertEqual(self.get("/" + JP_URL, self.HTML)[2], INDEX)

    def test_root_and_dir_html_return_spa(self):
        self.assertEqual(self.get("/", self.HTML)[2], INDEX)
        self.assertEqual(self.get("/docs/", self.HTML)[2], INDEX)

    def test_static_file(self):
        status, ctype, body = self.get("/img/a.png", self.HTML)
        self.assertEqual((status, ctype, body), (200, "image/png", PNG))

    def test_md_without_html_accept_is_raw(self):
        self.assertEqual(self.get("/README.md")[2], b"# hello")

    def test_dist_asset(self):
        self.assertEqual(self.get("/_md/index.html")[2], INDEX)

    def test_dist_outside_403(self):
        self.assertEqual(self.get("/_md/%2e%2e/secret")[0], 403)

    def test_api_tree(self):
        status, ctype, body = self.get("/_md/api/tree")
        data = json.loads(body)
        self.assertEqual(status, 200)
        self.assertIn("application/json", ctype)
        self.assertEqual(data["rootName"], "root")
        self.assertEqual(data["initial"], "README.md")
        docs = [n for n in data["tree"] if n["type"] == "dir"][0]
        self.assertEqual(docs["children"][0]["path"], JP)

    def test_api_raw_unicode(self):
        status, ctype, body = self.get("/_md/api/raw?path=" + urllib.parse.quote(JP, safe=""))
        self.assertEqual((status, body.decode()), (200, "# 日本語"))
        self.assertIn("charset=utf-8", ctype)

    def test_api_raw_outside_root_403(self):
        self.assertEqual(self.get("/_md/api/raw?path=../secret")[0], 403)
        self.assertEqual(self.get("/_md/api/raw?path=%2e%2e%2fsecret")[0], 403)

    def test_static_outside_root_403(self):
        self.assertEqual(self.get("/%2e%2e/secret")[0], 403)

    def test_missing_404(self):
        self.assertEqual(self.get("/_md/api/raw?path=nope.md")[0], 404)
        self.assertEqual(self.get("/nope.png")[0], 404)

    def test_sse_endpoint_streams(self):
        r = urllib.request.urlopen(self.base + "/_md/api/events", timeout=5)
        self.assertIn("text/event-stream", r.headers["Content-Type"])
        time.sleep(0.2)
        p = self.root / "README.md"
        p.write_text("# changed", encoding="utf-8")
        os.utime(p, ns=(time.time_ns() + 10**9,) * 2)
        deadline = time.time() + 3
        lines = []
        while time.time() < deadline:
            line = r.readline().decode().strip()
            lines.append(line)
            if line.startswith("data:") and "README.md" in line and "event: change" in lines:
                break
        r.close()
        self.assertIn("event: change", lines)
        self.assertIn('data: {"path": "README.md"}', lines)


class WatcherTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name).resolve()
        (self.root / "README.md").write_text("a")
        self.w = main.Watcher(self.root, interval=0.05)
        self.w.start()
        self.q = self.w.subscribe()
        time.sleep(0.15)

    def tearDown(self):
        self.w.stop()
        self._tmp.cleanup()

    def wait_for(self, kind, pred, timeout=2):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                k, data = self.q.get(timeout=0.1)
            except Exception:
                continue
            if k == kind and pred(data):
                return data
        self.fail(f"no {kind} event")

    def bump(self, p):
        os.utime(p, ns=(time.time_ns() + 10**9,) * 2)

    def test_change_event(self):
        p = self.root / "README.md"
        p.write_text("b")
        self.bump(p)
        self.wait_for("change", lambda d: d == {"path": "README.md"})

    def test_tree_event_on_new_file(self):
        (self.root / "new.md").write_text("n")
        self.wait_for("tree", lambda d: any(n["path"] == "new.md" for n in d["tree"]))

    def test_atomic_save_is_change(self):
        tmp = self.root / ".README.md.swp"
        tmp.write_text("c")
        self.bump(tmp)
        os.replace(tmp, self.root / "README.md")
        self.wait_for("change", lambda d: d == {"path": "README.md"})

    def test_unsubscribe(self):
        self.w.unsubscribe(self.q)
        self.assertNotIn(self.q, self.w._subs)


class MainTest(unittest.TestCase):
    def test_main_without_dist_exits(self):
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(main, "DIST_DIR", Path(d)), \
                mock.patch("sys.stderr"), self.assertRaises(SystemExit) as cm:
            main.main([d, "--no-open"])
        self.assertEqual(cm.exception.code, 1)

    def test_url_line(self):
        self.assertEqual(main.start_url(8001, "docs/日本語 ファイル.md"),
                         "http://127.0.0.1:8001/docs/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB.md")
        self.assertEqual(main.start_url(8000, None), "http://127.0.0.1:8000/")


if __name__ == "__main__":
    unittest.main()


class HardeningTest(ServerCase):
    def get_host(self, path, host, accept=None):
        import http.client
        c = http.client.HTTPConnection("127.0.0.1", self.srv.server_address[1], timeout=5)
        headers = {"Host": host}
        if accept:
            headers["Accept"] = accept
        c.request("GET", path, headers=headers)
        r = c.getresponse()
        body = r.read()
        c.close()
        return r.status, r.headers, body

    def test_foreign_host_rejected(self):
        self.assertEqual(self.get_host("/README.md", "evil.example:%d" % self.srv.server_address[1])[0], 403)

    def test_localhost_hosts_allowed(self):
        port = self.srv.server_address[1]
        self.assertEqual(self.get_host("/README.md", f"127.0.0.1:{port}")[0], 200)
        self.assertEqual(self.get_host("/README.md", f"localhost:{port}")[0], 200)

    def test_dotfiles_not_served(self):
        (self.root / ".env").write_text("SECRET=1")
        (self.root / ".ssh").mkdir()
        (self.root / ".ssh/id_rsa").write_text("key")
        self.assertEqual(self.get("/.env")[0], 404)
        self.assertEqual(self.get("/.ssh/id_rsa")[0], 404)
        self.assertEqual(self.get("/_md/api/raw?path=.env")[0], 404)

    def test_spa_has_csp(self):
        port = self.srv.server_address[1]
        _, headers, _ = self.get_host("/README.md", f"127.0.0.1:{port}", self.HTML)
        csp = headers["Content-Security-Policy"]
        self.assertIn(f"script-src http://127.0.0.1:{port}/_md/", csp)
        self.assertIn("connect-src 'self'", csp)
        self.assertIn("object-src 'none'", csp)

    def test_user_files_are_sandboxed(self):
        (self.root / "evil.html").write_text("<script>fetch('/_md/api/raw?path=README.md')</script>")
        _, headers, _ = self.get_host("/evil.html", f"127.0.0.1:{self.srv.server_address[1]}", self.HTML)
        self.assertEqual(headers["Content-Security-Policy"], "sandbox")

    def test_non_utf8_filename_does_not_break_tree(self):
        os.close(os.open(os.fsencode(self.root) + b"/bad\xff.md", os.O_CREAT | os.O_WRONLY))
        status, _, body = self.get("/_md/api/tree")
        self.assertEqual(status, 200)
        names = [n["name"] for n in json.loads(body)["tree"]]
        self.assertIn("README.md", names)
        self.assertFalse([n for n in names if n.startswith("bad")])


class HiddenInitialTest(unittest.TestCase):
    def test_initial_hidden_file_is_watched_and_served(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d).resolve()
            p = root / ".notes.md"
            p.write_text("a")
            w = main.Watcher(root, interval=0.05, extra=[".notes.md"])
            w.start()
            q = w.subscribe()
            time.sleep(0.15)
            p.write_text("b")
            os.utime(p, ns=(time.time_ns() + 10**9,) * 2)
            deadline = time.time() + 2
            got = None
            while time.time() < deadline and got is None:
                try:
                    k, data = q.get(timeout=0.1)
                except Exception:
                    continue
                if k == "change" and data == {"path": ".notes.md"}:
                    got = data
            w.stop()
            self.assertIsNotNone(got)


class AdaptiveIntervalTest(unittest.TestCase):
    def test_slow_snapshot_backs_off(self):
        self.assertEqual(main.next_interval(0.3, 0.01), 0.3)
        self.assertEqual(main.next_interval(0.3, 1.4), 2.8)
        self.assertEqual(main.next_interval(0.3, 30), 10.0)
