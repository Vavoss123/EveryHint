import { SUMMARY_SECTIONS } from "../../shared/meeting-ai";
import { meetingId } from "../../shared/meetings";
import { exactKeys, record } from "../../shared/validation";
import type { MeetingAIController } from "./ai";

export interface ChatTurn {
  question: string;
  answer: string;
}
const QUESTION_LIMIT = 4000;
const ANSWER_TIMEOUT_MS = 120_000;

/** Folds earlier turns into the question, newest first, within the limit. */
export function chatQuestion(question: string, history: ChatTurn[]): string {
  const asked = question.trim();
  const turns: string[] = [];
  let used = asked.length + 40;
  for (const turn of [...history].reverse()) {
    const text = `Q: ${turn.question}\nA: ${turn.answer}`;
    if (used + text.length + 2 > QUESTION_LIMIT) break;
    turns.unshift(text);
    used += text.length + 2;
  }
  return turns.length
    ? `Earlier in this chat:\n${turns.join("\n\n")}\n\nNew question: ${asked}`
    : asked;
}
function parse(value: unknown): {
  id: string;
  question: string;
  history: ChatTurn[];
} {
  const input = record(value);
  exactKeys(input, ["id", "question", "history"]);
  if (
    typeof input.question !== "string" ||
    !input.question.trim() ||
    input.question.length > 2000
  )
    throw new Error("Ask a question of at most 2,000 characters.");
  if (!Array.isArray(input.history) || input.history.length > 20)
    throw new Error("Invalid chat history.");
  const history = input.history.map((turn) => {
    const row = record(turn);
    exactKeys(row, ["question", "answer"]);
    if (typeof row.question !== "string" || typeof row.answer !== "string")
      throw new Error("Invalid chat history.");
    return {
      question: row.question.slice(0, 2000),
      answer: row.answer.slice(0, 4000),
    };
  });
  return { id: meetingId(input.id), question: input.question, history };
}
/**
 * "Ask about this meeting": answers straight away from the transcript and
 * saved notes, without the review step used for meeting AI drafts.
 */
export class MeetingChat {
  private run = 0;
  constructor(
    private readonly ai: MeetingAIController,
    private readonly pause = (ms: number) =>
      new Promise<void>((done) => setTimeout(done, ms)),
  ) {}
  async ask(value: unknown): Promise<string> {
    const { id, question, history } = parse(value);
    const run = ++this.run;
    const permit = () => run === this.run;
    try {
      const reviewId = await this.ai.prepare(
        {
          purpose: "ask",
          meetingIds: [id],
          temporary: false,
          question: chatQuestion(question, history),
          sources: { microphone: true, systemAudio: true, notes: true },
          segmentIds: [],
          sections: [...SUMMARY_SECTIONS],
        },
        true,
        permit,
      );
      await this.ai.ask({ reviewId, acknowledged: true }, permit);
      const deadline = Date.now() + ANSWER_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (!permit()) throw new Error("A newer question replaced this one.");
        const state = this.ai.value;
        if (state.status === "draft" && state.textDraft !== null)
          return state.textDraft;
        if (state.status === "error")
          throw new Error(state.error ?? "The AI could not answer.");
        await this.pause(100);
      }
      throw new Error("The AI took too long to answer.");
    } finally {
      // Chat answers are not drafts awaiting review.
      if (permit()) this.ai.cancel("Chat answer delivered.");
    }
  }
  cancel(): void {
    this.run++;
    this.ai.cancel("Chat question cancelled.");
  }
}
