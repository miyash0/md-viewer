import { toUrl } from "../nav";
import type { TreeNode } from "../types";

type Props = { title: string; nodes: TreeNode[] | null; onNavigate(path: string): void };

export function DirectoryListing({ title, nodes, onNavigate }: Props) {
  return (
    <article class="markdown-body md-content">
      <h1>{title}</h1>
      {nodes == null ? (
        <p>このディレクトリには Markdown がありません。</p>
      ) : (
        <ul aria-label={`${title} の Markdown`}>
          {nodes.map((n) => (
            <li key={n.path}>
              <a
                href={toUrl(n.path)}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(n.path);
                }}
              >
                {n.type === "dir" ? `${n.name}/` : n.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
