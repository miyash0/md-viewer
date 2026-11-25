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
}): () => void {
  const es = new EventSource("/_md/api/events");
  let wasDisconnected = false;
  h.onStatus("connecting");
  es.onopen = () => {
    h.onStatus("open");
    if (wasDisconnected) {
      wasDisconnected = false;
      fetchTree().then(h.onTree, () => {});
    }
  };
  es.onerror = () => {
    wasDisconnected = true;
    h.onStatus("disconnected");
  };
  es.addEventListener("change", (e) => h.onChange(JSON.parse((e as MessageEvent).data).path));
  es.addEventListener("tree", (e) => h.onTree(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}
