import { useEffect, useState } from "react";
import type { MeetingDocument, MeetingState } from "../../shared/meetings";
import {
  EXPORT_FORMATS,
  meetingEmailURL,
  type MeetingCopyKind,
  type MeetingExportFormat,
} from "../../shared/meeting-sharing";
import { meetingResult, meetingScope } from "./useMeetings";
export function MeetingSharingPanel({
  state,
  document,
  dirty,
}: {
  state: MeetingState;
  document: MeetingDocument;
  dirty: boolean;
}) {
  const [format, setFormat] = useState<MeetingExportFormat>("summary-txt"),
    [kind, setKind] = useState<MeetingCopyKind>("summary"),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setAck(false);
    setMessage(null);
    setError(null);
  }, [document.id, document.revision, state.scopeId]);
  async function run(task: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await task());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Meeting sharing failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const base = {
    id: document.id,
    expectedRevision: document.revision,
    acknowledged: ack,
  };
  return (
    <details
      className="card panel-stack"
      aria-label="Meeting export and local sharing"
    >
      <summary>Export and local sharing</summary>
      <p>
        Export and clipboard copies are unencrypted. Other applications,
        clipboard history or a chosen synced folder may retain them. Local
        deletion cannot remove those copies. Exports include saved content only;
        save or revert edits first.
      </p>
      <small>
        Transcript exports contain final text, timestamps, source labels and
        explicit user speaker labels. JSON includes all saved fields and
        transcript segments. Markdown includes manual notes. Summary text
        includes the saved summary, decisions and actions with source
        references. No raw audio or screenshots are included.
      </small>
      <label className="ai-choice">
        <input
          type="checkbox"
          aria-label="Acknowledge unencrypted meeting sharing"
          checked={ack}
          onChange={(event) => setAck(event.target.checked)}
        />
        I authorise creating an unencrypted copy of this meeting's selected
        content.
      </label>
      <label>
        Export format
        <select
          aria-label="Meeting export format"
          value={format}
          onChange={(event) =>
            setFormat(event.target.value as MeetingExportFormat)
          }
        >
          {Object.entries(EXPORT_FORMATS).map(([value, item]) => (
            <option key={value} value={value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="secondary"
        disabled={!ack || busy || dirty}
        onClick={() =>
          void run(async () => {
            const result = meetingResult(
              await window.everyhint.meetings.export(
                meetingScope(state, { ...base, format }),
              ),
            );
            return result.cancelled
              ? "Export cancelled; no file created."
              : `Exported ${result.name} (${result.bytes.toLocaleString()} bytes). This copy is unencrypted.`;
          })
        }
      >
        Choose file and export meeting
      </button>
      <small>
        Choose a new filename. Existing files are preserved. Large transcripts
        stream in bounded pages; a changed/deleted/locked meeting cancels the
        export.
      </small>
      <label>
        Clipboard content
        <select
          aria-label="Meeting clipboard content"
          value={kind}
          onChange={(event) => setKind(event.target.value as MeetingCopyKind)}
        >
          <option value="summary">
            Saved summary, decisions and action items
          </option>
          <option value="actions">Action items only</option>
          <option value="transcript">Full final transcript</option>
        </select>
      </label>
      <button
        className="secondary"
        disabled={!ack || busy || dirty}
        onClick={() =>
          void run(async () => {
            meetingResult(
              await window.everyhint.meetings.copy(
                meetingScope(state, { ...base, kind }),
              ),
            );
            return "Copied selected saved content to the system clipboard.";
          })
        }
      >
        Copy selected meeting content
      </button>
      <small>
        Transcript clipboard copies are limited to one million characters; use
        text export for larger meetings. Public hosted sharing links need a
        secure backend and are not available.
      </small>
      {dirty && (
        <p className="muted">Save or revert your edits before sharing.</p>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </details>
  );
}
export function MeetingEmailDraft({
  state,
  initial,
}: {
  state: MeetingState;
  initial: string;
}) {
  const [to, setTo] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(initial),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const match = /^\s*Subject:\s*([^\r\n]+)\r?\n?/i.exec(initial);
    setTo("");
    setSubject(match?.[1]?.trim().slice(0, 200) ?? "");
    setBody(match ? initial.slice(match[0].length).trimStart() : initial);
    setAck(false);
    setMessage(null);
    setError(null);
  }, [initial, state.scopeId]);
  const payload = { to, subject, body, acknowledged: ack };
  let handoffError: string | null = null;
  try {
    meetingEmailURL({ ...payload, acknowledged: true });
  } catch (error) {
    handoffError =
      error instanceof Error ? error.message : "Review the email draft.";
  }
  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await task();
      setMessage(success);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "The email action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="meeting-email panel-stack"
      aria-label="Editable follow-up email"
    >
      <p>
        Review and edit the complete draft before copying or handing it to an
        email application. Recipients are never inferred. Opening an email app
        may expose or sync this text under that app's settings; EveryHint does
        not send it.
      </p>
      <label>
        Recipients (optional, comma separated)
        <input
          aria-label="Follow-up recipients"
          maxLength={500}
          value={to}
          placeholder="No recipients selected"
          onChange={(event) => {
            setTo(event.target.value);
            setAck(false);
          }}
        />
      </label>
      <label>
        Subject
        <input
          aria-label="Follow-up subject"
          maxLength={200}
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setAck(false);
          }}
        />
      </label>
      <label>
        Body
        <textarea
          aria-label="Editable meeting AI draft"
          rows={12}
          maxLength={32000}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setAck(false);
          }}
        />
      </label>
      <button
        className="secondary"
        disabled={!body.trim() || busy}
        onClick={() =>
          void run(async () => {
            meetingResult(
              await window.everyhint.copyResponse(
                `${to.trim() ? `To: ${to.trim()}\n` : ""}Subject: ${subject}\n\n${body}`,
              ),
            );
          }, "Copied the complete edited email draft to the system clipboard.")
        }
      >
        Copy email draft
      </button>
      <small>
        Clipboard copies are unencrypted. No recipient is added automatically.
      </small>
      <label className="ai-choice">
        <input
          type="checkbox"
          aria-label="Approve external email-client handoff"
          checked={ack}
          onChange={(event) => setAck(event.target.checked)}
        />
        I approve passing these exact recipients, subject and body to my email
        application. I will review and send there.
      </label>
      <button
        className="secondary"
        disabled={!ack || Boolean(handoffError) || busy}
        onClick={() =>
          void run(async () => {
            meetingResult(
              await window.everyhint.meetings.email(
                meetingScope(state, payload),
              ),
            );
            setAck(false);
          }, "Handed the draft to your email application. EveryHint has not sent an email.")
        }
      >
        Open approved draft in email app
      </button>
      {handoffError && <small>{handoffError}</small>}
      <small>
        Client handoff uses a conservatively limited mailto link. Longer drafts
        must be copied; content is never silently truncated. Direct Gmail and
        hosted sharing are deferred.
      </small>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
