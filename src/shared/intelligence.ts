import type { AudioSourceId } from "./contracts";
import type { ContextOptions } from "./ai";

export type OperatingMode = "manual" | "auto-hint" | "live";
export interface IntelligenceSettings {
  confidenceThreshold: number;
  cooldownSeconds: number;
  requestLimit: number;
  sessionMinutes: number;
  retentionMinutes: number;
  sources: { microphone: boolean; systemAudio: boolean; screen: boolean };
  excludedSourceIds: string[];
}
export const DEFAULT_INTELLIGENCE: IntelligenceSettings = {
  confidenceThreshold: 0.85,
  cooldownSeconds: 30,
  requestLimit: 20,
  sessionMinutes: 30,
  retentionMinutes: 5,
  sources: { microphone: false, systemAudio: false, screen: false },
  excludedSourceIds: [],
};
export type IntelligenceEventType =
  | "QuestionDetected"
  | "KeywordDetected"
  | "ScreenChanged"
  | "ContextUpdated"
  | "SuggestionCreated"
  | "SuggestionDismissed"
  | "SuggestionExpired"
  | "AssistRequested"
  | "AssistCompleted";
export interface IntelligenceEvent {
  id: string;
  sessionId: string;
  type: IntelligenceEventType;
  at: number;
  text: string;
  source?: AudioSourceId | "screen";
  referenceId?: string;
}
export interface DetectedQuestion {
  id: string;
  sessionId: string;
  transcriptId: string;
  source: AudioSourceId;
  text: string;
  at: number;
  expiresAt: number;
  confidence: number;
  relevance: number;
  automaticEligible: boolean;
  reason: string;
  screen: { sourceId: string; name: string; capturedAt: number } | null;
  contextIds: string[];
}
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
export interface ContextSuggestion {
  id: string;
  sessionId: string;
  action: ContextualAction;
  questionId: string | null;
  text: string;
  at: number;
  expiresAt: number;
  score: number;
  source: AudioSourceId | "screen";
}
export interface ContextualActionInput {
  action: ContextualAction;
  question?: string;
  suggestionId?: string;
  participantInfo?: string;
  options: ContextOptions;
}
export type ActionOutcome =
  | { type: "review"; reviewId: string; action: ContextualAction }
  | { type: "local"; action: ContextualAction; text: string };
export interface IntelligenceDiagnostics {
  analysedTranscripts: number;
  duplicateQuestions: number;
  unchangedFrames: number;
  sampledFrames: number;
  screenChanges: number;
  detectionMs: number;
  screenMs: number;
  suggestionsCreated: number;
  automaticAttempts: number;
  automaticCompletions: number;
  suppressedRequests: number;
  queueDepth: number;
  responseLatencyMs: number | null;
}
export interface LiveSharing {
  workspace?: {
    enabled: boolean;
    remote: boolean;
    scopeId: string;
    selection: import("./workspace").WorkspaceSelection;
  };
  knowledge?: { enabled: boolean; remote: boolean; ids: string[] };
  microphone: boolean;
  systemAudio: boolean;
  screenshot: boolean;
  history: boolean;
}
export interface LiveAuthorisation {
  modeId?: string;
  id: string;
  captureSessionId: string;
  captureEpoch: number;
  assistantSessionId: string;
  accountId: string;
  model: string;
  sourceId: string | null;
  sourceName: string | null;
  sharing: LiveSharing;
  startedAt: number;
  expiresAt: number;
  cooldownSeconds: number;
  requestLimit: number;
  requests: number;
  nextRequestAt: number;
  confidenceThreshold: number;
}
export interface LiveContext {
  workspaceSources?: {
    scopeId: string;
    selection: import("./workspace").WorkspaceSelection;
    context: import("./workspace").WorkspaceAIContext;
  };
  modeId?: string;
  modeName?: string;
  knowledgeSources?: { id: string; name: string }[];
  accountLabel: string;
  captureSessionId: string;
  captureEpoch: number;
  assistantSessionId: string;
  accountId: string;
  model: string;
  sourceId: string | null;
  sourceName: string | null;
  images: boolean;
  transcribing: boolean;
  available: { microphone: boolean; systemAudio: boolean; screenshot: boolean };
}
export interface LiveConsentInput {
  acknowledged: boolean;
  expected: LiveContext;
  sharing: LiveSharing;
  limits: {
    sessionMinutes: number;
    cooldownSeconds: number;
    requestLimit: number;
  };
}
export interface IntelligenceSnapshot {
  revision: number;
  mode: OperatingMode;
  sessionId: string | null;
  settings: IntelligenceSettings;
  questions: DetectedQuestion[];
  suggestions: ContextSuggestion[];
  events: IntelligenceEvent[];
  screen: {
    sourceId: string;
    name: string;
    capturedAt: number;
    changedAt: number | null;
    difference: number;
  } | null;
  live: LiveAuthorisation | null;
  liveContext: LiveContext | null;
  status: string;
  localResult: { action: ContextualAction; text: string } | null;
  diagnostics: IntelligenceDiagnostics;
}
