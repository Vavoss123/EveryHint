import { useEffect, useState } from "react";
import type { AssistantSnapshot } from "../../shared/ai";
export function useAssistantSnapshot(): AssistantSnapshot | null {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const accept = (next: AssistantSnapshot) => {
      if (alive)
        setSnapshot((old) =>
          !old || next.revision >= old.revision ? next : old,
        );
    };
    const off = window.everyhint.onAssistant(accept);
    void window.everyhint
      .getAssistant()
      .then((result) => {
        if (result.ok) accept(result.value);
      })
      .catch(() => {});
    return () => {
      alive = false;
      off();
    };
  }, []);
  return snapshot;
}
