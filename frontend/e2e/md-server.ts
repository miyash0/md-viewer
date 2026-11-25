import { test as base } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MAIN = join(here, "..", "..", "main.py");

export type MdServer = { baseURL: string; dir: string; proc: ChildProcess; restart(): Promise<ChildProcess> };

export const test = base.extend<{ md: MdServer }>({
  md: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "md-e2e-"));
    await cp(join(here, "fixtures"), dir, { recursive: true });
    const proc = spawn("python3", [MAIN, dir, "--no-open"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr!.on("data", (d) => (stderr += d));
    const firstLine = await new Promise<string>((resolve, reject) => {
      let buf = "";
      proc.stdout!.on("data", (d) => {
        buf += d;
        const nl = buf.indexOf("\n");
        if (nl >= 0) resolve(buf.slice(0, nl).trim());
      });
      proc.on("exit", (code) => reject(new Error(`md exited (${code}): ${stderr}`)));
    });
    const baseURL = new URL(firstLine).origin;
    // 同じポートで起動し直す（ポートが解放されるまで少し再試行する）
    const restart = async () => {
      const port = new URL(baseURL).port;
      for (let i = 0; i < 50; i++) {
        const p = spawn("python3", [MAIN, dir, "--no-open", "-p", port], { stdio: ["ignore", "pipe", "pipe"] });
        const ok = await new Promise<boolean>((resolve) => {
          p.stdout!.once("data", () => resolve(true));
          p.once("exit", () => resolve(false));
        });
        if (ok) return p;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("md を再起動できませんでした");
    };
    await use({ baseURL, dir, proc, restart });
    proc.kill();
    await rm(dir, { recursive: true, force: true });
  },
});

export { expect } from "@playwright/test";
