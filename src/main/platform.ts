import { release } from "node:os";

export function systemAudioAvailable(
  platform: string = process.platform,
  kernel: string = release(),
  pulseInstalled = false,
): boolean {
  if (platform === "win32") return true;
  if (platform === "linux") return pulseInstalled;
  // macOS 14.2 is Darwin 23.2. Electron uses the CoreAudio Tap API.
  if (platform !== "darwin") return false;
  const [major, minor] = kernel.split(".").map(Number);
  return major! > 23 || (major === 23 && minor! >= 2);
}
export function systemAudioDescription(
  platform: string,
  supported: boolean,
): string {
  if (platform === "darwin")
    return supported
      ? "System playback; allow System Audio Recording in macOS Privacy & Security."
      : "System audio needs macOS 14.2 or later.";
  if (platform === "linux")
    return supported
      ? "Default output monitor through PulseAudio or PipeWire-Pulse."
      : "Install pulseaudio-utils and run a PulseAudio or PipeWire-Pulse desktop session.";
  return "System playback through Windows loopback.";
}
export function screenCaptureAvailable(
  platform = process.platform,
  environment = process.env,
): boolean {
  return (
    platform !== "linux" ||
    !(
      environment.XDG_SESSION_TYPE === "wayland" ||
      (environment.WAYLAND_DISPLAY && environment.XDG_SESSION_TYPE !== "x11")
    )
  );
}
