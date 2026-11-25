import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchTree, subscribeEvents, type ConnectionStatus } from "../api";
import { findDir, isMarkdownPath, pathFromLocation, resolveMarkdownLink, toUrl } from "../nav";
import type { TocItem, TreeNode, TreeResponse, ViewState } from "../types";
import { Content } from "./Content";
import { DirectoryListing } from "./DirectoryListing";
import { Sidebar } from "./Sidebar";
import { StatusIndicator } from "./StatusIndicator";

function hasFile(nodes: TreeNode[], path: string): boolean {
  return nodes.some((n) => (n.type === "file" ? n.path === path : hasFile(n.children, path)));
}

const IDLE: ViewState = { phase: "ready", error: null, updatedAt: null };

export function App() {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [path, setPath] = useState(() => pathFromLocation(location.pathname));
  const [toc, setToc] = useState<TocItem[]>([]);
  const [view, setView] = useState<ViewState>({ ...IDLE, phase: "loading" });
  const [conn, setConn] = useState<ConnectionStatus>("connecting");
  const [reloadToken, setReloadToken] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;

  const isFile = isMarkdownPath(path);

  useEffect(() => {
    fetchTree().then(
      (t) => {
        setTree(t);
        if (pathFromLocation(location.pathname) === "" && t.initial) {
          history.replaceState(null, "", toUrl(t.initial) + location.hash);
          setPath(t.initial);
        }
      },
      (e) => setView({ ...IDLE, error: String(e instanceof Error ? e.message : e) }),
    );
    const stop = subscribeEvents({
      onChange: (p) => p === pathRef.current && setReloadToken((n) => n + 1),
      onTree: (t) => {
        setTree((prev) => ({ ...t, initial: prev?.initial ?? t.initial }));
        // 表示中のファイルが消えたら読み直して「見つかりません」を出す
        const cur = pathRef.current;
        if (isMarkdownPath(cur) && !hasFile(t.tree, cur)) setReloadToken((n) => n + 1);
      },
      onStatus: setConn,
    });
    const onPop = () => setPath(pathFromLocation(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => {
      stop();
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useEffect(() => {
    const name = path.split("/").pop() || tree?.rootName || "md";
    document.title = `${name} - md`;
    if (!isFile) {
      setToc([]);
      setView(IDLE);
    }
  }, [path, isFile, tree?.rootName]);

  const navigate = useCallback((p: string, hash = "") => {
    if (p === pathRef.current) {
      if (!hash) return;
      history.pushState(null, "", toUrl(p) + hash);
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    history.pushState(null, "", toUrl(p) + hash);
    setPath(p);
  }, []);

  const onContentClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.("a");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const href = a.getAttribute("href") ?? "";
    const target = resolveMarkdownLink(pathRef.current, href);
    if (target == null) return;
    e.preventDefault();
    const hashIndex = href.indexOf("#");
    navigate(target, hashIndex >= 0 ? href.slice(hashIndex) : "");
  };

  const dirTitle = path === "" ? (tree?.rootName ?? "") : path;

  return (
    <div class="md-layout">
      <Sidebar tree={tree?.tree ?? []} current={isFile ? path : null} toc={toc} onNavigate={navigate} />
      <main class="md-main" onClick={onContentClick}>
        {isFile ? (
          <Content path={path} reloadToken={reloadToken} onToc={setToc} onState={setView} />
        ) : (
          tree && <DirectoryListing title={dirTitle} nodes={findDir(tree.tree, path)} onNavigate={navigate} />
        )}
      </main>
      <StatusIndicator state={view} connection={conn} />
    </div>
  );
}
