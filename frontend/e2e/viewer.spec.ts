import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "./md-server";

test("README を開き、保存で本文だけ更新され、スクロールが保たれる", async ({ page, md }) => {
  await page.goto(md.baseURL + "/");
  await expect(page).toHaveURL(/\/README\.md$/);
  await expect(page.locator("text=MARKER: original")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { marker: number }).marker = 1;
    window.scrollTo(0, 800);
  });
  const file = join(md.dir, "README.md");
  const src = await readFile(file, "utf8");
  await writeFile(file, src.replace("MARKER: original", "MARKER: edited"));
  await expect(page.locator("text=MARKER: edited")).toBeAttached();
  await expect(page.locator(".md-status")).toContainText("更新しました");
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1); // ページは再読み込みされていない
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(700);
});

test("一時ファイル + rename の保存でも更新され、エラーが残らない", async ({ page, md }) => {
  await page.goto(md.baseURL + "/README.md");
  await expect(page.locator("h1#readme")).toBeVisible();
  const file = join(md.dir, "README.md");
  const tmp = join(md.dir, ".README.md.tmp");
  await writeFile(tmp, "# Replaced\n");
  await rename(tmp, file);
  await expect(page.locator("h1#replaced")).toBeVisible();
  await expect(page.locator("[role=alert]")).toHaveCount(0);
});

test("ツリーから日本語ファイル名へ遷移し、URL が変わり、画像が表示される。戻るで README に戻る", async ({ page, md }) => {
  await page.goto(md.baseURL + "/README.md");
  await page.getByRole("navigation", { name: "ファイル" }).getByRole("button", { name: "docs" }).click();
  await page.getByRole("button", { name: "日本語 ファイル.md" }).click();
  await expect(page.locator("h1#日本語")).toBeVisible();
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe("/docs/日本語 ファイル.md");
  const img = page.locator(".md-content img");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await page.goBack();
  await expect(page.locator("h1#readme")).toBeVisible();
});

test("本文のリンクでページ内遷移する", async ({ page, md }) => {
  await page.goto(md.baseURL + "/README.md");
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await page.getByRole("link", { name: "日本語のファイルへ" }).click();
  await expect(page.locator("h1#日本語")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
});

test("数式・アラート・脚注・ハイライトが描画される", async ({ page, md }) => {
  await page.goto(md.baseURL + "/README.md");
  const c = page.locator(".md-content");
  await expect(c.locator(".katex").first()).toBeVisible();
  await expect(c.locator(".katex-display")).toHaveCount(1);
  await expect(c.locator(".markdown-alert-note")).toBeVisible();
  await expect(c.locator(".footnotes")).toBeAttached();
  await expect(c.locator(".hljs")).toBeVisible();
  await expect(c.locator("em")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "目次" })).toContainText("節 1");
});

test("Mermaid が SVG になる", async ({ page, md }) => {
  await page.goto(md.baseURL + "/docs/diagram.md");
  await expect(page.locator(".md-content svg").first()).toBeVisible();
});

test("表示中のファイルを削除するとエラー表示、作り直すと復帰", async ({ page, md }) => {
  await page.goto(md.baseURL + "/docs/diagram.md");
  await expect(page.locator("h1#図")).toBeVisible();
  const file = join(md.dir, "docs/diagram.md");
  await rm(file);
  await expect(page.locator("[role=alert]")).toHaveText("ファイルが見つかりません: docs/diagram.md");
  await writeFile(file, "# 復活\n");
  await expect(page.locator("h1#復活")).toBeVisible();
  await expect(page.locator("[role=alert]")).toHaveCount(0);
});

test("サーバー停止で切断表示", async ({ page, md }) => {
  await page.goto(md.baseURL + "/README.md");
  await expect(page.locator("h1#readme")).toBeVisible();
  md.proc.kill();
  await expect(page.locator(".md-status")).toContainText("サーバーとの接続が切れました");
});

test("ダークモードで背景が暗い", async ({ page, md }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(md.baseURL + "/README.md");
  await expect(page.locator("h1#readme")).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g)!.map(Number);
  expect(r + g + b).toBeLessThan(150);
});

test("狭い画面ではサイドバーが閉じて始まり、トグルで開く", async ({ page, md }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(md.baseURL + "/README.md");
  await expect(page.locator("h1#readme")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ファイル" })).toHaveCount(0);
  await page.getByLabel("サイドバーを切り替え").click();
  await expect(page.getByRole("navigation", { name: "ファイル" })).toBeVisible();
});

test("Markdown 内の生 HTML のスクリプトは実行されない（CSP）", async ({ page, md }) => {
  await writeFile(join(md.dir, "evil.md"), '# evil\n\n<img src="nope.png" onerror="window.pwned = 1">\n\n<script>window.pwned = 2</script>\n');
  await page.goto(md.baseURL + "/evil.md");
  await expect(page.locator("h1#evil")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
});

test("# と % を含むファイル名を開け、画像も表示される", async ({ page, md }) => {
  await page.goto(md.baseURL + "/README.md");
  await page.getByRole("navigation", { name: "ファイル" }).getByRole("button", { name: "docs" }).click();
  await page.getByRole("button", { name: "a #1 100%.md" }).click();
  await expect(page.locator("h1#記号")).toBeVisible();
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe("/docs/a #1 100%.md");
  const img = page.locator(".md-content img");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator("h1#記号")).toBeVisible();
});

test("Mermaid の構文エラーはそのブロックだけがエラーになる", async ({ page, md }) => {
  await page.goto(md.baseURL + "/docs/broken.md");
  await expect(page.locator(".md-content .md-error")).toHaveCount(1);
  await expect(page.locator(".md-content .md-error")).toContainText("Mermaid エラー");
  await expect(page.locator(".md-content")).toContainText("本文は表示される");
  await expect(page.locator(".md-content svg")).toHaveCount(1);
});

test("サーバー停止中の編集が、再起動後に反映される", async ({ page, md }) => {
  await page.goto(md.baseURL + "/README.md");
  await expect(page.locator("h1#readme")).toBeVisible();
  md.proc.kill();
  await expect(page.locator(".md-status")).toContainText("サーバーとの接続が切れました");
  await writeFile(join(md.dir, "README.md"), "# Edited While Down\n");
  const restarted = await md.restart();
  try {
    await expect(page.locator("h1#edited-while-down")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".md-status")).not.toContainText("接続が切れました");
  } finally {
    restarted.kill();
  }
});
