import assert from "node:assert/strict";
import test from "node:test";
import { renderLarkMarkdown } from "../src/lark-markdown.js";

test("keeps GFM tables and renders Mermaid flowcharts as Unicode diagrams", () => {
  const rendered = renderLarkMarkdown(`
| Item | Status |
| --- | --- |
| Web | Done |

\`\`\`mermaid
graph LR
  Web --> Feishu
\`\`\`
`);

  assert.match(rendered, /\| Item \| Status \|/);
  assert.doesNotMatch(rendered, /\`\`\`mermaid/);
  assert.match(rendered, /Web/);
  assert.match(rendered, /Feishu/);
  assert.match(rendered, /[┌┐└┘─│►]/);
  assert.doesNotMatch(rendered, /\u001b\[/);
});

test("keeps unsupported Mermaid source in an explicit fallback block", () => {
  const rendered = renderLarkMarkdown(`
\`\`\`mermaid
pie title Pets
  "Dogs" : 4
\`\`\`
`);

  assert.match(rendered, /图表暂不支持渲染，已保留 Mermaid 源码/);
  assert.match(rendered, /\`\`\`mermaid/);
  assert.match(rendered, /pie title Pets/);
});
