import type {
  ContextualActionInput,
  DetectedQuestion,
} from "../../shared/intelligence";
import { ACTION_LABELS } from "../../shared/intelligence";
import { dynamicAction } from "../../shared/actions";
import { parseReview, type ReviewInput } from "../../shared/ai";
import { exactKeys, record } from "../../shared/validation";

export function parseAction(value: unknown): ContextualActionInput {
  const input = record(value);
  exactKeys(input, [
    "action",
    "question",
    "suggestionId",
    "participantInfo",
    "options",
  ]);
  if (
    typeof input.action !== "string" ||
    !Object.hasOwn(ACTION_LABELS, input.action)
  )
    throw new Error("Choose a contextual action.");
  for (const key of ["question", "participantInfo", "suggestionId"])
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "string" ||
        (input[key] as string).length >
          (key === "question" ? 6000 : key === "participantInfo" ? 1500 : 128))
    )
      throw new Error(`Invalid action ${key}.`);
  const review = parseReview({
    question: input.question ?? "",
    options: input.options,
    action: input.action,
  });
  return {
    ...input,
    question: review.question,
    options: review.options,
  } as unknown as ContextualActionInput;
}
export function actionReview(
  input: ContextualActionInput,
  detected?: DetectedQuestion,
): { review?: ReviewInput; local?: string; requireContext: boolean } {
  if (input.action === "who")
    return {
      local: input.participantInfo?.trim()
        ? `User-provided participant information (unverified): ${input.participantInfo.trim()}\n\nThis is not a voice/identity determination. Capture-source labels do not identify a person.`
        : "No authorised participant information is available. Microphone and system-audio labels identify sources, not people. No voice identity, calendar lookup or participant research was performed.",
      requireContext: false,
    };
  if (input.participantInfo?.trim())
    throw new Error(
      "Participant information is accepted only for Who Am I Talking To.",
    );
  if (detected && !input.options[detected.source])
    throw new Error(
      "Select the detected question's transcript source before reviewing it, or type your own question.",
    );
  const question = input.question?.trim() || detected?.text || "";
  const action =
    input.action === "dynamic" ? dynamicAction(question) : input.action;
  if (action === "fact-check" && question.length < 8)
    throw new Error(
      "Enter a specific factual claim for an unverified context-only assessment.",
    );
  const defaults = {
    "get-answer": "",
    "say-next":
      "Suggest a concise natural response to the selected recent discussion.",
    "follow-ups":
      "Suggest useful follow-up questions about the selected context.",
    "fact-check": "",
    recap: `Recap only the selected retained window, up to ${input.options.recentSeconds} seconds. Do not claim the whole session.`,
    who: "",
    dynamic: "",
  };
  const text = question || defaults[action];
  const preset =
    /\b(?:code|function|loop|dictionary|compiler|exception|variable)\b/i.test(
      question,
    )
      ? "code"
      : action === "say-next" || action === "follow-ups"
        ? "conversation"
        : "general";
  return {
    review: parseReview({
      question: text,
      options: input.options,
      preset,
      action,
      ...(detected ? { transcriptIds: detected.contextIds } : {}),
    }),
    requireContext:
      action === "recap" ||
      action === "say-next" ||
      (action === "follow-ups" && !question),
  };
}
