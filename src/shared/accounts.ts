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
  planUsage?: boolean;
  selectedAccount?: string | null;
  accounts?: { id: string; label: string; signedIn: boolean }[];
}
export type AccountAction = "sign-in" | "cancel" | "sign-out" | "grant-plan";
