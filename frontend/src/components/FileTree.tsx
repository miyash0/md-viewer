import { useEffect, useState } from "preact/hooks";
import type { TreeNode } from "../types";

type Props = { tree: TreeNode[]; current: string | null; onNavigate(path: string): void };

function ancestors(path: string | null): string[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function FileTree({ tree, current, onNavigate }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(ancestors(current)));
  useEffect(() => {
    setOpen((prev) => new Set([...prev, ...ancestors(current)]));
  }, [current]);

  const toggle = (p: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(p)) next.add(p);
      return next;
    });

  const renderNodes = (nodes: TreeNode[]) => (
    <ul class="md-tree-list">
      {nodes.map((n) =>
        n.type === "dir" ? (
          <li key={n.path}>
            <button type="button" class="md-tree-dir" aria-expanded={open.has(n.path)} onClick={() => toggle(n.path)}>
              <span class="md-tree-caret" aria-hidden="true">{open.has(n.path) ? "▾" : "▸"}</span>
              {n.name}
            </button>
            {open.has(n.path) && renderNodes(n.children)}
          </li>
        ) : (
          <li key={n.path}>
            <button
              type="button"
              class="md-tree-file"
              aria-current={n.path === current ? "page" : undefined}
              title={n.path}
              onClick={() => onNavigate(n.path)}
            >
              {n.name}
            </button>
          </li>
        ),
      )}
    </ul>
  );

  return tree.length ? renderNodes(tree) : <p class="md-muted">Markdown がありません</p>;
}
