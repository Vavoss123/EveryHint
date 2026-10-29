import type { AccountConnection } from "./accounts";
import type { AIModel, ProviderStatus } from "./ai";

export type ConnectionLabel =
  | "Not signed in"
  | "Signed in, model setup required"
  | "Ready"
  | "Reconnecting"
  | "Connection problem";
export function connectionLabel(
  provider?: ProviderStatus,
  account?: AccountConnection | null,
): ConnectionLabel {
  if (account?.state === "signing-in" || account?.state === "signing-out")
    return "Reconnecting";
  if (account?.state === "error" || provider?.auth === "error")
    return "Connection problem";
  if (account?.state === "signed-out" || account?.state === "cancelled")
    return "Not signed in";
  if (provider?.auth === "unknown") return "Reconnecting";
  if (provider?.ready) return "Ready";
  if (
    provider?.auth === "chatgpt" ||
    account?.accounts?.some(
      (a) => a.id === account.selectedAccount && a.signedIn,
    )
  )
    return "Signed in, model setup required";
  return "Not signed in";
}
export function defaultCatalogModel(
  models: AIModel[] = [],
): AIModel | undefined {
  return models.find((model) => model.images) ?? models[0];
}
