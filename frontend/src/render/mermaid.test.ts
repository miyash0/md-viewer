import { expect, test, vi } from "vitest";

const render = vi.fn();
const initialize = vi.fn();
vi.mock("mermaid", () => ({ default: { render, initialize } }));

import { renderMermaid } from "./mermaid";

test("壊れた図だけがエラーになり、他の図は描画される", async () => {
  render.mockRejectedValueOnce(new Error("Parse error on line 1"));
  render.mockResolvedValueOnce({ svg: "<svg id='ok'></svg>" });
  const el = document.createElement("div");
  el.innerHTML = '<pre class="mermaid">bad</pre><p>本文</p><pre class="mermaid">graph TD; A-->B</pre>';
  await renderMermaid(el, true);
  expect(el.querySelector(".md-error")?.textContent).toBe("Mermaid エラー: Parse error on line 1");
  expect(el.querySelector("svg#ok")).not.toBeNull();
  expect(el.textContent).toContain("本文");
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, theme: "dark" }));
});

test("ライトモードでは default テーマ", async () => {
  render.mockResolvedValueOnce({ svg: "<svg></svg>" });
  const el = document.createElement("div");
  el.innerHTML = '<pre class="mermaid">graph TD; A</pre>';
  await renderMermaid(el, false);
  expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "default" }));
});
