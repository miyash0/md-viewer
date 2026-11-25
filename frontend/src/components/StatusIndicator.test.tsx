import { act, render } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import { StatusIndicator } from "./StatusIndicator";
import type { ViewState } from "../types";

const ready: ViewState = { phase: "ready", error: null, updatedAt: null };

afterEach(() => vi.useRealTimers());

test("描画中", () => {
  const { container } = render(<StatusIndicator state={{ ...ready, phase: "loading" }} connection="open" />);
  expect(container.textContent).toContain("描画中…");
});

test("更新後 1.5 秒だけ「更新しました」", () => {
  vi.useFakeTimers();
  const { container } = render(<StatusIndicator state={{ ...ready, updatedAt: Date.now() }} connection="open" />);
  expect(container.textContent).toContain("更新しました");
  act(() => {
    vi.advanceTimersByTime(1600);
  });
  expect(container.textContent).not.toContain("更新しました");
});

test("切断", () => {
  const { container } = render(<StatusIndicator state={ready} connection="disconnected" />);
  expect(container.textContent).toContain("サーバーとの接続が切れました（再接続を待っています）");
});

test("エラー", () => {
  const { container } = render(<StatusIndicator state={{ ...ready, error: "ファイルが見つかりません: a.md" }} connection="open" />);
  expect(container.querySelector("[role=alert]")?.textContent).toBe("ファイルが見つかりません: a.md");
});

test("平常時は何も出さない", () => {
  const { container } = render(<StatusIndicator state={ready} connection="open" />);
  expect(container.textContent).toBe("");
});
