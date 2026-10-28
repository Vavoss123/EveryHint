export interface QuestionScore {
  text: string;
  confidence: number;
  relevance: number;
  complete: boolean;
  automaticEligible: boolean;
  reason: string;
}
export const normalizeQuestion = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const stop = new Set(
  "a an the this that those these it is are was be do does did would could should can you i we they he she to of on in for and or why what how when where which who with please".split(
    " ",
  ),
);
export function terms(text: string): Set<string> {
  return new Set(
    normalizeQuestion(text)
      .split(" ")
      .filter((word) => word.length > 2 && !stop.has(word))
      .slice(0, 80),
  );
}
export function similarity(left: string, right: string): number {
  const a = terms(left),
    b = terms(right);
  if (!a.size || !b.size)
    return normalizeQuestion(left) === normalizeQuestion(right) ? 1 : 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared);
}
const relevant =
  /\b(explain|function|code|variable|dictionary|list|loop|solution|approach|improv\w*|error|exception|compiler|compile|debug|comprehension|compare|difference|implement|algorithm|empty|design|task|project|plan|customer|client|budget|deadline|proposal|meeting|respond|reply|answer|decis\w*|suggest|clarify|summari[sz]e|recap|help|next|work|test|use|happen\w*)\b/;
export function detectQuestion(
  value: string,
  recentContext = "",
): QuestionScore | null {
  if (!value.trim() || value.length > 8000) return null;
  const clauses = value
    .slice(0, 3000)
    .replace(/[’‘]/g, "'")
    .split(/(?:[.!?]\s+|\n+)/)
    .slice(-12);
  let best: QuestionScore | null = null;
  for (let clause of clauses) {
    clause = clause
      .trim()
      .replace(
        /^(?:(?:okay|ok|so|well|hey|please|then|and|but)\b[,\s]*)+/i,
        "",
      );
    const text = clause
      .replace(/[?!.]+$/, "")
      .trim()
      .slice(0, 600);
    const normal = normalizeQuestion(text),
      words = normal.split(" ");
    if (
      /^(?:who (?:cares|knows)|why bother|what(?:'s| is) the point|what could possibly go wrong|(?:isn't|is not) it obvious|(?:don't|do not) you think|can you hear me|are you there|what time is it)\b/.test(
        normal,
      ) ||
      /\b(?:rhetorical|no need to answer|he asked|she asked|they asked|example question|i wonder(?:ed)? whether)\b/.test(
        normal,
      )
    )
      continue;
    const wh =
      /^(?:(?:why|how|where|when)\s+(?:do|does|did|is|are|can|could|would|should|will|has|have|might)\b|what(?:'s| is| are| does| do| did| happens| if| would| should| can| could| will)\b|which\s+\w+\s+(?:is|are|would|should|do|does)\b|who\s+(?:is|are|can|should|will)\b)/.test(
        normal,
      );
    const auxiliary =
      /^(?:can|could|would|will|should|do|does|did|is|are|have|has)\s+(?:you|we|i|this|that|it|there|the)\b/.test(
        normal,
      );
    const help =
      /^(?:help me|explain|please explain|i (?:need|would like) (?:some )?help|i(?:'m| am) stuck|i(?:'d| would) like to know)\b/.test(
        normal,
      );
    if (!wh && !auxiliary && !help) continue;
    const content = terms(normal),
      context = terms(recentContext);
    const related = [...content].some((word) => context.has(word));
    const relevance = relevant.test(normal) ? 0.95 : related ? 0.78 : 0.35;
    if (relevance < 0.5) continue;
    const complete =
      words.length >= 4 &&
      !/\b(?:a|an|the|to|of|instead of|because|and|or|if|between|about|would you|could you|can you)\s*$/.test(
        normal,
      );
    let confidence = wh ? 0.94 : auxiliary ? 0.9 : 0.77;
    if (!complete) confidence = 0.56;
    if (relevance < 0.8) confidence = Math.min(confidence, 0.8);
    const candidate = {
      text,
      confidence,
      relevance,
      complete,
      automaticEligible: complete && confidence >= 0.85 && relevance >= 0.65,
      reason: !complete
        ? "Incomplete help/question cue; review only"
        : help
          ? "Help request; review recommended"
          : "Final interrogative with relevant task context",
    };
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }
  return best;
}
