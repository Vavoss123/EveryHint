import { useEffect, useState } from "react";
import type { AssistantSnapshot } from "../../shared/ai";
import type {
  EvidenceText,
  MeetingDocument,
  MeetingState,
} from "../../shared/meetings";
import type {
  MeetingAIState,
  MeetingPurpose,
  SummarySection,
} from "../../shared/meeting-ai";
import { SUMMARY_SECTIONS } from "../../shared/meeting-ai";
import { meetingResult, meetingScope } from "./useMeetings";
import { ResponseText } from "./ResponseText";
import { MeetingEmailDraft } from "./MeetingSharing";
import { usePersonal } from "./PersonalPages";
const sectionLabels: Record<SummarySection, string> = {
  overview: "Overview",
  topics: "Discussion topics",
  points: "Important points",
  decisions: "Decisions",
  actions: "Action items",
  outstanding: "Outstanding questions",
  nextSteps: "Suggested next steps",
};
export function EvidenceItem({
  item,
  open,
}: {
  item: EvidenceText;
  open: (ref: string) => void;
}) {
  return (
    <div className="meeting-evidence">
      <p>{item.text}</p>
      <small>
        {item.authorship === "user"
          ? "Edited/written by you"
          : "AI-generated · review required"}{" "}
        ·{" "}
        {item.uncertainty === "uncertain"
          ? "Uncertain / proposed"
          : "Reported as explicit; check the source"}
      </small>
      {item.evidence.length > 0 && (
        <details>
          <summary>Supporting transcript</summary>
          {item.evidence.map((source, index) => (
            <div key={`${source.ref}-${index}`}>
              <blockquote>{source.quote}</blockquote>
              <button className="text-button" onClick={() => open(source.ref)}>
                View source transcript
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
export function MeetingAIReview({
  state,
  ai,
  assistant,
  meetingIds,
  temporary = false,
  selectedRefs = [],
  current,
  onSaved,
  onEvidence,
  connection,
  disabledReason,
}: {
  state: MeetingState;
  ai: MeetingAIState | null;
  assistant: AssistantSnapshot | null;
  meetingIds: string[];
  temporary?: boolean;
  selectedRefs?: string[];
  current?: MeetingDocument;
  onSaved: (doc: MeetingDocument) => void;
  onEvidence: (ref: string) => void;
  connection: () => void;
  disabledReason?: string;
}) {
  const personal = usePersonal();
  const [templateId, setTemplateId] = useState("");
  const [purpose, setPurpose] = useState<MeetingPurpose>("summary"),
    [question, setQuestion] = useState(""),
    [sources, setSources] = useState({
      microphone: false,
      systemAudio: false,
      notes: false,
    }),
    [sections, setSections] = useState<SummarySection[]>([...SUMMARY_SECTIONS]),
    [applySections, setApplySections] = useState<SummarySection[]>([
      ...SUMMARY_SECTIONS,
    ]),
    [ack, setAck] = useState(false),
    [overwrite, setOverwrite] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [textDraft, setTextDraft] = useState("");
  const review =
      assistant?.review?.requestId &&
      assistant.review.requestId === ai?.reviewId
        ? assistant.review
        : null,
    response = assistant?.responses.find(
      (value) => value.requestId === ai?.requestId,
    );
  useEffect(() => {
    setAck(false);
    setError(null);
  }, [state.scopeId, review?.requestId]);
  useEffect(() => {
    setTextDraft(ai?.textDraft ?? "");
  }, [ai?.textDraft, state.scopeId]);
  useEffect(() => {
    setApplySections(ai?.draft?.sections ?? [...SUMMARY_SECTIONS]);
    setOverwrite(false);
  }, [ai?.draft?.id]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The meeting AI action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const canReview =
    (temporary || meetingIds.length > 0) &&
    Object.values(sources).some(Boolean) &&
    !(purpose === "summary" && !sources.microphone && !sources.systemAudio);
  async function prepare() {
    await run(async () => {
      meetingResult(
        await window.everyhint.meetings.prepareAI(
          meetingScope(state, {
            purpose,
            question,
            meetingIds: temporary ? [] : meetingIds.slice(0, 3),
            temporary,
            sources,
            segmentIds: selectedRefs,
            sections,
            ...(templateId ? { templateId } : {}),
          }),
        ),
      );
    });
  }
  async function apply() {
    const draft = ai?.draft;
    if (!draft?.meetingId || draft.expectedRevision === null) return;
    await run(async () => {
      const saved = meetingResult(
        await window.everyhint.meetings.applyAI(
          meetingScope(state, {
            draftId: draft.id,
            meetingId: draft.meetingId!,
            expectedRevision: draft.expectedRevision!,
            sections: applySections,
            overwriteManual: overwrite,
          }),
        ),
      );
      onSaved(saved);
    });
  }
  return (
    <section className="panel-stack meeting-ai" aria-label="Meeting AI tools">
      <div className="section-heading">
        <h2>AI for selected meeting text</h2>
        <button className="secondary" onClick={connection}>
          Connection settings
        </button>
      </div>
      <p className="muted">
        Select sources and review the exact excerpts before sharing with OpenAI.
        This never sends all history, screenshots or raw audio. Temporary text
        is limited to the retained window.
      </p>
      <label>
        Action
        <select
          aria-label="Meeting AI action"
          value={purpose}
          disabled={busy || ai?.status === "sending"}
          onChange={(event) => {
            setPurpose(event.target.value as MeetingPurpose);
            if (event.target.value === "summary")
              setSources({ ...sources, notes: false });
          }}
        >
          <option value="summary">Generate meeting notes</option>
          <option value="ask">Ask about selected meetings</option>
          <option value="follow-up">Draft follow-up email</option>
          <option value="action-summary">Summarise agreed action items</option>
        </select>
      </label>
      <label>
        Question or focus
        <input
          aria-label="Meeting AI question"
          value={question}
          maxLength={4000}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      {purpose === "summary" && personal && (
        <label>
          Meeting note template
          <select
            aria-label="Meeting note template"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setAck(false);
            }}
          >
            <option value="">Active mode / default template</option>
            {personal.config.templates.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {(["microphone", "systemAudio", "notes"] as const).map((source) => (
        <label className="ai-choice" key={source}>
          <input
            type="checkbox"
            aria-label={`Meeting AI share ${source}`}
            checked={sources[source]}
            disabled={
              source === "notes" && (purpose === "summary" || temporary)
            }
            onChange={(event) =>
              setSources({ ...sources, [source]: event.target.checked })
            }
          />
          {source === "microphone"
            ? "Microphone final transcript"
            : source === "systemAudio"
              ? "System-audio final transcript"
              : "Saved user notes (unverified reference)"}
        </label>
      ))}
      {selectedRefs.length > 0 && (
        <p>{selectedRefs.length} explicitly selected transcript segment(s).</p>
      )}
      {purpose === "summary" && (
        <fieldset>
          <legend>Sections to generate or regenerate</legend>
          {SUMMARY_SECTIONS.map((section) => (
            <label className="ai-choice" key={section}>
              <input
                type="checkbox"
                checked={sections.includes(section)}
                onChange={(event) =>
                  setSections(
                    event.target.checked
                      ? [...sections, section]
                      : sections.filter((value) => value !== section),
                  )
                }
              />
              {sectionLabels[section]}
            </label>
          ))}
        </fieldset>
      )}
      {disabledReason && <p className="muted">{disabledReason}</p>}
      <button
        className="primary"
        disabled={
          Boolean(disabledReason) ||
          !canReview ||
          !sections.length ||
          busy ||
          ai?.status === "sending"
        }
        onClick={() => void prepare()}
      >
        Review meeting AI context
      </button>
      {review?.meetingContext && (
        <div
          className="context-review panel-stack"
          aria-label="Meeting AI context review"
        >
          <h3>Frozen ChatGPT-plan request · {review.model}</h3>
          <p>
            {review.meetingContext.meetings.map((doc) => doc.title).join(" · ")}
          </p>
          <small>
            {state.profileLabel} · {review.textChars.toLocaleString()} text
            characters · expires{" "}
            {new Date(review.expiresAt).toLocaleTimeString()}
          </small>
          <p>{review.question}</p>
          {review.notices.map((notice, index) => (
            <p className="muted" key={index}>
              {notice}
            </p>
          ))}
          <div className="meeting-excerpts">
            {review.meetingContext.excerpts.map((excerpt) => (
              <article className="review-item" key={excerpt.ref}>
                <small>
                  {excerpt.kind === "notes"
                    ? "User-authored notes"
                    : excerpt.source === "microphone"
                      ? "Microphone"
                      : "System audio · identity unknown"}{" "}
                  · {new Date(excerpt.at).toLocaleString()}
                </small>
                <p>{excerpt.text}</p>
              </article>
            ))}
          </div>
          <details>
            <summary>Exact text to be sent</summary>
            <pre className="meeting-raw">{review.prompt}</pre>
          </details>
          <label className="ai-choice">
            <input
              type="checkbox"
              aria-label="Acknowledge meeting AI remote sharing"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
            />
            I am authorised to share this exact selected meeting text with
            OpenAI using this ChatGPT-plan account/model.
          </label>
          <button
            className="primary"
            disabled={!ack || busy}
            onClick={() =>
              void run(async () => {
                meetingResult(
                  await window.everyhint.meetings.askAI(
                    meetingScope(state, {
                      reviewId: review.requestId,
                      acknowledged: true,
                    }),
                  ),
                );
                setAck(false);
              })
            }
          >
            Generate from approved meeting text
          </button>
        </div>
      )}
      {ai?.status === "sending" && (
        <div role="status">
          <p>
            {ai.purpose === "summary"
              ? "Generating a grounded meeting draft…"
              : "Generating a response from selected meeting text…"}
          </p>
          {ai.purpose !== "summary" && response?.text && (
            <ResponseText text={response.text} />
          )}
          <button
            className="secondary"
            onClick={() =>
              void window.everyhint.meetings.cancelAI(
                meetingScope(state, undefined),
              )
            }
          >
            Cancel meeting AI
          </button>
        </div>
      )}
      {ai?.draft && (
        <div className="card panel-stack" aria-label="Unsaved AI meeting draft">
          <h3>Unsaved meeting draft</h3>
          <p className="muted">
            Check every claim and supporting quote. Owners/deadlines absent from
            the cited text remain Unassigned / Not specified. Select sections to
            save; manual edits require separate replacement approval.
          </p>
          {ai.draft.summary.template ? (
            <TemplateSummary doc={ai.draft} open={onEvidence} />
          ) : (
            <>
              {ai.draft.summary.overview && (
                <EvidenceItem
                  item={ai.draft.summary.overview}
                  open={onEvidence}
                />
              )}
              {(["topics", "points", "outstanding", "nextSteps"] as const).map(
                (section) =>
                  ai.draft!.summary[section].length > 0 && (
                    <section key={section}>
                      <h3>{sectionLabels[section]}</h3>
                      {ai.draft!.summary[section].map((item, index) => (
                        <EvidenceItem
                          key={index}
                          item={item}
                          open={onEvidence}
                        />
                      ))}
                    </section>
                  ),
              )}
              {ai.draft.decisions.length > 0 && (
                <section>
                  <h3>Decisions</h3>
                  {ai.draft.decisions.map((item) => (
                    <EvidenceItem key={item.id} item={item} open={onEvidence} />
                  ))}
                </section>
              )}
              {ai.draft.actions.length > 0 && (
                <section>
                  <h3>Action items</h3>
                  {ai.draft.actions.map((item) => (
                    <div key={item.id}>
                      <EvidenceItem item={item} open={onEvidence} />
                      <small>
                        {item.owner ?? "Unassigned"} ·{" "}
                        {item.deadline ?? "Not specified"} · Open
                      </small>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {ai.draft.meetingId && ai.draft.meetingId === current?.id ? (
            <>
              <fieldset>
                <legend>Sections to apply</legend>
                {ai.draft.sections.map((section) => (
                  <label className="ai-choice" key={section}>
                    <input
                      type="checkbox"
                      checked={applySections.includes(section)}
                      onChange={(event) =>
                        setApplySections(
                          event.target.checked
                            ? [...applySections, section]
                            : applySections.filter(
                                (value) => value !== section,
                              ),
                        )
                      }
                    />
                    {sectionLabels[section]}
                    {current.editedSections.includes(section)
                      ? " · contains manual edits"
                      : ""}
                  </label>
                ))}
              </fieldset>
              <label className="ai-choice">
                <input
                  type="checkbox"
                  aria-label="Allow replacing manually edited summary sections"
                  checked={overwrite}
                  onChange={(event) => setOverwrite(event.target.checked)}
                />
                I explicitly approve replacing manual edits in the selected
                sections.
              </label>
              <button
                className="primary"
                disabled={
                  Boolean(disabledReason) || !applySections.length || busy
                }
                onClick={() => void apply()}
              >
                Save selected generated sections
              </button>
            </>
          ) : (
            <p className="muted">
              This draft is not attached to a saved meeting. Save the available
              temporary transcript first, or copy the draft. Combined-meeting
              results stay temporary.
            </p>
          )}
          <button
            className="secondary"
            onClick={() =>
              void run(async () => {
                meetingResult(
                  await window.everyhint.copyResponse(
                    JSON.stringify(ai.draft, null, 2),
                  ),
                );
              })
            }
          >
            Copy structured draft
          </button>
        </div>
      )}
      {ai?.textDraft !== null && ai?.textDraft !== undefined && (
        <div className="card panel-stack">
          <h3>
            {ai.purpose === "follow-up"
              ? "Editable follow-up email draft"
              : "Meeting response"}
          </h3>
          {ai.purpose === "follow-up" ? (
            <MeetingEmailDraft state={state} initial={textDraft} />
          ) : (
            <>
              <textarea
                aria-label="Editable meeting AI draft"
                rows={10}
                value={textDraft}
                maxLength={32000}
                onChange={(event) => setTextDraft(event.target.value)}
              />
              <button
                className="secondary"
                disabled={!textDraft.trim()}
                onClick={() =>
                  void run(async () => {
                    meetingResult(
                      await window.everyhint.copyResponse(textDraft),
                    );
                  })
                }
              >
                Copy draft
              </button>
            </>
          )}
          <small>
            No recipient is inferred and no email is sent automatically.
            Email-client handoff and export are available in the sharing tools.
          </small>
        </div>
      )}
      {(error || ai?.error) && (
        <p className="error-message" role="alert">
          {error ?? ai?.error}
        </p>
      )}
    </section>
  );
}
export function TemplateSummary({
  doc,
  open,
}: {
  doc: Pick<MeetingDocument, "summary" | "actions" | "decisions">;
  open: (ref: string) => void;
}) {
  if (!doc.summary?.template) return null;
  return (
    <div className="panel-stack" aria-label="Templated meeting notes">
      <p className="eyebrow">{doc.summary.template.name}</p>
      {doc.summary.template.sections.map((section) => {
        const items =
          section.source === "actions"
            ? doc.actions
            : section.source === "decisions"
              ? doc.decisions
              : section.source === "overview"
                ? doc.summary?.overview
                  ? [doc.summary.overview]
                  : []
                : (doc.summary?.[section.source] ?? []);
        return (
          <section key={section.source}>
            <h3>{section.heading}</h3>
            {items.length ? (
              items.map((item, i) => (
                <div key={i}>
                  <EvidenceItem item={item} open={open} />
                  {"owner" in item && "deadline" in item && (
                    <small>
                      {String(item.owner ?? "Unassigned")} ·{" "}
                      {String(item.deadline ?? "Not specified")}
                    </small>
                  )}
                </div>
              ))
            ) : (
              <p className="muted">
                No supported content saved for this section.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
