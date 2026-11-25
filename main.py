#!/usr/bin/env python3
# ~/bin/md
import sys, http.server, pathlib

path = pathlib.Path(sys.argv[1])
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000

PAGE = """<!doctype html><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<link rel=stylesheet href="https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css">
<link rel=stylesheet href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
<body class=markdown-body style="max-width:860px;margin:2em auto;padding:0 1em">
<div id=c></div>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js"></script>
<script type=module>
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs";
const md = await (await fetch("/raw")).text();
const el = document.getElementById("c");
el.innerHTML = marked.parse(md);
el.querySelectorAll("code.language-mermaid").forEach(c => {
  const d = document.createElement("pre"); d.className = "mermaid";
  d.textContent = c.textContent; c.parentElement.replaceWith(d);
});
renderMathInElement(el, {delimiters: [
  {left: "$$", right: "$$", display: true},
  {left: "$", right: "$", display: false}]});
mermaid.initialize({startOnLoad: false});
await mermaid.run();
</script>"""

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/raw":
            body, ctype = path.read_bytes(), "text/plain; charset=utf-8"
        else:
            body, ctype = PAGE.encode(), "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

print(f"http://localhost:{port}")
http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
