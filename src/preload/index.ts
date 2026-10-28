import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSnapshot,
  AudioMeterEvent,
  EveryHintBridge,
} from "../shared/contracts";

const bridge: EveryHintBridge = {
  meetings: Object.freeze({
    export: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["export"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-export", input),
    copy: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["copy"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-copy", input),
    email: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["email"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-email", input),
    findTranscript: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["findTranscript"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-find-transcript", input),
    reference: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["reference"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-reference", input),
    getState: () => ipcRenderer.invoke("everyhint:meetings-state"),
    onState: (
      listener: (value: import("../shared/meetings").MeetingState) => void,
    ) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        value: import("../shared/meetings").MeetingState,
      ) => listener(value);
      ipcRenderer.on("everyhint:meetings-state", wrapped);
      return () =>
        ipcRenderer.removeListener("everyhint:meetings-state", wrapped);
    },
    getAI: () => ipcRenderer.invoke("everyhint:meeting-ai-state"),
    onAI: (
      listener: (value: import("../shared/meeting-ai").MeetingAIState) => void,
    ) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        value: import("../shared/meeting-ai").MeetingAIState,
      ) => listener(value);
      ipcRenderer.on("everyhint:meeting-ai-state", wrapped);
      return () =>
        ipcRenderer.removeListener("everyhint:meeting-ai-state", wrapped);
    },
    unlock: (input: import("../shared/meeting-bridge").MeetingScope<void>) =>
      ipcRenderer.invoke("everyhint:meetings-unlock", input),
    lock: (input: import("../shared/meeting-bridge").MeetingScope<void>) =>
      ipcRenderer.invoke("everyhint:meetings-lock", input),
    configure: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["configure"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-configure", input),
    create: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["create"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-create", input),
    saveSession: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["saveSession"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-save-session", input),
    list: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["list"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-list", input),
    get: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["get"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-get", input),
    transcript: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["transcript"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-transcript", input),
    temporary: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["temporary"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-temporary", input),
    edit: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["edit"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-edit", input),
    speakerLabels: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["speakerLabels"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-speaker-labels", input),
    operation: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["operation"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-operation", input),
    deleteAll: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["deleteAll"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-delete-all", input),
    resume: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["resume"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-resume", input),
    cancelResume: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["cancelResume"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-cancel-resume", input),
    end: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["end"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-end", input),
    prepareAI: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["prepareAI"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-ai-prepare", input),
    askAI: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["askAI"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-ai-ask", input),
    applyAI: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["applyAI"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-ai-apply", input),
    cancelAI: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["cancelAI"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-ai-cancel", input),
    authorisePost: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["authorisePost"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-post-authorise", input),
    cancelPost: (
      input: Parameters<
        import("../shared/meeting-bridge").MeetingBridge["cancelPost"]
      >[0],
    ) => ipcRenderer.invoke("everyhint:meetings-post-cancel", input),
  }),
  authoriseLive: (input) =>
    ipcRenderer.invoke("everyhint:intelligence-authorise", input),
  pauseLive: () => ipcRenderer.invoke("everyhint:intelligence-pause"),
  getIntelligence: () => ipcRenderer.invoke("everyhint:intelligence-get"),
  setOperatingMode: (mode) =>
    ipcRenderer.invoke("everyhint:intelligence-mode", mode),
  saveIntelligenceSettings: (settings) =>
    ipcRenderer.invoke("everyhint:intelligence-configure", settings),
  contextualAction: (input) =>
    ipcRenderer.invoke("everyhint:intelligence-action", input),
  dismissSuggestion: (input) =>
    ipcRenderer.invoke("everyhint:intelligence-dismiss", input),
  onIntelligence: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      value: import("../shared/intelligence").IntelligenceSnapshot,
    ): void => listener(value);
    ipcRenderer.on("everyhint:intelligence", wrapped);
    return () => ipcRenderer.removeListener("everyhint:intelligence", wrapped);
  },
  removeContext: (input) => ipcRenderer.invoke("everyhint:ai-remove", input),
  onAssist: (listener) => {
    const wrapped = (): void => listener();
    ipcRenderer.on("everyhint:assist", wrapped);
    return () => ipcRenderer.removeListener("everyhint:assist", wrapped);
  },
  getAccountConnection: () => ipcRenderer.invoke("everyhint:account-get"),
  account: (action) => ipcRenderer.invoke("everyhint:account-action", action),
  selectChatgptAccount: (id) =>
    ipcRenderer.invoke("everyhint:account-select", id),
  discoverModels: () => ipcRenderer.invoke("everyhint:ai-models"),
  selectModel: (id) => ipcRenderer.invoke("everyhint:ai-model-select", id),
  onAccountConnection: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      value: import("../shared/accounts").AccountConnection,
    ): void => listener(value);
    ipcRenderer.on("everyhint:account", wrapped);
    return () => {
      ipcRenderer.removeListener("everyhint:account", wrapped);
    };
  },
  getAssistant: () => ipcRenderer.invoke("everyhint:ai-get"),
  inspectProviders: () => ipcRenderer.invoke("everyhint:ai-inspect"),
  selectProvider: (provider) =>
    ipcRenderer.invoke("everyhint:ai-select", provider),
  setClaudeApiBilling: (enabled) =>
    ipcRenderer.invoke("everyhint:ai-billing", enabled),
  reviewContext: (input) => ipcRenderer.invoke("everyhint:ai-review", input),
  ask: (input) => ipcRenderer.invoke("everyhint:ai-ask", input),
  copyResponse: (text) => ipcRenderer.invoke("everyhint:ai-copy", text),
  assistant: (action) => ipcRenderer.invoke("everyhint:ai-action", action),
  onAssistant: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      value: import("../shared/ai").AssistantSnapshot,
    ): void => listener(value);
    ipcRenderer.on("everyhint:assistant", wrapped);
    return () => {
      ipcRenderer.removeListener("everyhint:assistant", wrapped);
    };
  },
  getTranscription: () => ipcRenderer.invoke("everyhint:transcription-get"),
  transcription: (action) =>
    ipcRenderer.invoke("everyhint:transcription-action", action),
  installSpeechModel: (model) =>
    ipcRenderer.invoke("everyhint:transcription-install", model),
  saveTranscriptionSettings: (settings) =>
    ipcRenderer.invoke("everyhint:transcription-settings", settings),
  onTranscription: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      value: import("../shared/transcription").TranscriptionSnapshot,
    ) => listener(value);
    ipcRenderer.on("everyhint:transcription", wrapped);
    return () => {
      ipcRenderer.removeListener("everyhint:transcription", wrapped);
    };
  },
  getSnapshot: () => ipcRenderer.invoke("everyhint:get"),
  listSources: (consent) => ipcRenderer.invoke("everyhint:sources", consent),
  listMicrophones: (consent) =>
    ipcRenderer.invoke("everyhint:microphones", consent),
  setMicrophoneMuted: (muted) =>
    ipcRenderer.invoke("everyhint:microphone-mute", muted),
  prepare: (input) => ipcRenderer.invoke("everyhint:prepare", input),
  session: (action) => ipcRenderer.invoke("everyhint:session", action),
  saveSettings: (settings) =>
    ipcRenderer.invoke("everyhint:settings", settings),
  window: (action) => ipcRenderer.invoke("everyhint:window", action),
  onSnapshot: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      value: AppSnapshot,
    ): void => listener(value);
    ipcRenderer.on("everyhint:snapshot", wrapped);
    return () => {
      ipcRenderer.removeListener("everyhint:snapshot", wrapped);
    };
  },
  onAudioMeters: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      value: AudioMeterEvent,
    ): void => listener(value);
    ipcRenderer.on("everyhint:audio-meters", wrapped);
    return () => {
      ipcRenderer.removeListener("everyhint:audio-meters", wrapped);
    };
  },
};
contextBridge.exposeInMainWorld("everyhint", bridge);
