export type UpdateAction = "check" | "download" | "install" | "cancel";
export interface UpdateSnapshot {
  state: "unconfigured" | "idle" | "checking" | "current" | "available" | "downloading" | "cancelling" | "downloaded" | "installing" | "error";
  message: string;
  availableVersion: string | null;
  progress: number | null;
  checkedAt: number | null;
}
