import { contextBridge, ipcRenderer } from "electron";
import type { AppSnapshot, EveryHintBridge } from "../shared/contracts";

const bridge: EveryHintBridge = {
  getSnapshot: () => ipcRenderer.invoke("everyhint:get"),
  listSources: (consent) => ipcRenderer.invoke("everyhint:sources", consent),
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
};
contextBridge.exposeInMainWorld("everyhint", bridge);
