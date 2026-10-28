import type { Result } from "./contracts";
import type {
  MeetingDocument,
  MeetingPage,
  MeetingPreferences,
  MeetingQuery,
  MeetingSegment,
  MeetingState,
  TranscriptPage,
} from "./meetings";
import type {
  MeetingAIState,
  MeetingSelection,
  PostMeetingContext,
  SummarySection,
} from "./meeting-ai";
import type { MeetingEdit } from "./meeting-edits";
export interface MeetingScope<T> {
  scopeId: string;
  input: T;
}
export interface MeetingBridge {
  export(
    input: MeetingScope<import("./meeting-sharing").MeetingExportInput>,
  ): Promise<
    Result<{ cancelled: boolean; name: string | null; bytes: number }>
  >;
  copy(
    input: MeetingScope<import("./meeting-sharing").MeetingCopyInput>,
  ): Promise<Result<void>>;
  email(
    input: MeetingScope<import("./meeting-sharing").MeetingEmailInput>,
  ): Promise<Result<void>>;
  findTranscript(
    input: MeetingScope<{ id: string; query: string; offset: number }>,
  ): Promise<Result<TranscriptPage & { scanned: number }>>;
  reference(
    input: MeetingScope<{ id: string; ref: string }>,
  ): Promise<Result<MeetingSegment>>;
  getState(): Promise<Result<MeetingState>>;
  onState(listener: (state: MeetingState) => void): () => void;
  getAI(): Promise<Result<MeetingAIState>>;
  onAI(listener: (state: MeetingAIState) => void): () => void;
  unlock(input: MeetingScope<void>): Promise<Result<void>>;
  lock(input: MeetingScope<void>): Promise<Result<void>>;
  configure(
    input: MeetingScope<{
      settings: MeetingPreferences;
      acknowledged: boolean;
      applyRetention: boolean;
    }>,
  ): Promise<Result<void>>;
  create(
    input: MeetingScope<{ title: string; acknowledged: boolean }>,
  ): Promise<Result<MeetingDocument>>;
  saveSession(
    input: MeetingScope<{
      title: string;
      sessionId: string;
      acknowledged: boolean;
    }>,
  ): Promise<Result<MeetingDocument>>;
  list(input: MeetingScope<MeetingQuery>): Promise<Result<MeetingPage>>;
  get(input: MeetingScope<{ id: string }>): Promise<Result<MeetingDocument>>;
  transcript(
    input: MeetingScope<{ id: string; offset: number }>,
  ): Promise<Result<TranscriptPage>>;
  temporary(
    input: MeetingScope<void>,
  ): Promise<
    Result<{ document: MeetingDocument | null; segments: MeetingSegment[] }>
  >;
  edit(input: MeetingScope<MeetingEdit>): Promise<Result<MeetingDocument>>;
  speakerLabels(
    input: MeetingScope<{
      id: string;
      expectedRevision: number;
      labels: { ref: string; label: string }[];
    }>,
  ): Promise<Result<MeetingDocument>>;
  operation(
    input: MeetingScope<{
      id: string;
      expectedRevision: number;
      action: "delete" | "clear-transcript" | "clear-generated";
      acknowledged: boolean;
    }>,
  ): Promise<Result<void>>;
  deleteAll(
    input: MeetingScope<{ acknowledged: boolean }>,
  ): Promise<Result<void>>;
  resume(
    input: MeetingScope<{ id: string; acknowledged: boolean }>,
  ): Promise<Result<void>>;
  cancelResume(input: MeetingScope<void>): Promise<Result<void>>;
  end(input: MeetingScope<void>): Promise<Result<string | null>>;
  prepareAI(input: MeetingScope<MeetingSelection>): Promise<Result<string>>;
  askAI(
    input: MeetingScope<{ reviewId: string; acknowledged: boolean }>,
  ): Promise<Result<void>>;
  applyAI(
    input: MeetingScope<{
      draftId: string;
      meetingId: string;
      expectedRevision: number;
      sections: SummarySection[];
      overwriteManual: boolean;
    }>,
  ): Promise<Result<MeetingDocument>>;
  cancelAI(input: MeetingScope<void>): Promise<Result<void>>;
  authorisePost(
    input: MeetingScope<{
      expected: PostMeetingContext;
      acknowledged: boolean;
      sharing: { microphone: boolean; systemAudio: boolean };
      minutes: number;
      requestLimit: 1;
    }>,
  ): Promise<Result<void>>;
  cancelPost(input: MeetingScope<void>): Promise<Result<void>>;
}
