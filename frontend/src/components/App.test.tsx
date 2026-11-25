import { fireEvent, render, waitFor } from "@testing-library/preact";
import { act } from "preact/test-utils";
import { beforeEach, expect, test, vi } from "vitest";
import type { TreeResponse } from "../types";

const files: Record<string, string> = {
  "README.md": "# Readme\n\n[docs](docs/a.md) [ext](https://example.com/x.md) [png](img/a.png)",
  "docs/a.md": "# A doc",
};
let treeResp: TreeResponse;
let handlers: { onChange(p: string): void; onTree(t: TreeResponse): void; onStatus(s: string): void };
const fetchRaw = vi.fn(async (p: string) => {
  if (!(p in files)) throw new Error("missing");
  return files[p];
});

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  fetchTree: async () => treeResp,
  fetchRaw: (p: string) => fetchRaw(p),
  subscribeEvents: (h: typeof handlers) => {
    handlers = h;
    return () => {};
  },
}));
vi.mock("../render/mermaid", () => ({ renderMermaid: async () => {} }));

import { App } from "./App";

const tree = (initial: string | null): TreeResponse => ({
  rootName: "root",
  initial,
  tree: [
    { type: "dir", name: "docs", path: "docs", children: [{ type: "file", name: "a.md", path: "docs/a.md" }] },
    { type: "file", name: "README.md", path: "README.md" },
  ],
});

beforeEach(() => {
  history.replaceState(null, "", "/");
  fetchRaw.mockClear();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  localStorage.clear();
});

const content = (c: Element) => c.querySelector(".md-content") as HTMLElement;

test("ルートで initial に replaceState して表示", async () => {
  treeResp = tree("README.md");
  const { container } = render(<App />);
  await waitFor(() => expect(content(container).querySelector("h1#readme")).not.toBeNull());
  expect(location.pathname).toBe("/README.md");
});

test("initial が無ければディレクトリ一覧", async () => {
  treeResp = tree(null);
  const { findByRole } = render(<App />);
  const list = await findByRole("list", { name: "root の Markdown" });
  expect(list.textContent).toContain("README.md");
  expect(list.textContent).toContain("docs");
});

test("ディレクトリのパスならそのディレクトリの一覧", async () => {
  treeResp = tree("README.md");
  history.replaceState(null, "", "/docs/");
  const { findByRole } = render(<App />);
  const list = await findByRole("list", { name: "docs の Markdown" });
  expect(list.textContent).toContain("a.md");
});

test("本文の .md リンクで pushState、外部リンクと画像リンクは素通し", async () => {
  treeResp = tree("README.md");
  const { container } = render(<App />);
  await waitFor(() => expect(content(container).querySelector("h1#readme")).not.toBeNull());
  const ext = container.querySelector('a[href^="https"]')!;
  const extEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
  ext.dispatchEvent(extEvent);
  expect(extEvent.defaultPrevented).toBe(false);
  const png = container.querySelector('a[href="img/a.png"]')!;
  const pngEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
  png.dispatchEvent(pngEvent);
  expect(pngEvent.defaultPrevented).toBe(false);
  const ctrl = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
  container.querySelector('a[href="docs/a.md"]')!.dispatchEvent(ctrl);
  expect(ctrl.defaultPrevented).toBe(false);
  fireEvent.click(container.querySelector('a[href="docs/a.md"]')!);
  await waitFor(() => expect(content(container).querySelector("h1#a-doc")).not.toBeNull());
  expect(location.pathname).toBe("/docs/a.md");
});

test("popstate で表示が戻る", async () => {
  treeResp = tree("README.md");
  const { container } = render(<App />);
  await waitFor(() => expect(content(container).querySelector("h1#readme")).not.toBeNull());
  fireEvent.click(container.querySelector('a[href="docs/a.md"]')!);
  await waitFor(() => expect(content(container).querySelector("h1#a-doc")).not.toBeNull());
  history.replaceState(null, "", "/README.md");
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(content(container).querySelector("h1#readme")).not.toBeNull());
});

test("現在のファイルの change でのみ再読込", async () => {
  treeResp = tree("README.md");
  const { container } = render(<App />);
  await waitFor(() => expect(content(container).querySelector("h1#readme")).not.toBeNull());
  const calls = fetchRaw.mock.calls.length;
  act(() => handlers.onChange("docs/a.md"));
  await new Promise((r) => setTimeout(r, 20));
  expect(fetchRaw.mock.calls.length).toBe(calls);
  act(() => handlers.onChange("README.md"));
  await waitFor(() => expect(fetchRaw.mock.calls.length).toBe(calls + 1));
});

test("tree イベントでツリーが更新される", async () => {
  treeResp = tree("README.md");
  const { findByText } = render(<App />);
  await findByText("README.md");
  act(() =>
    handlers.onTree({ ...tree(null), tree: [...tree(null).tree, { type: "file", name: "new.md", path: "new.md" }] }),
  );
  await findByText("new.md");
});
