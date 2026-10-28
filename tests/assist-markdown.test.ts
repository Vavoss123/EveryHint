import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponseText } from "../src/renderer/src/ResponseText";
const render = (text: string) =>
  renderToStaticMarkup(createElement(ResponseText, { text }));
describe("bounded untrusted Assist Markdown", () => {
  it("renders headings, paragraphs, lists, inline code and a practical table", () => {
    const html = render(
      "# Explanation\n\nA **bold** point and `value`.\n\n- One\n- Two\n\n1. First\n2. Second\n\n| Key | Value |\n| --- | --- |\n| A | 42 |",
    );
    for (const part of [
      "<h1>Explanation</h1>",
      "<p>",
      "<strong>bold</strong>",
      "<code>value</code>",
      "<ul>",
      "<ol>",
      "<table>",
      "<td>42</td>",
    ])
      expect(html).toContain(part);
  });
  it("renders incomplete streaming fences and exposes a language label and explicit copy control", () => {
    const html = render("Text\n\n```python\nprint(42)");
    expect(html).toContain("<small>python</small>");
    expect(html).toContain("<code>print(42)</code>");
    expect(html).toContain("Copy code");
    expect(render("```py")).not.toContain("<code>py</code>");
  });
  it("escapes scripts, HTML and malicious links/images instead of creating executable elements or network fetches", () => {
    const html = render(
      '<script>window.pwned=true</script>\n<img src="https://invalid.example/x" onerror="evil()">\n[bad](javascript:evil())\n![image](https://invalid.example/x)\n\n```html\n<script>evil()</script>\n```',
    );
    for (const tag of ["<script", "<img", "<a ", 'onerror="evil()'])
      expect(html).not.toContain(tag);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("javascript:evil()");
  });
  it("bounds provider text and never interprets code as UI", () => {
    expect(render("x".repeat(40000)).length).toBeLessThan(32100);
    expect(render("~~~tsx\n<button onClick={run}>Run</button>\n~~~")).toContain(
      "&lt;button",
    );
  });
});
