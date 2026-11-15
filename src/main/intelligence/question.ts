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
const relevant =
  /\b(explain|function|code|variable|dictionary|list|loop|solution|approach|improv\w*|error|exception|compiler|compile|debug|comprehension|compare|difference|implement|algorithm|empty|design|task|project|plan|customer|client|budget|deadline|proposal|meeting|respond|reply|answer|decis\w*|suggest|clarify|summari[sz]e|recap|help|next|work|test|use|happen\w*)\b/;

const FILLER = /^(?:(?:okay|ok|so|well|hey|please|then|and|but)\b[,\s]*)+/i;
// Speech that has the shape of a question but does not want an answer.
const NOT_ASKING =
  /^(?:who (?:cares|knows)|why bother|what an? |what(?:'s| is) the point|what could possibly go wrong|(?:isn't|is not) it obvious|(?:don't|do not) you think|can you hear me|are you there|what time is it)\b/;
const REPORTED =
  /\b(?:rhetorical|no need to answer|he asked|she asked|they asked|example question|i wonder(?:ed)? whether)\b/;
const AUX = "do|does|did|is|are|was|were|can|could|would|should|will|has|have";
const WH = new RegExp(
  "^(?:" +
    [
      `(?:why|how|where|when)\\s+(?:${AUX}|might)\\b`,
      "how\\s+(?:many|much|long|often|far|big|about|come)\\b",
      "what(?:'s| is| are| was| were| does| do| did| has| have| happens| happened| if| about| would| should| can| could| will| makes| made)\\b",
      "what\\s+(?:kind|sort|type)s?\\s+of\\b",
      // "What experience do you have", "Which tools did the team use".
      `(?:what|which)\\s+(?:\\w+\\s+){1,3}(?:${AUX})\\s+(?:you|we|i|they|it|this|that|these|those|the|your|our|their)\\b`,
      "which\\s+\\w+\\s+(?:is|are|would|should|do|does)\\b",
      "who\\s+(?:is|are|was|were|can|could|should|will|would|did|do|does)\\b",
      "(?:any|are there any|do you have any)\\s+(?:questions|thoughts|concerns|objections)\\b",
    ].join("|") +
    ")",
);
const AUXILIARY = new RegExp(
  `^(?:${AUX})\\s+(?:you|we|i|they|this|that|it|there|the|your|our|anyone|anybody)\\b`,
);
const HELP =
  /^(?:help me|explain|please explain|i (?:need|would like) (?:some )?help|i(?:'m| am) stuck|i(?:'d| would) like to know|tell (?:me|us) (?:about|how|why|what|more)|walk (?:me|us) through|talk (?:me|us) through|describe|give (?:me|us) an example|share an example)\b/;
// "…, right?" checks agreement; it is not a question to answer.
const TAG = /\b(?:right|okay|ok|yeah|you know|make sense|makes sense)$/;
const DANGLING =
  /\b(?:a|an|the|to|of|instead of|because|and|or|if|between|about|would you|could you|can you)\s*$/;

export function detectQuestion(
  value: string,
  recentContext = "",
): QuestionScore | null {
  if (!value.trim() || value.length > 8000) return null;
  const clauses = value
    .slice(0, 3000)
    .replace(/[’‘]/g, "'")
    .split(/(?<=[.!?])\s+|\n+/)
    .slice(-12);
  let best: QuestionScore | null = null;
  for (const raw of clauses) {
    const clause = raw.trim().replace(FILLER, "");
    // Recognised speech carries punctuation, so a question mark is evidence
    // even when the sentence is phrased as a statement.
    const marked = /\?\s*$/.test(clause);
    const text = clause
      .replace(/[?!.]+$/, "")
      .trim()
      .slice(0, 600);
    const normal = normalizeQuestion(text),
      words = normal.split(" ");
    if (NOT_ASKING.test(normal) || REPORTED.test(normal)) continue;
    const wh = WH.test(normal),
      auxiliary = AUXILIARY.test(normal),
      help = HELP.test(normal);
    const statement =
      !wh && !auxiliary && !help && marked && words.length >= 4;
    if (!wh && !auxiliary && !help && !statement) continue;
    if (statement && TAG.test(normal)) continue;
    const content = terms(normal),
      context = terms(recentContext);
    const related = [...content].some((word) => context.has(word));
    const relevance = relevant.test(normal) ? 0.95 : related ? 0.78 : 0.35;
    if (relevance < 0.5) continue;
    const complete = words.length >= 4 && !DANGLING.test(normal);
    let confidence = wh ? 0.94 : auxiliary ? 0.9 : statement ? 0.86 : 0.77;
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
