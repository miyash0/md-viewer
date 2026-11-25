import type { TocItem } from "../types";

export function Toc({ toc }: { toc: TocItem[] }) {
  if (!toc.length) return <p class="md-muted">見出しがありません</p>;
  const min = Math.min(...toc.map((t) => t.level));
  return (
    <ul class="md-toc-list">
      {toc.map((t) => (
        <li key={t.id} style={{ paddingLeft: `${(t.level - min) * 12}px` }}>
          <button
            type="button"
            class="md-toc-item"
            onClick={() => {
              document.getElementById(t.id)?.scrollIntoView();
              history.replaceState(history.state, "", `#${encodeURIComponent(t.id)}`);
            }}
          >
            {t.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
