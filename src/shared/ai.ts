import { exactKeys, record } from "./validation";
import type { AudioSourceId, ScreenFrame } from "./contracts";

export type ProviderId = "codex" | "claude";
export function providerId(value: unknown): ProviderId {
  if (value !== "codex" && value !== "claude")
    throw new Error("Choose Codex or Claude.");
  return value;
}
export interface ProviderStatus {
  id: ProviderId;
  auth: "unknown" | "chatgpt" | "api-key" | "missing" | "error";
  ready: boolean;
  message: string;
  capabilities: { text: boolean; images: boolean; tools: false };
  models: string[];
}
export interface ContextOptions {
  microphone: boolean;
  systemAudio: boolean;
  screenshot: boolean;
  history: boolean;
  recentSeconds: number;
  transcriptChars: number;
  totalChars: number;
  imageBytes: number;
}
export const DEFAULT_CONTEXT: ContextOptions = {
  microphone: false,
  systemAudio: false,
  screenshot: false,
  history: true,
  recentSeconds: 120,
  transcriptChars: 6000,
  totalChars: 20000,
  imageBytes: 1500000,
};
export interface ReviewInput {
  question: string;
  options: ContextOptions;
}
export function parseReview(value: unknown): ReviewInput {
  const input = record(value);
  exactKeys(input, ["question", "options"]);
  if (
    typeof input.question !== "string" ||
    !input.question.trim() ||
    input.question.length > 6000
  )
    throw new Error("Enter a question of 1–6,000 characters.");
  const options = record(input.options);
  exactKeys(options, Object.keys(DEFAULT_CONTEXT));
  for (const key of ["microphone", "systemAudio", "screenshot", "history"])
    if (typeof options[key] !== "boolean")
      throw new Error(`Invalid context choice: ${key}.`);
  const ranges: Record<string, [number, number]> = {
    recentSeconds: [10, 600],
    transcriptChars: [100, 12000],
    totalChars: [1000, 40000],
    imageBytes: [50000, 4000000],
  };
  for (const [key, [min, max]] of Object.entries(ranges))
    if (
      !Number.isInteger(options[key]) ||
      (options[key] as number) < min ||
      (options[key] as number) > max
    )
      throw new Error(`Invalid context limit: ${key}.`);
  return {
    question: input.question.trim(),
    options: { ...options } as unknown as ContextOptions,
  };
}
export interface TranscriptExcerpt {
  source: AudioSourceId;
  startMs: number;
  endMs: number;
  text: string;
}
export interface ConversationTurn {
  question: string;
  answer: string;
}
export interface AIRequest {
  requestId: string;
  sessionId: string;
  captureSessionId: string | null;
  provider: ProviderId;
  question: string;
  transcripts: TranscriptExcerpt[];
  screenshot: ScreenFrame | null;
  history: ConversationTurn[];
  createdAt: number;
  prompt: string;
}
export interface ContextReview extends AIRequest {
  expiresAt: number;
  textChars: number;
  imageBytes: number;
  notices: string[];
}
export type AIErrorCode =
  | "auth"
  | "billing"
  | "permissions"
  | "rate-limit"
  | "network"
  | "timeout"
  | "process"
  | "provider"
  | "cancelled";
export interface AIError {
  code: AIErrorCode;
  message: string;
}
export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedUsd?: number;
}
export interface AIResponse {
  requestId: string;
  sessionId: string;
  provider: ProviderId;
  question: string;
  text: string;
  status:
    | "sending"
    | "generating"
    | "completed"
    | "cancelled"
    | "error"
    | "rate-limited";
  startedAt: number;
  firstTextAt: number | null;
  endedAt: number | null;
  error: AIError | null;
  usage: AIUsage | null;
  model: string | null;
}
export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "complete"; text: string; usage?: AIUsage; model?: string };
export interface AIProvider {
  readonly id: ProviderId;
  inspect(apiBilling: boolean): Promise<ProviderStatus>;
  respond(
    request: AIRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
  dispose(): void | Promise<void>;
}
export interface AssistantSnapshot {
  revision: number;
  sessionId: string;
  selected: ProviderId;
  providers: ProviderStatus[];
  claudeApiBilling: boolean;
  review: ContextReview | null;
  responses: AIResponse[];
}
