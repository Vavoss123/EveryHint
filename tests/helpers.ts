import { vi } from "vitest";
import type {
  CaptureSource,
  Consent,
  ScreenFrame,
} from "../src/shared/contracts";

export const consent: Consent = {
  screen: true,
  microphone: false,
  systemAudio: false,
  acknowledged: true,
};
export const source: CaptureSource = {
  id: "screen:1:0",
  name: "Screen 1",
  kind: "screen",
};
export const frame: ScreenFrame = {
  dataUrl: "data:image/jpeg;base64,dGVzdA==",
  width: 960,
  height: 540,
  capturedAt: 123,
};
export const backend = () => ({
  listSources: vi.fn(async () => [source]),
  capture: vi.fn(async () => frame),
});
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
