import { useEffect, useState } from "react";
import type { ListenSnapshot } from "../../shared/listen";

export function useListen(): ListenSnapshot | null {
  const [value, setValue] = useState<ListenSnapshot | null>(null);
  useEffect(() => {
    const accept = (next: ListenSnapshot) =>
      setValue((old) => (!old || next.revision >= old.revision ? next : old));
    const off = window.everyhint.listen.onState(accept);
    void window.everyhint.listen.get().then((result) => {
      if (result.ok) accept(result.value);
    });
    return off;
  }, []);
  return value;
}
