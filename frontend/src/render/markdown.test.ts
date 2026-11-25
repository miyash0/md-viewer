import { expect, test } from "vitest";
import { renderMarkdown } from "./markdown";

test("数式内の _ が強調にならない", () => {
  const { html } = renderMarkdown("$a_1 + b_2$ と $c_3$");
  expect(html).toContain("katex");
  expect(html).not.toContain("<em>");
});

test("ブロック数式", () => {
  expect(renderMarkdown("$$\nx^2\n$$").html).toContain("katex-display");
});

test("脚注", () => {
  expect(renderMarkdown("本文[^1]\n\n[^1]: 注").html).toMatch(/footnote/);
});

test("GitHub アラート", () => {
  expect(renderMarkdown("> [!WARNING]\n> 注意").html).toContain("markdown-alert-warning");
});

test("見出しアンカーは GitHub 互換", () => {
  const { html, toc } = renderMarkdown("# Hello World\n## Hello World\n### 日本語 見出し");
  expect(html).toContain('id="hello-world"');
  expect(html).toContain('id="hello-world-1"');
  expect(toc).toEqual([
    { level: 1, id: "hello-world", text: "Hello World" },
    { level: 2, id: "hello-world-1", text: "Hello World" },
    { level: 3, id: "日本語-見出し", text: "日本語 見出し" },
  ]);
});

test("目次は h1〜h3 のみ", () => {
  const { toc } = renderMarkdown("# a\n#### d");
  expect(toc.map((t) => t.level)).toEqual([1]);
});

test("レンダリングをまたいでスラッグがリセットされる", () => {
  renderMarkdown("# A");
  expect(renderMarkdown("# A").html).toContain('id="a"');
});

test("コードハイライト", () => {
  expect(renderMarkdown("```js\nconst a = 1\n```").html).toContain("hljs");
});

test("言語不明のコードはエスケープのみ", () => {
  const { html } = renderMarkdown("```\n<b>x</b>\n```");
  expect(html).toContain("&lt;b&gt;");
});

test("mermaid はエスケープされた pre になる", () => {
  const r = renderMarkdown("```mermaid\ngraph TD; A-->B<script>\n```");
  expect(r.hasMermaid).toBe(true);
  expect(r.html).toContain('<pre class="mermaid">');
  expect(r.html).toContain("&lt;script&gt;");
  expect(renderMarkdown("# x").hasMermaid).toBe(false);
});

test("GFM の表とタスクリスト", () => {
  const { html } = renderMarkdown("|a|\n|-|\n|1|\n\n- [x] done");
  expect(html).toContain("<table>");
  expect(html).toContain('type="checkbox"');
});
