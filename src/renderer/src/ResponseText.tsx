import { Fragment, useState, type ReactNode } from "react";

// Deliberately small Markdown subset. Every value is a React text node: no
// HTML parser, remote images, links, plugins or provider-created actions.
export function inlineText(text: string): ReactNode {
  return text
    .split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
    .map((part, index) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("*") && part.endsWith("*") ? (
        <em key={index}>{part.slice(1, -1)}</em>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
}
function CodeBlock({ text, language }: { text: string; language: string }) {
  const [status, setStatus] = useState("");
  return (
    <div className="answer-code">
      <div className="code-toolbar">
        <small>{language || "Code"}</small>
        <button
          className="text-button"
          disabled={!text}
          onClick={() => {
            void window.everyhint.copyResponse(text).then(
              (result) => setStatus(result.ok ? "Copied" : "Copy failed"),
              () => setStatus("Copy failed"),
            );
          }}
        >
          Copy code
        </button>
        <small role="status">{status}</small>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}
const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .slice(0, 24)
    .map((cell) => cell.trim());
const fence = (line: string): RegExpMatchArray | null =>
  line.match(/^\s{0,3}(`{3,}|~{3,})([^\s]*)\s*$/);
const listItem = (line: string): RegExpMatchArray | null =>
  line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);
export function ResponseText({ text }: { text: string }) {
  const lines = text.slice(0, 32000).split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const start = index;
    const line = lines[index]!;
    if (!line.trim()) {
      index++;
      continue;
    }
    const opening = fence(line);
    if (opening) {
      index++;
      const code: string[] = [];
      let closed = false;
      while (index < lines.length) {
        const closing = fence(lines[index]!);
        if (
          closing &&
          closing[1]![0] === opening[1]![0] &&
          closing[1]!.length >= opening[1]!.length &&
          !closing[2]
        ) {
          closed = true;
          index++;
          break;
        }
        code.push(lines[index++]!);
      }
      const language = /^[\w+#.-]{1,32}$/.test(opening[2]!) ? opening[2]! : "";
      blocks.push(
        <CodeBlock
          key={start}
          language={language}
          text={code.join("\n") + (closed && code.length ? "\n" : "")}
        />,
      );
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Heading = `h${heading[1]!.length}` as
        | "h1"
        | "h2"
        | "h3"
        | "h4"
        | "h5"
        | "h6";
      blocks.push(<Heading key={start}>{inlineText(heading[2]!)}</Heading>);
      index++;
      continue;
    }
    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      cells(lines[index + 1]!).every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      const headers = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (
        index < lines.length &&
        lines[index]!.includes("|") &&
        lines[index]!.trim()
      )
        rows.push(cells(lines[index++]!));
      blocks.push(
        <div className="answer-table" key={start}>
          <table>
            <thead>
              <tr>
                {headers.map((cell, col) => (
                  <th key={col}>{inlineText(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, col) => (
                    <td key={col}>{inlineText(row[col] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const item = listItem(line);
    if (item) {
      const ordered = !item[1];
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const next = listItem(lines[index]!);
        if (!next || !next[1] !== ordered) break;
        items.push(<li key={index}>{inlineText(next[2]!)}</li>);
        index++;
      }
      blocks.push(
        ordered ? <ol key={start}>{items}</ol> : <ul key={start}>{items}</ul>,
      );
      continue;
    }
    const paragraph = [line];
    index++;
    while (
      index < lines.length &&
      lines[index]!.trim() &&
      !fence(lines[index]!) &&
      !/^#{1,6}\s/.test(lines[index]!) &&
      !listItem(lines[index]!)
    )
      paragraph.push(lines[index++]!);
    blocks.push(<p key={start}>{inlineText(paragraph.join("\n"))}</p>);
  }
  return <div className="answer-text">{blocks}</div>;
}
