# md ビューア改良 設計

2026-11-25 の grilling セッションで合意した内容。

## 全体構成

- サーバー: `main.py`。Python 標準ライブラリのみ。`~/.local/bin/md` へのシンボリックリンクで起動する形を維持する。
- フロントエンド: `frontend/`（Preact + TypeScript + Vite）。`main.py` はシンボリックリンクを辿って実体の隣の `frontend/dist/` を配信する。
- `dist/` はコミットしない（`npm run build` で生成）。無ければ起動時に「`cd <repo>/frontend && npm install && npm run build` を実行して」と表示して終了する。
- 描画ライブラリ: markdown-it / KaTeX / Mermaid / highlight.js を npm で同梱（lockfile で版固定、オフライン動作）。Mermaid は図があるページでのみ動的 import。
- git 管理する（作業前に `git init`、現状を初期コミット）。

## CLI

- `md FILE` → 親ディレクトリをルートに、そのファイルを開く。
- `md DIR` → そのディレクトリをルートに。`README.md` → `index.md` の順で存在するものを開く。無ければ一覧。
- `md`（引数なし）→ カレントディレクトリをルートに。
- `-p/--port`: 未指定なら 8000 から順に空きを探す。指定時はそのポートのみ、使用中ならエラー。
- ブラウザを自動で開く。`--no-open` で抑止。
- 待ち受けは `127.0.0.1` のみ。

## サーバー動作

- ルート以下のファイルを静的配信（相対パスの画像・リンクが動く）。ルート外は拒否。
- mtime 監視 → SSE でブラウザへ通知（ファイル変更・ツリー変化）。
- ツリーは `.md` / `.markdown` のみ。`.` 始まり、`node_modules`、`.venv` 等は除外。`.gitignore` は解釈しない。

## UI

- 左サイドバー: 上にファイルツリー、下に目次（各自スクロール）。サイドバー全体を折りたたみ可、状態は localStorage。狭い画面では初期非表示。
- 別 .md への移動はページ内切替。URL は `/docs/foo.md` のように変わり、戻るボタンが効く。
- ライブリロードは本文のみ再描画、スクロール位置保持。
- 状態表示: 描画中 / 更新検知 / サーバー切断（再起動で自動復帰）/ エラー（Mermaid 構文エラー、ファイル削除等）。
- ダークモード（OS 追従、Mermaid テーマも連動）、highlight.js によるコードハイライト。
- 記法: GFM + 数式（構文として解析し `_` 問題を解消）+ GitHub アラート + 脚注 + GitHub 互換見出しアンカー。

## 開発・テスト

- `npm run dev`: Vite HMR。API とユーザーファイルは Python サーバーへプロキシ。
- テスト3層: Python unittest（サーバー）、vitest（変換・コンポーネント）、Playwright Test（実際に `md` を起動する E2E、システム Chrome `channel: 'chrome'`）。
- README: インストール、使い方、オプション、対応記法、開発・テスト手順。
