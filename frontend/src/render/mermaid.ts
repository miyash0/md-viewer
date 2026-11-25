let seq = 0;

export async function renderMermaid(container: HTMLElement, dark: boolean): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>("pre.mermaid"));
  if (blocks.length === 0) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict" });
  for (const pre of blocks) {
    const source = pre.textContent ?? "";
    try {
      const { svg } = await mermaid.render(`md-mermaid-${++seq}`, source);
      const fig = document.createElement("div");
      fig.className = "mermaid-figure";
      fig.innerHTML = svg;
      pre.replaceWith(fig);
    } catch (e) {
      const err = document.createElement("div");
      err.className = "md-error";
      err.textContent = `Mermaid エラー: ${e instanceof Error ? e.message : String(e)}`;
      pre.replaceWith(err);
    }
  }
}
