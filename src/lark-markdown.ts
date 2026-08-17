import { renderMermaidASCII } from "beautiful-mermaid";

const MAX_MARKDOWN_LENGTH = 10_000;
const MERMAID_FENCE = /```mermaid[^\S\r\n]*\r?\n([\s\S]*?)```/gi;
const SUPPORTED_MERMAID_HEADER =
  /^(?:(?:graph|flowchart)\s+(?:TD|TB|BT|RL|LR)\b|stateDiagram(?:-v2)?\b|sequenceDiagram\b|classDiagram\b|erDiagram\b|xychart-beta\b)/i;

function renderMermaidBlock(source: string): string {
  const definition = source.trim();
  const header = definition
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));
  if (!header || !SUPPORTED_MERMAID_HEADER.test(header)) {
    return `> ⚠️ 图表暂不支持渲染，已保留 Mermaid 源码。\n\n\`\`\`mermaid\n${definition}\n\`\`\``;
  }
  try {
    const diagram = renderMermaidASCII(definition, { colorMode: "none" });
    return `\`\`\`text\n${diagram.trimEnd()}\n\`\`\``;
  } catch {
    return `> ⚠️ 图表渲染失败，已保留 Mermaid 源码。\n\n\`\`\`mermaid\n${definition}\n\`\`\``;
  }
}

function truncateMarkdown(markdown: string): string {
  if (markdown.length <= MAX_MARKDOWN_LENGTH) return markdown;
  const prefix = markdown.slice(0, MAX_MARKDOWN_LENGTH - 40).trimEnd();
  const fenceCount = prefix.match(/^```/gm)?.length ?? 0;
  return `${prefix}${fenceCount % 2 === 0 ? "" : "\n```"}\n\n[回复已截断]`;
}

export function renderLarkMarkdown(text: string): string {
  const normalized = text.trim() || "DeepSeek Harness 未生成文本回复。";
  return truncateMarkdown(normalized.replace(MERMAID_FENCE, (_match, source) =>
    renderMermaidBlock(String(source)),
  ));
}
