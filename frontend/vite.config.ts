/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// npm run dev 用: アプリ本体（/_md/ 配下）は Vite が配信し、API とユーザーのファイルは md サーバーへ転送する
const backend = `http://127.0.0.1:${process.env.MD_BACKEND_PORT ?? 8000}`;

export default defineConfig({
  base: "/_md/",
  plugins: [preact()],
  server: {
    proxy: {
      "^/(?!_md/)|^/_md/api/": {
        target: backend,
        changeOrigin: true, // md サーバーは Host が 127.0.0.1:<port> でないと拒否する
        // .md やディレクトリへのページ遷移は SPA を返す（本番の main.py と同じ振る舞い）
        bypass(req) {
          const url = req.url ?? "";
          const isNavigation = (req.headers.accept ?? "").includes("text/html");
          const path = decodeURIComponent(url.split("?")[0]);
          if (isNavigation && !path.startsWith("/_md/") && (/\.(md|markdown)$/i.test(path) || !/\.[^/]+$/.test(path))) {
            return "/_md/index.html";
          }
        },
      },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
});
