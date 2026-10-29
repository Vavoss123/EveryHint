import { WINDOW_PRIVACY_LIMIT, type WindowPrivacy } from "../shared/desktop";
interface PrivacyWindow {
  setContentProtection(value: boolean): void;
  isContentProtected(): boolean;
}
export function configureWindowPrivacy(
  window: PrivacyWindow,
  requested: boolean,
  platform: string = process.platform,
): WindowPrivacy {
  if (platform !== "win32")
    return {
      requested,
      configured: false,
      state: "unsupported",
      message: "Window-content protection is unavailable in this Windows-only control. " + WINDOW_PRIVACY_LIMIT,
    };
  try {
    window.setContentProtection(requested);
    const configured = window.isContentProtected();
    if (configured !== requested) throw new Error("Configuration readback differed.");
    return {
      requested,
      configured,
      state: configured ? "configured" : "off",
      message: (configured ? "Windows window-content protection configured. " : "Window-content protection is off. ") + WINDOW_PRIVACY_LIMIT,
    };
  } catch {
    return {
      requested,
      configured: false,
      state: "error",
      message: "Windows window-content protection could not be confirmed. Keep sensitive content out of shared screens. " + WINDOW_PRIVACY_LIMIT,
    };
  }
}
