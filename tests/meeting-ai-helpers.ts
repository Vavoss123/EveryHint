import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { vi } from "vitest";
import type { AIProvider, AIRequest, ProviderEvent } from "../src/shared/ai";
import type { MeetingAIContext } from "../src/shared/meeting-ai";
import { SUMMARY_SECTIONS } from "../src/shared/meeting-ai";
import type { SessionSnapshot } from "../src/shared/contracts";
import type { TranscriptEvent } from "../src/shared/transcription";
import { CaptureSessionController } from "../src/main/session";
import { AssistantController } from "../src/main/ai/controller";
import { MeetingController } from "../src/main/meetings/controller";
import { MeetingAIController } from "../src/main/meetings/ai";
import { PostMeetingNotes } from "../src/main/meetings/post-notes";
import { MeetingPreferencesStore } from "../src/main/meetings/preferences";
import { MeetingDatabase } from "../src/main/meetings/database";
import type { MeetingStore } from "../src/main/meetings/store";
import { historyProfile } from "../src/main/meetings/keys";
import { backend, consent } from "./helpers";

export function summaryFixture(context: MeetingAIContext) {
  const excerpts = context.excerpts.filter(
      (excerpt) => excerpt.kind === "transcript",
    ),
    first = excerpts[0]!,
    task =
      excerpts.find((excerpt) => excerpt.text.includes("checklist")) ?? first;
  const claim = {
    text: first.text,
    evidence: [{ ref: first.ref, quote: first.text }],
    uncertainty: "explicit",
  };
  return {
    overview: claim,
    topics: [claim],
    points: [],
    decisions: first.text.includes("decided") ? [claim] : [],
    actions: [
      {
        text: "Prepare the test checklist",
        evidence: [{ ref: task.ref, quote: task.text }],
        uncertainty: "explicit",
        owner: "I",
        deadline: "Wednesday",
        status: "open",
      },
    ],
    outstanding: [],
    nextSteps: [],
  };
}
export async function meetingHarness(
  options: { saved?: boolean; provider?: AIProvider } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "everyhint-p8-ai-")),
    profile = historyProfile(root, "account-a");
  let db: MeetingDatabase | undefined;
  let capture: SessionSnapshot = {
    ...new CaptureSessionController(
      backend(),
      () => 3000,
      () => {},
    ).value,
    state: "ACTIVE",
    sessionId: "capture-a",
    epoch: 1,
    consent: { ...consent, screen: false, microphone: true, systemAudio: true },
  };
  capture.sources.microphone.state = "CAPTURING";
  capture.sources.systemAudio.state = "CAPTURING";
  const phrases = [
    "We decided to release the prototype on Thursday.",
    "I will prepare the test checklist by Wednesday.",
    "The owner and deadline for documentation are not specified.",
  ];
  const events: TranscriptEvent[] = phrases.map((text, index) => ({
    id: `utterance-${index}`,
    sessionId: "capture-a",
    source: index === 1 ? "microphone" : "systemAudio",
    state: "final",
    startMs: Date.now() - 6000 + index * 1000,
    endMs: Date.now() - 5500 + index * 1000,
    text,
    model: "tiny.en",
  }));
  const connection = {
    accountId: "account-a" as string | null,
    accountLabel: "Synthetic account A",
    transcribing: true,
  };
  const listener: { ai?: MeetingAIController; post?: PostMeetingNotes } = {};
  const mockProvider = {
    id: "codex" as const,
    inspect: vi.fn(async () => ({
      id: "codex" as const,
      auth: "chatgpt" as const,
      ready: true,
      message: "Fixture provider",
      capabilities: { text: true, images: false, tools: false as const },
      models: ["fixture-plan"],
      selectedModel: "fixture-plan",
    })),
    respond: vi.fn(async function* (
      request: AIRequest,
      _signal: AbortSignal,
      guard?: () => boolean,
    ): AsyncGenerator<ProviderEvent> {
      void _signal;
      if (guard && !guard())
        throw Error("Scope changed before fake transport.");
      yield {
        type: "complete",
        text:
          request.meetingContext?.purpose === "summary"
            ? JSON.stringify(summaryFixture(request.meetingContext))
            : "Synthetic fixture reply [selected transcript reference]",
        model: "fixture-plan",
      };
    }),
    dispose: vi.fn(),
  };
  const claude: AIProvider = {
    id: "claude",
    inspect: async () => ({
      id: "claude",
      auth: "missing",
      ready: false,
      message: "No paid fixture",
      capabilities: { text: false, images: false, tools: false },
      models: [],
    }),
    respond: vi.fn(),
    dispose: () => {},
  };
  const assistant = new AssistantController(
    [options.provider ?? mockProvider, claude],
    () => ({ capture, events }),
    (snapshot) => listener.ai?.assistantChanged(snapshot),
  );
  assistant.captureChanged(capture);
  await assistant.inspect();
  const recorder = new MeetingController(
    () => ({ capture, events }),
    async (selected): Promise<MeetingStore> => {
      db = new MeetingDatabase(
        join(root, `${selected}.sqlite`),
        randomBytes(32),
        selected,
      );
      const database = db;
      return {
        isCurrent: (id, revision) => {
          try {
            return db === database && database.get(id).revision === revision;
          } catch {
            return false;
          }
        },
        contextSegments: async (...args) => database.contextSegments(...args),
        findTranscript: async (...args) => database.findTranscript(...args),
        speakerLabels: async (...args) => database.speakerLabels(...args),
        create: async (...args) => database.create(...args),
        get: async (...args) => database.get(...args),
        update: async (...args) => database.update(...args),
        begin: async (...args) => database.begin(...args),
        append: async (...args) => database.append(...args),
        finish: async (...args) => database.finish(...args),
        transcript: async (...args) => database.transcript(...args),
        list: async (...args) => database.list(...args),
        delete: async (...args) => database.delete(...args),
        deleteAll: async () => database.deleteAll(),
        retention: async (...args) => database.retention(...args),
        clearTranscript: async (...args) => database.clearTranscript(...args),
        recover: async (...args) => database.recover(...args),
        close: async () => {
          if (db === database) {
            db = undefined;
            database.close();
          }
        },
      };
    },
    new MeetingPreferencesStore(join(root, "preferences")),
    () => {},
  );
  recorder.switchProfile(profile, "Synthetic account A history");
  let saved = null;
  if (options.saved !== false) {
    await recorder.configure({
      settings: { enabled: true, autoSave: false, retentionDays: 30 },
      acknowledged: true,
      applyRetention: true,
    });
    saved = await recorder.saveCapture({
      sessionId: "capture-a",
      title: "Labelled release fixture",
      acknowledged: true,
    });
  }
  const ai = new MeetingAIController(
    assistant,
    recorder,
    () => ({ capture, events }),
    () => connection,
    () => listener.post?.observe(),
  );
  listener.ai = ai;
  const post = new PostMeetingNotes(
    ai,
    recorder,
    assistant,
    () => capture,
    () => connection,
    () => {},
  );
  listener.post = post;
  const selection = {
    purpose: "summary" as const,
    meetingIds: saved ? [saved.id] : [],
    temporary: !saved,
    question: "",
    sources: { microphone: true, systemAudio: true, notes: false },
    segmentIds: [],
    sections: [...SUMMARY_SECTIONS],
  };
  const stop = () => {
    capture = {
      ...capture,
      state: "STOPPED",
      sessionId: null,
      consent: null,
      epoch: capture.epoch + 1,
    };
    assistant.captureChanged(capture);
    recorder.observe(capture, events);
    post.observe();
  };
  return {
    root,
    profile,
    saved,
    events,
    connection,
    recorder,
    assistant,
    ai,
    post,
    selection,
    mockProvider,
    capture: () => capture,
    setCapture: (value: SessionSnapshot) => {
      capture = value;
    },
    db: () => db!,
    stop,
    close: async () => {
      post.dispose();
      ai.cancel();
      recorder.lock();
      await assistant.dispose();
      if (db) {
        db.close();
        db = undefined;
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}
