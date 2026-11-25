import { expect, test } from "vitest";
import { isMarkdownPath, pathFromLocation, resolveMarkdownLink, toUrl } from "./nav";

test.each([
  ["docs/a.md", "b.md", "docs/b.md"],
  ["docs/a.md", "./b.md", "docs/b.md"],
  ["docs/a.md", "../README.md#x", "README.md"],
  ["docs/a.md", "/top.markdown", "top.markdown"],
  ["a.md", "%E6%97%A5%20b.md", "日 b.md"],
  ["a.md", "sub/C.MD?x=1", "sub/C.MD"],
  ["a.md", "https://example.com/x.md", null],
  ["a.md", "//example.com/x.md", null],
  ["a.md", "mailto:a@example.com", null],
  ["a.md", "#section", null],
  ["a.md", "img/a.png", null],
  ["", "docs/a.md", "docs/a.md"],
])("resolveMarkdownLink(%j, %j) = %j", (cur, href, want) => {
  expect(resolveMarkdownLink(cur, href)).toBe(want);
});

test("toUrl は各セグメントをエンコード", () => {
  expect(toUrl("docs/日 #.md")).toBe("/docs/%E6%97%A5%20%23.md");
  expect(toUrl("")).toBe("/");
});

test("pathFromLocation", () => {
  expect(pathFromLocation("/docs/%E6%97%A5.md")).toBe("docs/日.md");
  expect(pathFromLocation("/")).toBe("");
  expect(pathFromLocation("/docs/")).toBe("docs");
});

test("isMarkdownPath", () => {
  expect(isMarkdownPath("a.MD")).toBe(true);
  expect(isMarkdownPath("a.markdown")).toBe(true);
  expect(isMarkdownPath("docs")).toBe(false);
});

test("不正な % を含むパスでも throw しない", () => {
  expect(pathFromLocation("/a%zz.md")).toBe("a%zz.md");
  expect(resolveMarkdownLink("a.md", "b%zz.md")).toBe("b%zz.md");
});
