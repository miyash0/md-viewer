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

test("再接続時に onReconnect を呼ぶ（初回接続では呼ばない）", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rootName: "r", initial: null, tree: [] })));
  const onReconnect = vi.fn();
  const stop = subscribeEvents({ onChange() {}, onTree() {}, onStatus() {}, onReconnect });
  const es = FakeEventSource.last;
  es.onopen!();
  expect(onReconnect).not.toHaveBeenCalled();
  es.onerror!();
  es.onopen!();
  expect(onReconnect).toHaveBeenCalledTimes(1);
  stop();
});

test("タブが非表示の間は接続を閉じ、表示されたら繋ぎ直して onReconnect", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rootName: "r", initial: null, tree: [] })));
  const onReconnect = vi.fn();
  const statuses: string[] = [];
  const stop = subscribeEvents({ onChange() {}, onTree() {}, onStatus: (s) => statuses.push(s), onReconnect });
  const first = FakeEventSource.last;
  first.onopen!();
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(first.closed).toBe(true);
  expect(statuses).not.toContain("disconnected");
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  const second = FakeEventSource.last;
  expect(second).not.toBe(first);
  second.onopen!();
  expect(onReconnect).toHaveBeenCalledTimes(1);
  stop();
  expect(second.closed).toBe(true);
});
