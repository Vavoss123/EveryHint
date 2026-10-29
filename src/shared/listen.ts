import type { ContextReview } from "./ai";
import type { PrepareCapture, Result } from "./contracts";

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
  latestQuestion: string | null;
}
export interface ListenBridge {
  get(): Promise<Result<ListenSnapshot>>;
  start(input: ListenStart): Promise<Result<void>>;
  authorise(input: SharingChoices): Promise<Result<void>>;
  revoke(): Promise<Result<void>>;
  ask(input: { question: string }): Promise<Result<void>>;
  context(): Promise<Result<ContextReview | null>>;
  onState(listener: (value: ListenSnapshot) => void): () => void;
}
