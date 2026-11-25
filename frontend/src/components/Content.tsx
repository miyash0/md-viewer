import { useEffect, useRef, useState } from "preact/hooks";
import { fetchRaw, NotFoundError } from "../api";
import { renderMarkdown } from "../render/markdown";
import { renderMermaid } from "../render/mermaid";
import type { TocItem, ViewState } from "../types";

type Props = {
  path: string | null;
  reloadToken: number;
  onToc(toc: TocItem[]): void;
  onState(s: ViewState): void;
};

const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

function useDark(): boolean {
  const [dark, setDark] = useState(() => !!darkQuery()?.matches);
  useEffect(() => {
    const q = darkQuery();
    if (!q) return;
    const on = () => setDark(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return dark;
}

export function Content({ path, reloadToken, onToc, onState }: Props) {
  const ref = useRef<HTMLElement>(null);
  const dark = useDark();
  const shown = useRef<string | null>(null); // 現在表示中のパス
  const seq = useRef(0);

  useEffect(() => {
    if (path == null) return;
    const my = ++seq.current;
    const isReload = shown.current === path;
    const scrollY = window.scrollY;
    onState({ phase: "loading", error: null, updatedAt: null });
    (async () => {
      let state: ViewState;
      try {
        const src = await fetchRaw(path);
        if (my !== seq.current || !ref.current) return;
        const { html, toc, hasMermaid } = renderMarkdown(src);
        const el = ref.current;
        el.innerHTML = html;
        if (hasMermaid) await renderMermaid(el, dark);
        if (my !== seq.current || !ref.current) return;
        window.scrollTo(0, isReload ? scrollY : 0);
        if (!isReload && location.hash) {
          document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
        }
        shown.current = path;
        onToc(toc);
        state = { phase: "ready", error: null, updatedAt: isReload ? Date.now() : null };
      } catch (e) {
        if (my !== seq.current || !ref.current) return;
        if (!isReload && ref.current) ref.current.innerHTML = "";
        const msg = e instanceof NotFoundError ? `ファイルが見つかりません: ${path}` : String(e instanceof Error ? e.message : e);
        state = { phase: "ready", error: msg, updatedAt: null };
      }
      onState(state);
    })();
    // パス変更やアンマウント後に届いた結果は捨てる
    return () => {
      seq.current++;
    };
    // onToc/onState は親の再描画ごとに変わりうるので依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reloadToken, dark]);

  return <article ref={ref} class="markdown-body md-content" />;
}
