import type { EveryHintBridge } from "../../shared/contracts";
declare global {
  interface Window {
    everyhint: EveryHintBridge;
  }
}
