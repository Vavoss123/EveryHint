export interface WindowPrivacy {
  requested: boolean;
  configured: boolean;
  state: "off" | "configured" | "error" | "unsupported";
  message: string;
}
export interface DesktopStatus {
  version: string;
  platform: string;
  arch: string;
  packaged: boolean;
  updates: import("./updates").UpdateSnapshot;
}
export const WINDOW_PRIVACY_LIMIT =
  "Configuration is not a guarantee across capture methods. Verify on the receiving device before sharing sensitive content.";
