import type { AudioWorkerPlan } from "../shared/audio-ipc";
export function audioPermissionAllowed(
  plan: AudioWorkerPlan | undefined,
  permission: string,
  mediaTypes: readonly string[],
  mainFrame: boolean,
): boolean {
  if (!plan || !mainFrame || !mediaTypes.length) return false;
  if (permission === "media")
    return (
      plan.capture.microphone && mediaTypes.every((type) => type === "audio")
    );
  return (
    permission === "display-capture" &&
    plan.mode === "capture" &&
    plan.capture.systemAudio &&
    mediaTypes.every((type) => type === "audio" || type === "video")
  );
}
