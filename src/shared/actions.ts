import type { ContextualAction } from "./intelligence";

export const ACTION_GUIDELINES: Record<ContextualAction, string> = {
  "get-answer":
    "Answer the selected question using only the selected reference context. State missing context and uncertainty.",
  "say-next":
    "Offer a concise natural spoken response the user could choose to say next, followed by a short explanation only if useful. Present suggested words, never claim the user said them. Do not invent participants or earlier discussion.",
  "follow-ups":
    "Suggest three to five useful follow-up questions grounded in the selected recent discussion or user-provided topic. Do not claim answers or topics absent from the context.",
  "fact-check":
    "This is an UNVERIFIED, CONTEXT-ONLY claim assessment. No external retrieval or authoritative independent verification is available. Identify the specific claim, assess only supplied evidence, distinguish inference from evidence, and say what current authoritative evidence would be needed. Do not label the result independently verified or invent citations.",
  recap:
    "Summarise only the selected retained excerpts, current selected image and selected previous exchanges. State that this is a recap of the selected retention window, not the entire meeting. Do not invent earlier discussion, decisions, participants or actions.",
  who: "Use only explicitly supplied participant information. Capture source labels are not participant identities. Never infer identity through voice, appearance, a calendar or external research.",
  dynamic:
    "Provide concise relevant assistance for the explicit selected topic and available context. Do not imply unavailable tools or evidence.",
};
export function dynamicAction(
  text: string,
): Exclude<ContextualAction, "dynamic"> {
  if (/\b(?:recap|summari[sz]e|summary)\b/i.test(text)) return "recap";
  if (/\b(?:ask next|follow.up questions|questions to ask)\b/i.test(text))
    return "follow-ups";
  if (/\b(?:say next|respond|reply|say to|answer the customer)\b/i.test(text))
    return "say-next";
  return "get-answer";
}
