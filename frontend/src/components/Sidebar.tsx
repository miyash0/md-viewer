import { useState } from "preact/hooks";
import type { TocItem, TreeNode } from "../types";
import { FileTree } from "./FileTree";
import { Toc } from "./Toc";

type Props = { tree: TreeNode[]; current: string | null; toc: TocItem[]; onNavigate(path: string): void };

const KEY = "md.sidebar";

function initialOpen(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "open") return true;
    if (saved === "closed") return false;
  } catch {
    /* ストレージが使えない環境では既定値 */
  }
  return !window.matchMedia?.("(max-width: 800px)").matches;
}

export function Sidebar({ tree, current, toc, onNavigate }: Props) {
  const [open, setOpen] = useState(initialOpen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? "open" : "closed");
    } catch {
      /* 保存できなくても動作は続ける */
    }
  };

  return (
    <>
      <button
        type="button"
        class="md-sidebar-toggle"
        aria-label="サイドバーを切り替え"
        aria-expanded={open}
        onClick={toggle}
      >
        ☰
      </button>
      {open && (
        <aside class="md-sidebar">
          <nav class="md-sidebar-pane" aria-label="ファイル">
            <h2 class="md-sidebar-heading">ファイル</h2>
            <FileTree tree={tree} current={current} onNavigate={onNavigate} />
          </nav>
          <nav class="md-sidebar-pane" aria-label="目次">
            <h2 class="md-sidebar-heading">目次</h2>
            <Toc toc={toc} />
          </nav>
        </aside>
      )}
    </>
  );
}
