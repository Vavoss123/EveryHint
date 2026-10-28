import { useEffect, useState } from "react";
import {
  builtInModes,
  MODE_ICONS,
  type AIMode,
  type ModeChange,
} from "../../shared/modes";
import type { PersonalState } from "../../shared/personal";
import {
  ACTION_LABELS,
  type ContextualAction,
} from "../../shared/intelligence";
import { DEFAULT_CONTEXT } from "../../shared/ai";
import type {
  KnowledgeExcerpt,
  KnowledgeSection,
} from "../../shared/knowledge";
import {
  builtInTemplates,
  type NoteTemplate,
  type TemplateChange,
} from "../../shared/templates";
import { SUMMARY_SECTIONS } from "../../shared/meeting-ai";
import { Icon } from "./components/Icon";

export function usePersonal() {
  const [state, setState] = useState<PersonalState | null>(null);
  useEffect(() => {
    const accept = (next: PersonalState) =>
      setState((old) => (!old || next.revision >= old.revision ? next : old));
    const off = window.everyhint.personal.onState(accept);
    void window.everyhint.personal.get().then((r) => {
      if (r.ok) accept(r.value);
    });
    return off;
  }, []);
  return state;
}
export async function personalCommand(
  state: PersonalState,
  value: Parameters<typeof window.everyhint.personal.command>[0]["value"],
) {
  const result = await window.everyhint.personal.command({
    scopeId: state.scopeId,
    value,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
export function ModeSelector() {
  const state = usePersonal(),
    [error, setError] = useState("");
  if (!state) return null;
  return (
    <div className="mode-selector">
      <label>
        AI mode{" "}
        <select
          aria-label="Active AI mode"
          value={state.config.activeModeId}
          onChange={(e) => {
            setError("");
            void personalCommand(state, {
              type: "select",
              id: e.target.value,
            }).catch((e) => setError(String(e.message)));
          }}
        >
          {state.config.modes.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function PersonalGate({
  state,
  children,
}: {
  state: PersonalState | null;
  children: React.ReactNode;
}) {
  const [error, setError] = useState("");
  if (!state) return <p>Reading personal library status…</p>;
  if (state.unlocked) return <>{children}</>;
  return (
    <section className="card panel-stack">
      <h2>Unlock personal library</h2>
      <p>
        Modes, templates and extracted documents use local encrypted storage for
        this profile. Nothing is uploaded by unlocking.
      </p>
      <button
        className="primary"
        onClick={() => {
          void personalCommand(state, { type: "unlock" }).catch((e) =>
            setError(e.message),
          );
        }}
      >
        Unlock local library
      </button>
      {(error || state.error) && <p role="alert">{error || state.error}</p>}
    </section>
  );
}
export function ModesPage({ openAssistant }: { openAssistant: () => void }) {
  const state = usePersonal(),
    [editing, setEditing] = useState<AIMode | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setEditing(null);
    setError("");
  }, [state?.scopeId]);
  async function change(value: ModeChange) {
    if (!state) return;
    try {
      await personalCommand(state, value);
      setError("");
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="personal-page panel-stack" aria-label="AI Modes">
      <h1>AI modes</h1>
      <p>
        Modes guide responses within existing capture, sharing and provider
        permissions. Editing stays local. Test a saved mode through the normal
        review and Ask controls.
      </p>
      <PersonalGate state={state}>
        <button
          className="primary"
          onClick={() =>
            setEditing({
              ...builtInModes()[0]!,
              id: crypto.randomUUID(),
              name: "",
              category: "Custom",
              builtIn: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          }
        >
          Create mode
        </button>
        {state?.config.modes.map((mode) => (
          <article className="card panel-stack" key={mode.id}>
            <h2>
              <Icon name={mode.icon} /> {mode.name}{" "}
              {mode.builtIn ? "· Built-in" : ""}
            </h2>
            <p>{mode.description}</p>
            <div className="button-row">
              <button
                onClick={() => void change({ type: "select", id: mode.id })}
              >
                Select
              </button>
              <button onClick={() => setEditing(structuredClone(mode))}>
                Edit / rename
              </button>
              <button
                onClick={() => void change({ type: "duplicate", id: mode.id })}
              >
                Duplicate
              </button>
              <button
                onClick={() =>
                  void change({
                    type: mode.builtIn ? "reset" : "delete",
                    id: mode.id,
                  })
                }
              >
                {mode.builtIn ? "Reset built-in" : "Delete mode"}
              </button>
            </div>
          </article>
        ))}
        {editing && (
          <form
            className="card panel-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void change({ type: "save", mode: editing });
            }}
            aria-label="Mode editor"
          >
            <h2>{editing.builtIn ? "Edit built-in mode" : "Custom mode"}</h2>
            <label>
              Name
              <input
                required
                maxLength={80}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Icon
              <select
                value={editing.icon}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    icon: e.target.value as AIMode["icon"],
                  })
                }
              >
                {MODE_ICONS.map((icon) => (
                  <option key={icon}>{icon}</option>
                ))}
              </select>
            </label>
            <label>
              Description
              <input
                maxLength={500}
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <label>
              Category
              <input
                required
                maxLength={60}
                value={editing.category}
                onChange={(e) =>
                  setEditing({ ...editing, category: e.target.value })
                }
              />
            </label>
            <label>
              Custom instructions
              <textarea
                aria-label="Custom instructions"
                required
                maxLength={4000}
                rows={6}
                value={editing.instructions}
                onChange={(e) =>
                  setEditing({ ...editing, instructions: e.target.value })
                }
              />
            </label>
            <label>
              Response length
              <select
                value={editing.output.length}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    output: {
                      ...editing.output,
                      length: e.target.value as AIMode["output"]["length"],
                    },
                  })
                }
              >
                {["short", "balanced", "detailed"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Output format
              <select
                value={editing.output.format}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    output: {
                      ...editing.output,
                      format: e.target.value as AIMode["output"]["format"],
                    },
                  })
                }
              >
                {["auto", "bullets", "prose"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Output language
              <input
                maxLength={60}
                value={editing.output.language}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    output: { ...editing.output, language: e.target.value },
                  })
                }
              />
              <small>
                default uses your global preference. Language requests are best
                effort for the selected provider/model.
              </small>
            </label>
            <fieldset>
              <legend>
                Permitted context (never enables capture or sharing)
              </legend>
              {(
                ["screenshot", "microphone", "systemAudio", "history"] as const
              ).map((key) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={editing.context[key]}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        context: {
                          ...editing.context,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  {key}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Allowed contextual actions</legend>
              {(Object.keys(ACTION_LABELS) as ContextualAction[]).map(
                (action) => (
                  <label className="check" key={action}>
                    <input
                      type="checkbox"
                      checked={editing.actions.includes(action)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          actions: e.target.checked
                            ? [...editing.actions, action]
                            : editing.actions.filter((a) => a !== action),
                        })
                      }
                    />
                    {ACTION_LABELS[action]}
                  </label>
                ),
              )}
            </fieldset>
            <fieldset>
              <legend>Knowledge documents (maximum 10)</legend>
              {!state?.documents.length && (
                <p>
                  No documents imported. Use Knowledge to add local references.
                </p>
              )}
              {state?.documents.map((doc) => (
                <label className="check" key={doc.id}>
                  <input
                    type="checkbox"
                    checked={editing.knowledgeIds.includes(doc.id)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        knowledgeIds: e.target.checked
                          ? [...editing.knowledgeIds, doc.id]
                          : editing.knowledgeIds.filter((id) => id !== doc.id),
                      })
                    }
                  />
                  {doc.name}
                  {!doc.enabled ? " · Disabled" : ""}
                </label>
              ))}
            </fieldset>
            <label>
              Meeting note template
              <select
                value={editing.templateId ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, templateId: e.target.value || null })
                }
              >
                <option value="">Use default template</option>
                {state?.config.templates.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" type="submit">
              Save mode
            </button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel edit
            </button>
          </form>
        )}
        <button
          className="secondary"
          onClick={async () => {
            if (!state) return;
            const result = await window.everyhint.reviewContext({
              question:
                "Explain how you will respond using the active mode. Give a short example.",
              options: { ...DEFAULT_CONTEXT, history: false },
            });
            if (!result.ok) setError(result.error);
            else openAssistant();
          }}
        >
          Preview / test active saved mode
        </button>
      </PersonalGate>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function KnowledgePage() {
  const state = usePersonal(),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [excerpts, setExcerpts] = useState<KnowledgeExcerpt[]>([]),
    [sections, setSections] = useState<KnowledgeSection[]>([]),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [inspectName, setInspectName] = useState("");
  useEffect(() => {
    setExcerpts([]);
    setSections([]);
    setNextOffset(null);
    setInspectName("");
    setError("");
  }, [state?.scopeId, state?.revision]);
  async function run(task: () => Promise<unknown>) {
    try {
      await task();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function search(offset = 0) {
    if (!state) return;
    const result = await window.everyhint.personal.search({
      scopeId: state.scopeId,
      query,
      offset,
    });
    if (!result.ok) throw new Error(result.error);
    setExcerpts((old) =>
      offset ? [...old, ...result.value.excerpts] : result.value.excerpts,
    );
    setNextOffset(result.value.nextOffset);
  }
  return (
    <section
      className="personal-page panel-stack"
      aria-label="Knowledge library"
    >
      <h1>Personal knowledge</h1>
      <p>
        PDF, DOCX, UTF-8 TXT and Markdown · maximum 8 MiB / 400,000 extracted
        characters / 200 PDF pages. Extraction stays local; no OCR. Only
        extracted text and metadata are copied into encrypted application
        storage. Your original source file is never changed or deleted.
      </p>
      <PersonalGate state={state}>
        {state && (
          <>
            <button
              className="primary"
              disabled={state.processing}
              onClick={() =>
                void run(() => personalCommand(state, { type: "import" }))
              }
            >
              Upload reference document
            </button>
            {state.processing && (
              <div role="status">
                Processing locally…{" "}
                <button
                  onClick={() =>
                    void run(() =>
                      personalCommand(state, { type: "cancel-import" }),
                    )
                  }
                >
                  Cancel import
                </button>
              </div>
            )}
            {!state.documents.length && (
              <div className="card">
                <h2>Your library is empty</h2>
                <p>
                  Add a reference document, inspect its extraction, then
                  associate it with a mode. Uploading never starts an AI
                  request.
                </p>
              </div>
            )}
            <form
              className="button-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => search());
              }}
            >
              <label>
                Search personal knowledge
                <input
                  required
                  maxLength={6000}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button type="submit">Search locally</button>
            </form>
            {excerpts.map((source) => (
              <article key={source.ref} className="card">
                <strong>
                  {source.documentName} · {source.heading}
                  {source.page !== null ? ` · Page ${source.page}` : ""}
                </strong>
                <blockquote>{source.text}</blockquote>
              </article>
            ))}
            {query && !excerpts.length && (
              <p className="muted">
                No local search results to display. Search uses literal terms;
                try specific words from your documents.
              </p>
            )}
            {nextOffset !== null && (
              <button onClick={() => void run(() => search(nextOffset))}>
                Search next 10 documents
              </button>
            )}
            {state.documents.map((doc) => (
              <article key={doc.id} className="card panel-stack">
                <h2>{doc.name}</h2>
                <p>
                  {doc.type.toUpperCase()} · {doc.bytes.toLocaleString()} bytes
                  · {doc.status} · {doc.enabled ? "Enabled" : "Disabled"} ·{" "}
                  {doc.sectionCount} indexed sections
                </p>
                <p>
                  Imported {new Date(doc.importedAt).toLocaleString()} · Updated{" "}
                  {new Date(doc.updatedAt).toLocaleString()}
                </p>
                {doc.notices.map((n) => (
                  <p className="muted" key={n}>
                    {n}
                  </p>
                ))}
                <form
                  className="button-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const values = new FormData(e.currentTarget);
                    void run(() =>
                      personalCommand(state, {
                        type: "document",
                        id: doc.id,
                        name: String(values.get("name")),
                        enabled: doc.enabled,
                      }),
                    );
                  }}
                >
                  <label>
                    Document name
                    <input
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={doc.name}
                    />
                  </label>
                  <button type="submit">Rename document</button>
                </form>
                <div className="button-row">
                  <button
                    onClick={() =>
                      void run(async () => {
                        const result = await window.everyhint.personal.inspect({
                          scopeId: state.scopeId,
                          id: doc.id,
                        });
                        if (!result.ok) throw new Error(result.error);
                        setSections(result.value);
                        setInspectName(doc.name);
                      })
                    }
                  >
                    Inspect extracted text
                  </button>
                  <button
                    onClick={() =>
                      void run(() =>
                        personalCommand(state, {
                          type: "document",
                          id: doc.id,
                          name: doc.name,
                          enabled: !doc.enabled,
                        }),
                      )
                    }
                  >
                    {doc.enabled ? "Disable document" : "Enable document"}
                  </button>
                  <button
                    onClick={() =>
                      void run(() =>
                        personalCommand(state, {
                          type: "delete-document",
                          id: doc.id,
                        }),
                      )
                    }
                  >
                    Delete encrypted document
                  </button>
                </div>
                <fieldset>
                  <legend>Associated modes</legend>
                  {state.config.modes.map((mode) => (
                    <label className="check" key={mode.id}>
                      <input
                        type="checkbox"
                        checked={mode.knowledgeIds.includes(doc.id)}
                        onChange={(e) => {
                          void run(() =>
                            personalCommand(state, {
                              type: "save",
                              mode: {
                                ...mode,
                                knowledgeIds: e.target.checked
                                  ? [...mode.knowledgeIds, doc.id]
                                  : mode.knowledgeIds.filter(
                                      (id) => id !== doc.id,
                                    ),
                              },
                            }),
                          );
                        }}
                      />
                      {mode.name}
                    </label>
                  ))}
                </fieldset>
              </article>
            ))}
            {inspectName && (
              <section className="card panel-stack">
                <h2>{inspectName} · Extracted text</h2>
                <button
                  onClick={() => {
                    setSections([]);
                    setInspectName("");
                  }}
                >
                  Close inspection
                </button>
                {sections.map((s) => (
                  <details key={s.id}>
                    <summary>
                      {s.heading} · {s.id}
                      {s.page !== null ? ` · Page ${s.page}` : ""}
                    </summary>
                    <pre className="knowledge-text">{s.text}</pre>
                  </details>
                ))}
              </section>
            )}
          </>
        )}
      </PersonalGate>
      {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
    </section>
  );
}
export function PersonalSettings() {
  const state = usePersonal(),
    [error, setError] = useState("");
  return (
    <section className="personal-page card panel-stack">
      <h2>Personal preferences</h2>
      <PersonalGate state={state}>
        {state && (
          <>
            <label>
              Default AI mode
              <select
                value={state.config.defaultModeId}
                onChange={(e) => {
                  void personalCommand(state, {
                    type: "default",
                    id: e.target.value,
                  }).catch((e) => setError(e.message));
                }}
              >
                {state.config.modes.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Default meeting template
              <select
                aria-label="Default meeting template"
                value={state.config.defaultTemplateId}
                onChange={(e) => {
                  void personalCommand(state, {
                    type: "default-template",
                    id: e.target.value,
                  }).catch((e) => setError(e.message));
                }}
              >
                {state.config.templates.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              AI output language
              <input
                aria-label="AI output language"
                list="output-languages"
                maxLength={60}
                defaultValue={state.config.outputLanguage}
                key={state.config.outputLanguage}
                onBlur={(e) => {
                  if (e.target.value !== state.config.outputLanguage)
                    void personalCommand(state, {
                      type: "language",
                      language: e.target.value,
                    }).catch((e) => setError(e.message));
                }}
              />
              <datalist id="output-languages">
                {[
                  "default",
                  "English",
                  "French",
                  "Spanish",
                  "German",
                  "Japanese",
                ].map((v) => (
                  <option value={v} key={v} />
                ))}
              </datalist>
            </label>
            <p>
              default follows the question/system language. Other languages are
              response preferences, subject to the selected model's abilities;
              no provider language catalog is advertised. Existing transcripts
              stay unchanged.
            </p>
            <p>
              Local transcription: tiny.en and base.en are English-only. English
              is the only supported speech language. Multilingual models and OCR
              are deferred; no model downloads are automatic.
            </p>
            <button
              onClick={() => {
                void personalCommand(state, { type: "lock" }).catch((e) =>
                  setError(e.message),
                );
              }}
            >
              Lock personal library
            </button>
          </>
        )}
      </PersonalGate>
      <TemplateEditor />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function TemplateEditor() {
  const state = usePersonal(),
    [editing, setEditing] = useState<NoteTemplate | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setEditing(null);
    setError("");
  }, [state?.scopeId]);
  async function change(input: TemplateChange) {
    if (!state) return;
    try {
      await personalCommand(state, input);
      setEditing(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!state?.unlocked) return null;
  return (
    <section className="panel-stack" aria-label="Meeting templates">
      <h2>Meeting note templates</h2>
      <p>
        Headings and section guidance organise grounded notes. They cannot
        change privacy permissions, tools or provider settings.
      </p>
      <button
        className="primary"
        onClick={() =>
          setEditing({
            ...builtInTemplates()[0]!,
            id: crypto.randomUUID(),
            name: "",
            builtIn: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        }
      >
        Create meeting template
      </button>
      {state.config.templates.map((t) => (
        <article key={t.id} className="card">
          <h3>
            {t.name}
            {t.builtIn ? " · Built-in" : ""}
          </h3>
          <p>{t.sections.map((s) => s.heading).join(" → ")}</p>
          <div className="button-row">
            <button onClick={() => setEditing(structuredClone(t))}>
              Edit / rename template
            </button>
            <button
              onClick={() =>
                void change({ type: "duplicate-template", id: t.id })
              }
            >
              Duplicate template
            </button>
            {!t.builtIn && (
              <button
                onClick={() =>
                  void change({ type: "delete-template", id: t.id })
                }
              >
                Delete template
              </button>
            )}
          </div>
        </article>
      ))}
      {editing && (
        <form
          className="card panel-stack"
          aria-label="Template editor"
          onSubmit={(e) => {
            e.preventDefault();
            void change({ type: "save-template", template: editing });
          }}
        >
          <label>
            Template name
            <input
              required
              maxLength={80}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          {editing.sections.map((section, index) => (
            <fieldset key={index}>
              <legend>Section {index + 1}</legend>
              <label>
                Section heading
                <input
                  required
                  maxLength={100}
                  value={section.heading}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      sections: editing.sections.map((s, i) =>
                        i === index ? { ...s, heading: e.target.value } : s,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Section content
                <select
                  value={section.source}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      sections: editing.sections.map((s, i) =>
                        i === index
                          ? {
                              ...s,
                              source: e.target.value as typeof section.source,
                            }
                          : s,
                      ),
                    })
                  }
                >
                  {SUMMARY_SECTIONS.map((source) => (
                    <option key={source} value={source}>
                      {source === "outstanding"
                        ? "Questions / unknowns"
                        : source === "nextSteps"
                          ? "Follow-ups"
                          : source}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Section instructions
                <textarea
                  maxLength={400}
                  value={section.instructions}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      sections: editing.sections.map((s, i) =>
                        i === index
                          ? { ...s, instructions: e.target.value }
                          : s,
                      ),
                    })
                  }
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => {
                    const sections = [...editing.sections];
                    [sections[index - 1], sections[index]] = [
                      sections[index]!,
                      sections[index - 1]!,
                    ];
                    setEditing({ ...editing, sections });
                  }}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={index === editing.sections.length - 1}
                  onClick={() => {
                    const sections = [...editing.sections];
                    [sections[index], sections[index + 1]] = [
                      sections[index + 1]!,
                      sections[index]!,
                    ];
                    setEditing({ ...editing, sections });
                  }}
                >
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      sections: editing.sections.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove section
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={editing.sections.length >= 7}
            onClick={() => {
              const source = SUMMARY_SECTIONS.find(
                (s) =>
                  !editing.sections.some((section) => section.source === s),
              );
              if (source)
                setEditing({
                  ...editing,
                  sections: [
                    ...editing.sections,
                    { heading: "New section", instructions: "", source },
                  ],
                });
            }}
          >
            Add section
          </button>
          <details>
            <summary>Preview formatting</summary>
            {editing.sections.map((s, i) => (
              <section key={i}>
                <h3>{s.heading}</h3>
                <p className="muted">
                  [Reviewed, transcript-supported content appears here]
                </p>
              </section>
            ))}
          </details>
          <button className="primary" type="submit">
            Save template
          </button>
          <button type="button" onClick={() => setEditing(null)}>
            Cancel template edit
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
