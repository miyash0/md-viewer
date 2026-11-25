import { fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { TreeNode } from "../types";

const tree: TreeNode[] = [
  {
    type: "dir", name: "docs", path: "docs",
    children: [{ type: "dir", name: "deep", path: "docs/deep", children: [{ type: "file", name: "x.md", path: "docs/deep/x.md" }] }],
  },
  { type: "dir", name: "other", path: "other", children: [{ type: "file", name: "o.md", path: "other/o.md" }] },
  { type: "file", name: "README.md", path: "README.md" },
];

function mockMatchMedia(narrow: boolean) {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes("max-width") ? narrow : false,
    media: q, addEventListener() {}, removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  mockMatchMedia(false);
});
afterEach(() => vi.restoreAllMocks());

const base = { tree, current: "docs/deep/x.md", toc: [], onNavigate: () => {} };

test("トグルで閉じ、localStorage に保存", () => {
  const { getByLabelText, queryByRole } = render(<Sidebar {...base} />);
  expect(queryByRole("navigation", { name: "ファイル" })).not.toBeNull();
  fireEvent.click(getByLabelText("サイドバーを切り替え"));
  expect(queryByRole("navigation", { name: "ファイル" })).toBeNull();
  expect(localStorage.getItem("md.sidebar")).toBe("closed");
});

test("保存値 closed で閉じて始まる", () => {
  localStorage.setItem("md.sidebar", "closed");
  const { queryByRole } = render(<Sidebar {...base} />);
  expect(queryByRole("navigation", { name: "ファイル" })).toBeNull();
});

test("localStorage が throw しても描画される", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
  const { getByLabelText, queryByRole } = render(<Sidebar {...base} />);
  fireEvent.click(getByLabelText("サイドバーを切り替え"));
  expect(queryByRole("navigation", { name: "ファイル" })).toBeNull();
});

test("保存値なし・狭い画面では閉じて始まる", () => {
  mockMatchMedia(true);
  const { queryByRole } = render(<Sidebar {...base} />);
  expect(queryByRole("navigation", { name: "ファイル" })).toBeNull();
});

test("現在ファイルの祖先ディレクトリが展開され、他は閉じている", () => {
  const { getByText, queryByText } = render(<Sidebar {...base} />);
  expect(getByText("x.md").closest("[aria-current=page]")).not.toBeNull();
  expect(queryByText("o.md")).toBeNull();
  fireEvent.click(getByText("other"));
  expect(queryByText("o.md")).not.toBeNull();
});

test("ファイルクリックで onNavigate", () => {
  const onNavigate = vi.fn();
  const { getByText } = render(<Sidebar {...base} onNavigate={onNavigate} />);
  fireEvent.click(getByText("README.md"));
  expect(onNavigate).toHaveBeenCalledWith("README.md");
});

test("目次クリックで scrollIntoView", () => {
  const target = document.createElement("h2");
  target.id = "sec";
  target.scrollIntoView = vi.fn();
  document.body.appendChild(target);
  const { getByText } = render(<Sidebar {...base} toc={[{ level: 2, id: "sec", text: "Section" }]} />);
  fireEvent.click(getByText("Section"));
  expect(target.scrollIntoView).toHaveBeenCalled();
  target.remove();
});
