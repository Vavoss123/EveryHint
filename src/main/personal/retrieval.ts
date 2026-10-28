import type {
  KnowledgeDocument,
  KnowledgeExcerpt,
  KnowledgeSection,
} from "../../shared/knowledge";

export function terms(text: string): string[] {
  return (
    text
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu)
      ?.slice(0, 2000) ?? []
  );
}
export function rankSections(
  query: string,
  documents: { document: KnowledgeDocument; sections: KnowledgeSection[] }[],
  maxChars = 4800,
): KnowledgeExcerpt[] {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "what",
    "when",
    "where",
    "which",
    "how",
    "why",
    "is",
    "are",
    "was",
    "were",
    "can",
    "could",
    "would",
    "should",
    "does",
    "do",
    "of",
    "to",
    "in",
    "on",
    "at",
    "an",
    "it",
    "be",
    "please",
    "using",
    "only",
  ]);
  const queryTerms = [...new Set(terms(query))]
    .filter((t) => !stopwords.has(t))
    .slice(0, 32);
  if (!queryTerms.length) return [];
  const rows = documents
    .filter((d) => d.document.enabled)
    .flatMap(({ document, sections }) =>
      sections.map((section) => ({
        document,
        section,
        tokens: terms(section.text),
      })),
    );
  const avg =
    rows.reduce((n, r) => n + r.tokens.length, 0) / (rows.length || 1);
  const dfs = new Map(
    queryTerms.map((t) => [t, rows.filter((r) => r.tokens.includes(t)).length]),
  );
  const ranked = rows
    .map(({ document, section, tokens }) => {
      let score = 0,
        matches = 0;
      for (const term of queryTerms) {
        const tf = tokens.filter((t) => t === term).length;
        if (!tf) continue;
        matches++;
        const idf = Math.log(
          1 + (rows.length - dfs.get(term)! + 0.5) / (dfs.get(term)! + 0.5),
        );
        score +=
          (idf * (tf * 2.2)) /
          (tf + 1.2 * (0.25 + (0.75 * tokens.length) / (avg || 1)));
        if (terms(section.heading + " " + document.name).includes(term))
          score += 0.2;
      }
      return {
        ...section,
        documentId: document.id,
        documentName: document.name,
        ref: `K:${document.id}:${section.id}`,
        score,
        matches,
      };
    })
    // Absolute BM25 thresholds suppress even exact multi-term matches when a
    // topic occurs throughout a large library. Require keyword coverage instead.
    .filter((r) => r.score > 0 && r.matches >= Math.min(2, queryTerms.length))
    .sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
  const selected: KnowledgeExcerpt[] = [],
    seen = new Set<string>();
  let chars = 0;
  for (const row of ranked) {
    const key = row.text.replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    const text = row.text.slice(0, Math.min(1200, maxChars - chars));
    if (text.length < 20) break;
    const { matches, ...excerpt } = row;
    void matches;
    selected.push({ ...excerpt, text });
    seen.add(key);
    chars += text.length;
    if (selected.length >= 4 || chars >= maxChars) break;
  }
  return selected;
}
