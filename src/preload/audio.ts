import { contextBridge, ipcRenderer } from "electron";
import type { AudioWorkerBridge } from "../shared/audio-ipc";
const bridge: AudioWorkerBridge = {
  configuration: () => ipcRenderer.invoke("everyhint:audio-configuration"),
  ready: () => ipcRenderer.invoke("everyhint:audio-ready"),
  report: (value) => ipcRenderer.send("everyhint:audio-report", value),
  onControl: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      command: { muted: boolean },
    ) => listener(command);
    ipcRenderer.on("everyhint:audio-control", handler);
    return () => {
      ipcRenderer.removeListener("everyhint:audio-control", handler);
    };
  },
};
contextBridge.exposeInMainWorld("audioHost", bridge);
