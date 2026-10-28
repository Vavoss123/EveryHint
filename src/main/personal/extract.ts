import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import {
  MAX_DOCUMENT_CHARS,
  MAX_IMPORT_BYTES,
  type Extraction,
  type KnowledgeDocument,
  type KnowledgeSection,
} from "../../shared/knowledge";

const decoder = new TextDecoder("utf-8", { fatal: true });
export function sectionText(
  text: string,
  heading: string,
  page: number | null,
  start: number,
): KnowledgeSection[] {
  const cleaned = text.replaceAll("\0", "").replace(/\r\n?/g, "\n").trim();
  const chunks: KnowledgeSection[] = [];
  for (let offset = 0; offset < cleaned.length; offset += 1100) {
    chunks.push({
      id: `s${start + chunks.length}`,
      heading: heading.slice(0, 200),
      page,
      text: cleaned.slice(offset, offset + 1200),
    });
  }
  return chunks;
}
export async function extractDocument(
  type: KnowledgeDocument["type"],
  bytes: Uint8Array,
): Promise<Extraction> {
  if (!bytes.length || bytes.length > MAX_IMPORT_BYTES)
    throw new Error("Document must contain 1 byte to 8 MiB.");
  let sections: KnowledgeSection[] = [],
    partial = false;
  const notices: string[] = [];
  if (type === "pdf") {
    if (
      Buffer.from(bytes.subarray(0, 8)).toString("ascii").indexOf("%PDF-") !== 0
    )
      throw new Error("Invalid PDF signature.");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = getDocument({
      data: new Uint8Array(bytes),
      useWorkerFetch: false,
      useSystemFonts: false,
      useWasm: false,
      disableFontFace: true,
      stopAtErrors: true,
      disableRange: true,
      disableStream: true,
      verbosity: 0,
    });
    try {
      const pdf = await loading.promise;
      if (pdf.numPages > 200)
        throw new Error("PDF exceeds the 200-page limit.");
      let chars = 0;
      for (let page = 1; page <= pdf.numPages; page++) {
        try {
          const content = await (await pdf.getPage(page)).getTextContent();
          const text = content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join("");
          chars += text.length;
          if (chars > MAX_DOCUMENT_CHARS)
            throw new Error("Extracted text exceeds 400,000 characters.");
          sections.push(
            ...sectionText(text, `Page ${page}`, page, sections.length),
          );
        } catch (error) {
          if (error instanceof Error && error.message.includes("400,000"))
            throw error;
          partial = true;
          notices.push(`Page ${page} could not be extracted; it is excluded.`);
        }
      }
    } finally {
      await loading.destroy();
    }
  } else if (type === "docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
      throw new Error("Invalid DOCX structure.");
    let count = 0,
      total = 0;
    const names = new Set<string>();
    const zip = unzipSync(bytes, {
      filter(file) {
        if (
          ++count > 2000 ||
          names.has(file.name) ||
          file.name.includes("..") ||
          /vbaProject|macros/i.test(file.name)
        )
          throw new Error("Unsafe DOCX archive.");
        names.add(file.name);
        if (!["[Content_Types].xml", "word/document.xml"].includes(file.name))
          return false;
        total += file.originalSize;
        if (file.originalSize > 4_000_000 || total > 4_500_000)
          throw new Error("DOCX expanded XML exceeds its limit.");
        return true;
      },
    });
    if (!zip["word/document.xml"] || !zip["[Content_Types].xml"])
      throw new Error("Missing DOCX document structure.");
    const contentTypes = decoder.decode(zip["[Content_Types].xml"]);
    if (/<!DOCTYPE|<!ENTITY/i.test(contentTypes))
      throw new Error("DOCX content-type entities and DTDs are prohibited.");
    let validContentType = false,
      validTypesRoot = false,
      typeDepth = 0;
    const typesParser = new SaxesParser({ xmlns: false });
    typesParser.on("opentag", (tag) => {
      if (++typeDepth > 50) throw new Error("DOCX content-type nesting limit.");
      if (typeDepth === 1)
        validTypesRoot =
          tag.name === "Types" &&
          tag.attributes.xmlns ===
            "http://schemas.openxmlformats.org/package/2006/content-types";
      if (
        tag.name === "Override" &&
        tag.attributes.PartName === "/word/document.xml" &&
        tag.attributes.ContentType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      )
        validContentType = true;
    });
    typesParser.on("closetag", () => {
      typeDepth--;
    });
    typesParser.on("error", (error) => {
      throw error;
    });
    try {
      typesParser.write(contentTypes).close();
    } catch {
      throw new Error("Malformed DOCX content types.");
    }
    if (!validTypesRoot || !validContentType)
      throw new Error("Unsupported DOCX content type.");
    const xml = decoder.decode(zip["word/document.xml"]);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw new Error("DOCX entities and DTDs are prohibited.");
    const parser = new SaxesParser({ xmlns: true });
    let text = "",
      inText = false,
      depth = 0,
      root = false;
    const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    parser.on("opentag", (tag) => {
      if (++depth > 100) throw new Error("DOCX nesting limit exceeded.");
      if (depth === 1) root = tag.local === "document" && tag.uri === word;
      inText = tag.local === "t" && tag.uri === word;
      if (["tab", "br"].includes(tag.local) && tag.uri === word) text += "\n";
    });
    parser.on("text", (value) => {
      if (inText) text += value;
      if (text.length > MAX_DOCUMENT_CHARS)
        throw new Error("Extracted text exceeds 400,000 characters.");
    });
    parser.on("closetag", (tag) => {
      depth--;
      inText = false;
      if (tag.local === "p" && tag.uri === word) text += "\n";
    });
    parser.on("error", (error) => {
      throw error;
    });
    parser.write(xml).close();
    if (!root) throw new Error("Invalid DOCX root.");
    sections = sectionText(text, "Document text", null, 0);
    notices.push(
      "DOCX extracts main body text only. Headers, comments, embedded objects and page numbers are excluded.",
    );
  } else if (type === "txt" || type === "md") {
    const text = decoder.decode(bytes);
    for (const c of text)
      if (c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0)))
        throw new Error(
          "Text file appears binary or unsupported; use UTF-8 text.",
        );
    if (text.length > MAX_DOCUMENT_CHARS)
      throw new Error("Extracted text exceeds 400,000 characters.");
    if (type === "md") {
      let heading = "Document",
        pending = "";
      const flush = () => {
        sections.push(...sectionText(pending, heading, null, sections.length));
        pending = "";
      };
      for (const line of text.split(/\r?\n/)) {
        const match = /^#{1,6}\s+(.+)$/.exec(line);
        if (match) {
          flush();
          heading = match[1]!;
        } else pending += line + "\n";
      }
      flush();
    } else sections = sectionText(text, "Document text", null, 0);
  } else
    throw new Error("Only PDF, DOCX, UTF-8 TXT and Markdown are supported.");
  if (sections.reduce((n, s) => n + s.text.trim().length, 0) < 20)
    throw new Error(
      "Little or no extractable text. Scanned files need a text layer; OCR is not performed.",
    );
  if (sections.length > 500)
    throw new Error("Document exceeds 500 indexed sections.");
  return { sections, notices, partial };
}
