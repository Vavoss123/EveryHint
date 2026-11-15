import type { ContextReview } from "./ai";
import type { PrepareCapture, Result } from "./contracts";

/**
 * How much of the session one conversation request can draw on. Answers need
 * what was said earlier in the meeting, not only the last exchange; the newest
 * lines are kept first when the character budgets are reached.
 */
export const SESSION_CONTEXT = {
  seconds: 30 * 60,
  transcriptChars: 24_000,
  totalChars: 40_000,
} as const;

export interface SharingChoices {
  transcript: boolean;
  screen: boolean;
  acknowledged: boolean;
}
export interface ListenStart {
  capture: PrepareCapture;
  sharing: SharingChoices;
}
export interface ListenSnapshot {
  revision: number;
  managed: boolean;
  phase:
    | "idle"
    | "starting"
    | "listening"
    | "paused"
    | "transcription-paused"
    | "error";
  sharing: { transcript: boolean; screen: boolean; expiresAt: number } | null;
  busy: boolean;
  message: string | null;
  /** A question heard in the last minute that has not been asked about yet. */
  latestQuestion: string | null;
  /** Answers are requested automatically when a new question is heard. */
  auto: boolean;
}
export interface ListenBridge {
  get(): Promise<Result<ListenSnapshot>>;
  start(input: ListenStart): Promise<Result<void>>;
  authorise(input: SharingChoices): Promise<Result<void>>;
  revoke(): Promise<Result<void>>;
  ask(input: { question: string }): Promise<Result<void>>;
  /** Opt in or out of automatic answers for the current session. */
  auto(input: { enabled: boolean }): Promise<Result<void>>;
  context(): Promise<Result<ContextReview | null>>;
  onState(listener: (value: ListenSnapshot) => void): () => void;
}
