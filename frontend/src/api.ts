import type { TreeResponse } from "./types";

export class NotFoundError extends Error {
  constructor(public path: string) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
}

export type ConnectionStatus = "connecting" | "open" | "disconnected";

export async function fetchTree(): Promise<TreeResponse> {
  const res = await fetch("/_md/api/tree", { cache: "no-store" });
  if (!res.ok) throw new Error(`ツリーの取得に失敗しました (${res.status})`);
  return res.json();
}

export async function fetchRaw(path: string): Promise<string> {
  const res = await fetch(`/_md/api/raw?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`読み込みに失敗しました (${res.status}): ${path}`);
  return res.text();
}

export function subscribeEvents(h: {
  onChange(path: string): void;
  onTree(t: TreeResponse): void;
  onStatus(s: ConnectionStatus): void;
  /** 切断や非表示から復帰したとき。表示中の内容を読み直すために使う */
  onReconnect?(): void;
}): () => void {
  let es: EventSource | null = null;
  let needResync = false;

  const connect = () => {
    const src = new EventSource("/_md/api/events");
    es = src;
    src.onopen = () => {
      h.onStatus("open");
      if (needResync) {
        needResync = false;
        fetchTree().then(h.onTree, () => {});
        h.onReconnect?.();
      }
    };
    src.onerror = () => {
      needResync = true;
      h.onStatus("disconnected");
    };
    src.addEventListener("change", (e) => h.onChange(JSON.parse((e as MessageEvent).data).path));
    src.addEventListener("tree", (e) => h.onTree(JSON.parse((e as MessageEvent).data)));
  };

  // ブラウザの同一ホスト接続数の上限（HTTP/1.1 で 6）を使い切らないよう、非表示のタブは接続を閉じる
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      es?.close();
      es = null;
      needResync = true;
    } else if (!es) {
      connect();
    }
  };

  h.onStatus("connecting");
  if (document.visibilityState === "hidden") needResync = true;
  else connect();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    es?.close();
    es = null;
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
