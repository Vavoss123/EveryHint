export interface AccountConnection {
  revision: number;
  state:
    | "signed-out"
    | "signing-in"
    | "signed-in"
    | "signing-out"
    | "cancelled"
    | "error";
  message: string;
}
export type AccountAction = "sign-in" | "cancel" | "sign-out";
