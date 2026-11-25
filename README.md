# md

ローカルの Markdown をブラウザでプレビューするツール。保存すると表示が自動で更新され、ディレクトリ内の Markdown をサイドバーから行き来できる。

- サーバー: `main.py`（Python 3 標準ライブラリのみ）
- 画面: `frontend/`（Preact + TypeScript + Vite）。描画ライブラリはすべて同梱しているので、オフラインでも動く

## インストール

```sh
cd frontend && npm install && npm run build && cd ..
ln -s "$PWD/main.py" ~/.local/bin/md
```

`main.py` はシンボリックリンクを辿って自分の場所を探し、隣の `frontend/dist/` を配信する。`frontend/` を更新したら `npm run build` を実行し直すこと。ビルドされていないときは、起動時にそう表示して終了する。

## 使い方

```sh
md                 # カレントディレクトリをルートにして開く
md README.md       # ファイルの親ディレクトリをルートにして、そのファイルを開く
md docs/           # docs/ をルートにして開く（README.md → index.md の順で探し、無ければ一覧）
md -p 9000 docs/   # ポートを指定する（使用中ならエラー）
md --no-open       # ブラウザを開かない
```

- ポートを指定しないときは 8000 から順に空いているポートを探す。
- 待ち受けるのは `127.0.0.1` だけ。ルートの外にあるファイルと、`.` で始まるファイル・ディレクトリ（起動時に指定したファイルは除く）は配信しない。
- Markdown 内の生 HTML は表示されるが、スクリプトは CSP で止める（他人のリポジトリの README を開いても、手元のファイルを読まれたり外へ送られたりしない）。
- 起動すると URL を表示し、ブラウザでそのページを開く。`Ctrl-C` で終了する。

## 画面

- **左サイドバー**: 上にファイルツリー、下に目次。`☰` ボタンで隠せて、その状態は次回も引き継がれる。幅の狭い画面では、最初は隠れている。
- **ファイルツリー**: `.md` と `.markdown` だけを表示する。`.` で始まるもの、`node_modules`、`__pycache__`、`venv` は除外する。
- **ライブリロード**: ファイルを保存すると本文だけを描き直し、スクロール位置はそのまま保つ。vim などの「一時ファイルに書いてから rename する」保存方法でも反映される。
- **画面遷移**: ツリーや本文のリンクから別の `.md` へ移動すると、ページ内で表示が切り替わる。URL も変わるので、ブラウザの戻る・進むが使える。
- **状態表示**（右下）: 「描画中…」「更新しました」「サーバーとの接続が切れました」、エラー（ファイルが見つからない、Mermaid の構文エラーなど）。サーバーを再起動すると、自動で接続し直す。
- **ダークモード**: OS の設定に合わせて切り替わる。Mermaid の図も同じテーマになる。

## 対応している記法

- GFM（表、取り消し線、タスクリスト、自動リンク）
- 数式（KaTeX）: `$a_1 + b_2$`、`$$ ... $$`
- Mermaid: ` ```mermaid ` のコードブロック
- コードのシンタックスハイライト（highlight.js の主要言語）
- GitHub アラート: `> [!NOTE]`、`> [!TIP]`、`> [!IMPORTANT]`、`> [!WARNING]`、`> [!CAUTION]`
- 脚注: `[^1]`
- 見出しアンカー（GitHub と同じ形式の id。`#見出し` のリンクで飛べる）
- 相対パスの画像とリンク

## 開発

フロントエンドを HMR で開発するときは、端末を2つ使う。

```sh
python3 main.py frontend/e2e/fixtures -p 8000 --no-open   # 端末1: md サーバー
cd frontend && npm run dev                                 # 端末2: Vite
```

`http://localhost:5173/_md/` を開く。Vite は `/_md/api/` とユーザーのファイルへのリクエストを md サーバーへ転送する。転送先のポートは環境変数 `MD_BACKEND_PORT` で変えられる（既定は 8000）。

構成:

| パス | 役割 |
|---|---|
| `main.py` | CLI、ファイル配信、`/_md/api/{tree,raw,events}`、mtime の監視と SSE による通知 |
| `frontend/src/render/` | Markdown の変換（markdown-it とプラグイン）、Mermaid の描画 |
| `frontend/src/components/` | 画面（App、Sidebar、FileTree、Toc、Content、StatusIndicator、DirectoryListing） |
| `frontend/src/api.ts`, `nav.ts` | API クライアント、URL とリンクの解決 |

## テスト

```sh
python3 -m unittest discover -s tests   # サーバー
cd frontend && npm test                 # フロントエンドの単体テスト（vitest）
cd frontend && npm run e2e              # E2E（ビルドしてから Playwright で実行。システムの Chrome を使う）
```
