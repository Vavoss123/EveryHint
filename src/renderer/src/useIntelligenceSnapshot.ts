import { useEffect, useState } from "react";
import type { IntelligenceSnapshot } from "../../shared/intelligence";
export function useIntelligenceSnapshot(): IntelligenceSnapshot | null {
  const [value, setValue] = useState<IntelligenceSnapshot | null>(null);
  useEffect(() => {
    const accept = (next: IntelligenceSnapshot) =>
      setValue((previous) =>
        !previous || next.revision >= previous.revision ? next : previous,
      );
    const off = window.everyhint.onIntelligence(accept);
    void window.everyhint.getIntelligence().then((result) => {
      if (result.ok) accept(result.value);
    });
    return off;
  }, []);
  return value;
}
