import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSnapshot,
  AudioMeterEvent,
  EveryHintBridge,
} from "../shared/contracts";

const bridge: EveryHintBridge = {
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
