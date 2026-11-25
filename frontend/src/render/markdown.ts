import MarkdownIt, { type MarkdownIt as MarkdownItInstance, type Token } from "markdown-it";
import footnote from "markdown-it-footnote";
import anchor from "markdown-it-anchor";
import alerts from "markdown-it-github-alerts";
import katexModule from "@vscode/markdown-it-katex";
// @ts-expect-error 型定義なし
import taskListsModule from "markdown-it-task-lists";
import GithubSlugger from "github-slugger";
import hljs from "highlight.js/lib/common";
import type { TocItem } from "../types";

// CJS プラグインはバンドラによって関数そのもの／{ default: 関数 } のどちらでも届くので正規化する
type Plugin = (md: MarkdownItInstance, ...args: any[]) => void;
const interop = (m: unknown): Plugin => ((m as { default?: Plugin }).default ?? m) as Plugin;
const katex = interop(katexModule);
const taskLists = interop(taskListsModule);

export type RenderResult = { html: string; toc: TocItem[]; hasMermaid: boolean };

const slugger = new GithubSlugger();

const md: MarkdownItInstance = new MarkdownIt({
  html: true,
  linkify: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      return `<pre><code class="hljs language-${md.utils.escapeHtml(lang)}">${out}</code></pre>`;
    }
    return "";
  },
})
  .use(footnote)
  .use(anchor, { slugify: (s: string) => slugger.slug(s), level: [1, 2, 3, 4, 5, 6] })
  .use(alerts)
  .use(katex, { throwOnError: false })
  .use(taskLists);

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim().split(/\s+/)[0] === "mermaid") {
    if (env) env.hasMermaid = true;
    return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

function plainText(inline: Token): string {
  return (inline.children ?? [])
    .filter((t) => t.type === "text" || t.type === "code_inline")
    .map((t) => t.content)
    .join("");
}

export function renderMarkdown(src: string): RenderResult {
  slugger.reset();
  const env: { hasMermaid?: boolean } = {};
  const tokens = md.parse(src, env);
  const toc: TocItem[] = [];
  tokens.forEach((t, i) => {
    const level = Number(t.tag.slice(1));
    if (t.type === "heading_open" && level <= 3) {
      toc.push({ level, id: String(t.attrGet("id") ?? ""), text: plainText(tokens[i + 1]) });
    }
  });
  const html = md.renderer.render(tokens, md.options, env);
  return { html, toc, hasMermaid: !!env.hasMermaid };
}
