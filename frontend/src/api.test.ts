import { afterEach, expect, test, vi } from "vitest";
import { fetchRaw, fetchTree, NotFoundError, subscribeEvents, type ConnectionStatus } from "./api";

afterEach(() => vi.unstubAllGlobals());

test("fetchRaw はパスをエンコードする", async () => {
  const fetchMock = vi.fn(async () => new Response("# x"));
  vi.stubGlobal("fetch", fetchMock);
  expect(await fetchRaw("docs/日本語 #1.md")).toBe("# x");
  expect(fetchMock).toHaveBeenCalledWith(
    "/_md/api/raw?path=docs%2F%E6%97%A5%E6%9C%AC%E8%AA%9E%20%231.md",
    expect.anything(),
  );
});

test("fetchRaw は 404 で NotFoundError", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
  await expect(fetchRaw("x.md")).rejects.toBeInstanceOf(NotFoundError);
});

test("fetchRaw は 404 以外の失敗で通常の Error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
  const err = await fetchRaw("x.md").catch((e) => e);
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(NotFoundError);
});

test("fetchTree は JSON を返す", async () => {
  const tree = { rootName: "r", initial: null, tree: [] };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(tree)));
  expect(await fetchTree()).toEqual(tree);
});

class FakeEventSource {
  static last: FakeEventSource;
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, data: unknown) {
    this.listeners[type]?.forEach((fn) => fn(new MessageEvent(type, { data: JSON.stringify(data) })));
  }
  close() {
    this.closed = true;
  }
}

test("subscribeEvents は change/tree/状態を伝え、再接続時にツリーを取り直す", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const tree = { rootName: "r", initial: null, tree: [] };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(tree)));
  const statuses: ConnectionStatus[] = [];
  const changes: string[] = [];
  const trees: unknown[] = [];
  const stop = subscribeEvents({
    onChange: (p) => changes.push(p),
    onTree: (t) => trees.push(t),
    onStatus: (s) => statuses.push(s),
  });
  const es = FakeEventSource.last;
  expect(es.url).toBe("/_md/api/events");
  es.onopen!();
  es.emit("change", { path: "a.md" });
  es.emit("tree", tree);
  es.onerror!();
  es.onopen!();
  await vi.waitFor(() => expect(trees.length).toBe(2));
  expect(statuses).toEqual(["connecting", "open", "disconnected", "open"]);
  expect(changes).toEqual(["a.md"]);
  stop();
  expect(es.closed).toBe(true);
});
