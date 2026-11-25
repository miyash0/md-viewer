export type TreeNode =
  | { type: "file"; name: string; path: string }
  | { type: "dir"; name: string; path: string; children: TreeNode[] };

export type TreeResponse = { rootName: string; initial: string | null; tree: TreeNode[] };

export type TocItem = { level: number; id: string; text: string };

export type ViewState = { phase: "loading" | "ready"; error: string | null; updatedAt: number | null };
