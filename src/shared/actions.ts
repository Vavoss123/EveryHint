export type ContextualAction =
  | "get-answer"
  | "say-next"
  | "follow-ups"
  | "fact-check"
  | "recap"
  | "who"
  | "dynamic";
export const ACTION_LABELS: Record<ContextualAction, string> = {
  "get-answer": "Get Answer",
  "say-next": "What Should I Say Next?",
  "follow-ups": "Suggest Follow-up Questions",
  "fact-check": "Fact Check",
  recap: "Recap",
  who: "Who Am I Talking To?",
  dynamic: "Dynamic Suggestion",
};

export const ACTION_GUIDELINES: Record<ContextualAction, string> = {
  "get-answer":
    "Answer the question directly and correctly, using your own knowledge plus the supplied context. Lead with the answer. Mention missing situation-specific details only if they change the answer.",
  "say-next":
    "Write what the user could say next as natural, confident first-person spoken words (two to five sentences), then at most one short line on why. Present them as suggested words, never claim the user said them. Do not invent participants or earlier discussion.",
  "follow-ups":
    "Suggest three to five sharp follow-up questions the user could ask next, grounded in the recent discussion or user-provided topic. Do not claim answers or topics absent from the context.",
  "fact-check":
    "This is an UNVERIFIED, CONTEXT-ONLY claim assessment. No external retrieval or authoritative independent verification is available. Identify the specific claim, give your best assessment from general knowledge and the supplied evidence, distinguish inference from evidence, and say what current authoritative evidence would confirm it. Do not label the result independently verified or invent citations.",
  recap:
    "Summarise the selected retained excerpts, current selected image and selected previous exchanges as key points, decisions and open questions. State that this covers the selected retention window, not the entire meeting. Do not invent earlier discussion, decisions, participants or actions.",
  who: "Use only explicitly supplied participant information. Capture source labels are not participant identities. Never infer identity through voice, appearance, a calendar or external research.",
  dynamic:
    "Provide concise, directly useful assistance for the selected topic and available context. Do not imply unavailable tools or evidence.",
};
