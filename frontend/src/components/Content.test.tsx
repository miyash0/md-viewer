import { render, waitFor } from "@testing-library/preact";
import { beforeEach, expect, test, vi } from "vitest";
import type { TocItem, ViewState } from "../types";

const fetchRaw = vi.fn<(p: string) => Promise<string>>();
vi.mock("../api", async (orig) => ({ ...(await orig<typeof import("../api")>()), fetchRaw: (p: string) => fetchRaw(p) }));
const renderMermaid = vi.fn(async () => {});
vi.mock("../render/mermaid", () => ({ renderMermaid: (...a: unknown[]) => renderMermaid(...(a as [])) }));

import { Content } from "./Content";
import { NotFoundError } from "../api";

let states: ViewState[];
let tocs: TocItem[][];
const props = (path: string | null, reloadToken = 0) => ({
  path,
  reloadToken,
  onState: (s: ViewState) => states.push(s),
  onToc: (t: TocItem[]) => tocs.push(t),
});

beforeEach(() => {
  states = [];
  tocs = [];
  fetchRaw.mockReset();
  renderMermaid.mockClear();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

test("描画中→ready、toc を通知する", async () => {
  fetchRaw.mockResolvedValue("# Title\n\ntext");
  const { container } = render(<Content {...props("a.md")} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe("ready"));
  expect(states[0].phase).toBe("loading");
  expect(container.querySelector("h1#title")).not.toBeNull();
  expect(tocs.at(-1)).toEqual([{ level: 1, id: "title", text: "Title" }]);
  expect(states.at(-1)?.updatedAt).toBeNull();
});

test("reloadToken の変更でスクロール位置を保持し、updatedAt を付ける", async () => {
  fetchRaw.mockResolvedValue("# a");
  const { rerender } = render(<Content {...props("a.md", 0)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe("ready"));
  Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
  fetchRaw.mockResolvedValue("# b");
  rerender(<Content {...props("a.md", 1)} />);
  await waitFor(() => expect(window.scrollTo).toHaveBeenLastCalledWith(0, 500));
  expect(states.at(-1)?.updatedAt).toEqual(expect.any(Number));
});

test("path の変更で先頭へ", async () => {
  fetchRaw.mockResolvedValue("# a");
  const { rerender } = render(<Content {...props("a.md")} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe("ready"));
  Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
  rerender(<Content {...props("b.md")} />);
  await waitFor(() => expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0));
});

test("404 でエラー、次の成功で解除", async () => {
  fetchRaw.mockRejectedValueOnce(new NotFoundError("a.md"));
  const { rerender } = render(<Content {...props("a.md", 0)} />);
  await waitFor(() => expect(states.at(-1)?.error).toBe("ファイルが見つかりません: a.md"));
  fetchRaw.mockResolvedValue("# ok");
  rerender(<Content {...props("a.md", 1)} />);
  await waitFor(() => expect(states.at(-1)).toMatchObject({ phase: "ready", error: null }));
});

test("hasMermaid のときだけ renderMermaid を呼ぶ", async () => {
  fetchRaw.mockResolvedValue("# no");
  const { rerender } = render(<Content {...props("a.md", 0)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe("ready"));
  expect(renderMermaid).not.toHaveBeenCalled();
  fetchRaw.mockResolvedValue("```mermaid\ngraph TD; A\n```");
  rerender(<Content {...props("a.md", 1)} />);
  await waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(1));
});

test("古いリクエストの結果で上書きしない", async () => {
  let resolveSlow!: (s: string) => void;
  fetchRaw.mockImplementationOnce(() => new Promise((r) => (resolveSlow = r)));
  fetchRaw.mockResolvedValueOnce("# fast");
  const { rerender, container } = render(<Content {...props("slow.md")} />);
  rerender(<Content {...props("fast.md")} />);
  await waitFor(() => expect(container.querySelector("h1#fast")).not.toBeNull());
  resolveSlow("# slow");
  await new Promise((r) => setTimeout(r, 20));
  expect(container.querySelector("h1#slow")).toBeNull();
});

test("アンマウント後に届いた結果では状態を通知しない", async () => {
  let resolve!: (s: string) => void;
  fetchRaw.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
  const { unmount } = render(<Content {...props("a.md")} />);
  unmount();
  const before = states.length;
  resolve("# late");
  await new Promise((r) => setTimeout(r, 20));
  expect(states.slice(before)).toEqual([]);
  expect(tocs).toEqual([]);
});

test("A→B（読み込み中）→A は再読込ではなく遷移として扱う", async () => {
  fetchRaw.mockResolvedValueOnce("# a");
  const { rerender } = render(<Content {...props("a.md", 0)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe("ready"));
  fetchRaw.mockImplementationOnce(() => new Promise(() => {})); // B は終わらない
  rerender(<Content {...props("b.md", 0)} />);
  Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
  fetchRaw.mockResolvedValueOnce("# a");
  rerender(<Content {...props("a.md", 0)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe("ready"));
  expect(states.at(-1)?.updatedAt).toBeNull();
  expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
});
