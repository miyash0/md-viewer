# md

[![License: MIT](https://img.shields.io/github/license/miyash0/md-viewer)](LICENSE)
[![Python 3](https://img.shields.io/badge/python-3-3776AB?logo=python&logoColor=white)](main.py)
[![Last commit](https://img.shields.io/github/last-commit/miyash0/md-viewer)](https://github.com/miyash0/md-viewer/commits/main)

```sh
md README.md
```

Preview Markdown in your browser. Updates automatically when you save.

## Setup (once)

1. `cd frontend && npm install && npm run build && cd ..`
   - Without Node: `docker build -f frontend/Dockerfile --output frontend/dist frontend`
2. `ln -s "$PWD/main.py" ~/.local/bin/md`

After changing `frontend/`, run `npm run build` again.

## Usage

| Command | Opens |
|---|---|
| `md` | Current directory |
| `md FILE.md` | That file |
| `md DIR/` | `README.md` or `index.md`; a listing if neither exists |
| `-p 9000` | Port (default: first free port from 8000) |
| `--no-open` | Don't open the browser |

Supports GFM, math (KaTeX), Mermaid, syntax highlighting, GitHub alerts, and footnotes.

Listens on `127.0.0.1` only. Never serves files outside the root or files starting with `.`.

## Development

1. `python3 main.py frontend/e2e/fixtures -p 8000 --no-open`
2. In another terminal: `cd frontend && npm run dev`
3. Open `http://localhost:5173/_md/`

## Tests

```sh
python3 -m unittest discover -s tests   # server
cd frontend && npm test                 # unit
cd frontend && npm run e2e              # E2E (uses system Chrome)
```
