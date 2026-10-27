import type { AudioWorkerBridge } from "../../shared/audio-ipc";
import { BrowserAudioCapture } from "./engine";
import workletUrl from "./worklet.ts?worker&url";
import { errorMessage } from "../../shared/validation";
declare global {
  interface Window {
    audioHost: AudioWorkerBridge;
    startEveryHintAudio(): Promise<void>;
  }
}

let transcriptionToken: string | null = null;
const sending: Record<string, boolean> = {};
const engine = new BrowserAudioCapture(
  {
    devices: navigator.mediaDevices,
    createContext: () => new AudioContext({ latencyHint: "interactive" }),
    createNode: (context) =>
      new AudioWorkletNode(context, "everyhint-pcm", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      }),
    workletUrl,
  },
  (sources) => window.audioHost.report({ type: "diagnostics", sources }),
  (message, source) =>
    window.audioHost.report({
      type: "error",
      message: message.slice(0, 1000),
      source,
    }),
  (frame) => {
    const token = transcriptionToken;
    if (!token || sending[frame.source]) return;
    sending[frame.source] = true;
    void window.audioHost
      .pcm(token, frame)
      .catch((error: unknown) => {
        if (transcriptionToken === token)
          window.audioHost.report({
            type: "error",
            message: `Local PCM transport failed: ${errorMessage(error)}`.slice(
              0,
              1000,
            ),
            source: frame.source,
          });
      })
      .finally(() => {
        sending[frame.source] = false;
      });
  },
);
window.addEventListener("pagehide", () => engine.stop());
window.audioHost.onControl(({ muted, transcriptionToken: token }) => {
  if (typeof muted === "boolean") engine.setMicrophoneMuted(muted);
  if (token === null || typeof token === "string") transcriptionToken = token;
});
void window.audioHost
  .configuration()
  .then(async (plan) => {
    if (plan.mode === "devices") {
      const devices = await navigator.mediaDevices.enumerateDevices();
      window.audioHost.report({
        type: "devices",
        devices: devices
          .filter((device) => device.kind === "audioinput" && device.deviceId)
          .slice(0, 128)
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: (device.label || `Microphone ${index + 1}`).slice(0, 200),
          })),
      });
    } else {
      window.startEveryHintAudio = () => engine.start(plan.capture);
      await window.audioHost.ready();
    }
  })
  .catch((error: unknown) =>
    window.audioHost.report({
      type: "error",
      message: errorMessage(error).slice(0, 1000),
    }),
  );
