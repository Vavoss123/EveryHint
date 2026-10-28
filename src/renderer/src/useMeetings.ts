import { useEffect, useState } from "react";
import type { MeetingState } from "../../shared/meetings";
import type { MeetingAIState } from "../../shared/meeting-ai";
import type { Result } from "../../shared/contracts";
export function meetingResult<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export function meetingScope<T>(state: MeetingState, input: T) {
  return { scopeId: state.scopeId, input };
}
export function useMeetings() {
  const [state, setState] = useState<MeetingState | null>(null),
    [ai, setAI] = useState<MeetingAIState | null>(null);
  useEffect(() => {
    const accept = (value: MeetingState) =>
      setState((previous) =>
        !previous || value.revision >= previous.revision ? value : previous,
      );
    const acceptAI = (value: MeetingAIState) =>
      setAI((previous) =>
        !previous || value.revision >= previous.revision ? value : previous,
      );
    const off = window.everyhint.meetings.onState(accept),
      offAI = window.everyhint.meetings.onAI(acceptAI);
    void window.everyhint.meetings
      .getState()
      .then((result) => accept(meetingResult(result)))
      .catch(() => {});
    void window.everyhint.meetings
      .getAI()
      .then((result) => acceptAI(meetingResult(result)))
      .catch(() => {});
    return () => {
      off();
      offAI();
    };
  }, []);
  return { state, ai };
}
