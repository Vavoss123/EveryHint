import { exactKeys, record } from "./validation";
import type { AudioSourceId, ScreenFrame } from "./contracts";
import type { ContextualAction } from "./intelligence";
import { ACTION_LABELS } from "./intelligence";

export type ProviderId = "codex" | "claude";
export function providerId(value: unknown): ProviderId {
  if (value !== "codex" && value !== "claude")
    throw new Error("Choose ChatGPT or Claude.");
  return value;
}
export interface ProviderStatus {
  id: ProviderId;
  auth: "unknown" | "chatgpt" | "api-key" | "missing" | "error";
  ready: boolean;
  message: string;
  capabilities: { text: boolean; images: boolean; tools: false };
  models: string[];
  modelDetails?: AIModel[];
  selectedModel?: string | null;
}
export interface AIModel {
  id: string;
  name: string;
  images: boolean;
}
export const ASSIST_PRESETS = {
  general: {
    name: "General Assist",
    instruction:
      "Give concise, useful help based only on the selected context.",
  },
  code: {
    name: "Code Assist",
    instruction:
      "Explain visible code, identify possible errors and suggest improvements as text. State uncertainty when code is missing or unreadable.",
  },
  conversation: {
    name: "Conversation Assist",
    instruction:
      "Use selected conversation excerpts to suggest a relevant response or explanation. Audio source labels do not establish speaker identities.",
  },
} as const;
export type AssistPreset = keyof typeof ASSIST_PRESETS;
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
  recentSeconds: 60,
  transcriptChars: 6000,
  totalChars: 20000,
  imageBytes: 1500000,
};
export interface ReviewInput {
  transcriptIds?: string[];
  action?: ContextualAction;
  question: string;
  options: ContextOptions;
  preset?: AssistPreset;
  regenerateId?: string;
}
export function parseReview(value: unknown): ReviewInput {
  const input = record(value);
  exactKeys(input, [
    "question",
    "options",
    "preset",
    "regenerateId",
    "action",
    "transcriptIds",
  ]);
  if (
    input.transcriptIds !== undefined &&
    (!Array.isArray(input.transcriptIds) ||
      input.transcriptIds.length > 100 ||
      input.transcriptIds.some(
        (id) => typeof id !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(id),
      ))
  )
    throw new Error("Choose bounded current transcript identifiers.");
  if (
    input.action !== undefined &&
    (typeof input.action !== "string" ||
      !Object.hasOwn(ACTION_LABELS, input.action))
  )
    throw new Error("Choose a supported contextual action.");
  if (typeof input.question !== "string" || input.question.length > 6000)
    throw new Error("The optional question must be at most 6,000 characters.");
  if (
    input.preset !== undefined &&
    (typeof input.preset !== "string" ||
      !Object.hasOwn(ASSIST_PRESETS, input.preset))
  )
    throw new Error("Choose a built-in Assist preset.");
  if (
    input.regenerateId !== undefined &&
    (typeof input.regenerateId !== "string" ||
      input.regenerateId.length > 64 ||
      !input.regenerateId)
  )
    throw new Error("Invalid response to regenerate.");
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
    ...(input.transcriptIds === undefined
      ? {}
      : { transcriptIds: [...new Set(input.transcriptIds as string[])] }),
    ...(input.action === undefined
      ? {}
      : { action: input.action as ContextualAction }),
    options: { ...options } as unknown as ContextOptions,
    preset: (input.preset ?? "general") as AssistPreset,
    ...(input.regenerateId === undefined
      ? {}
      : { regenerateId: input.regenerateId as string }),
  };
}
export interface TranscriptExcerpt {
  id?: string;
  source: AudioSourceId;
  startMs: number;
  endMs: number;
  text: string;
}
export interface ConversationTurn {
  requestId?: string;
  question: string;
  answer: string;
}
export interface AIRequest {
  automatic?: boolean;
  action?: ContextualAction;
  replacesRequestId?: string;
  preset?: AssistPreset;
  sourceName?: string;
  model?: string;
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
  contextNotices?: string[];
  action?: ContextualAction;
  automatic?: boolean;
  preset?: AssistPreset;
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
    canSend?: () => boolean,
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
