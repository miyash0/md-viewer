import type { TreeNode } from "./types";

const ORIGIN = "http://md.invalid";

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

export function toUrl(path: string): string {
  return "/" + path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // 不正な % はそのまま扱う
  }
}

export function pathFromLocation(pathname: string): string {
  return safeDecode(pathname).replace(/^\/+|\/+$/g, "");
}

/** 本文中のリンクがルート内の Markdown を指すなら、そのルート相対パスを返す。 */
export function resolveMarkdownLink(currentPath: string, href: string): string | null {
  if (!href || href.startsWith("#")) return null;
  let url: URL;
  try {
    url = new URL(href, ORIGIN + toUrl(currentPath));
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  const path = pathFromLocation(url.pathname);
  return isMarkdownPath(path) ? path : null;
}

export function findDir(tree: TreeNode[], path: string): TreeNode[] | null {
  if (path === "") return tree;
  for (const n of tree) {
    if (n.type !== "dir") continue;
    if (n.path === path) return n.children;
    if (path.startsWith(n.path + "/")) return findDir(n.children, path);
  }
  return null;
}
