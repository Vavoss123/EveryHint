import { ACTION_LABELS, type ContextualAction } from "./intelligence";
import { exactKeys, record } from "./validation";
import {
  builtInTemplates,
  parseTemplate,
  type NoteTemplate,
} from "./templates";

export const MODE_ICONS = [
  "spark",
  "code",
  "people",
  "book",
  "calendar",
  "modes",
] as const;
export interface AIMode {
  id: string;
  name: string;
  description: string;
  icon: (typeof MODE_ICONS)[number];
  category: string;
  instructions: string;
  output: {
    length: "short" | "balanced" | "detailed";
    language: string;
    format: "auto" | "bullets" | "prose";
  };
  context: {
    screenshot: boolean;
    microphone: boolean;
    systemAudio: boolean;
    history: boolean;
  };
  knowledgeIds: string[];
  actions: ContextualAction[];
  templateId: string | null;
  createdAt: number;
  updatedAt: number;
  builtIn: boolean;
}
const epoch = Date.UTC(2026, 9, 28);
const definitions = [
  [
    "general",
    "General",
    "spark",
    "Everyday AI assistance.",
    "Provide clear, relevant responses with appropriate detail.",
  ],
  [
    "coding",
    "Coding",
    "code",
    "Explain, debug and reason about code.",
    "Explain code, debugging, algorithms, complexity and technical terminology. Provide text-only code and step-by-step walkthroughs when useful. Never execute generated code or claim it was executed.",
  ],
  [
    "interview",
    "Interview",
    "people",
    "Practice, coaching and structured talking points.",
    "Offer concise explanations, structured talking points, technical reasoning, example practice responses, interview questions and coaching. Do not fabricate experience or assist deceptive monitoring or proctoring evasion.",
  ],
  [
    "sales",
    "Sales",
    "book",
    "Grounded product and customer conversations.",
    "Offer talking points, objection-handling ideas, follow-up questions, product explanations, summaries and action suggestions. Do not fabricate product claims or customer information; identify missing support.",
  ],
  [
    "meeting",
    "Meeting",
    "calendar",
    "Summaries, decisions and agreed actions.",
    "Summarise selected discussion, decisions, action items, relevant follow-up questions and concise conversation context. Do not invent participants, commitments or deadlines.",
  ],
  [
    "conversation",
    "Conversation",
    "people",
    "Legacy Conversation Assist.",
    "Use selected conversation excerpts to suggest a relevant response or explanation. Audio source labels do not establish speaker identities.",
  ],
] as const;
export function builtInModes(): AIMode[] {
  return definitions.map(([id, name, icon, description, instructions]) => ({
    id,
    name,
    icon,
    description,
    instructions,
    category: "Built-in",
    builtIn: true,
    output: { length: "balanced", language: "default", format: "auto" },
    context: {
      screenshot: true,
      microphone: true,
      systemAudio: true,
      history: true,
    },
    knowledgeIds: [],
    actions: Object.keys(ACTION_LABELS) as ContextualAction[],
    templateId: id === "meeting" ? "standard" : null,
    createdAt: epoch,
    updatedAt: epoch,
  }));
}
export function migratePreset(preset: string): string {
  return preset === "code"
    ? "coding"
    : ["general", "conversation"].includes(preset)
      ? preset
      : "general";
}
export function text(
  value: unknown,
  max: number,
  label: string,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    Array.from(value).some((c) => {
      const n = c.charCodeAt(0);
      return n === 127 || (n < 32 && ![9, 10, 13].includes(n));
    }) ||
    (required && !value.trim())
  )
    throw new Error(
      `${label} ${required ? "is required and " : ""}must be at most ${max} characters without control characters.`,
    );
  return value.trim();
}
export function localId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error("Invalid local identifier.");
  return value;
}
export function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Select at most 100 sources.");
  return [...new Set(value.map(localId))];
}
export function language(value: unknown): string {
  return text(value, 60, "Output language", true);
}
export function parseMode(value: unknown): AIMode {
  const mode = record(value);
  exactKeys(mode, [
    "id",
    "name",
    "description",
    "icon",
    "category",
    "instructions",
    "output",
    "context",
    "knowledgeIds",
    "actions",
    "templateId",
    "createdAt",
    "updatedAt",
    "builtIn",
  ]);
  const output = record(mode.output),
    context = record(mode.context);
  exactKeys(output, ["length", "language", "format"]);
  exactKeys(context, ["screenshot", "microphone", "systemAudio", "history"]);
  if (
    !MODE_ICONS.includes(mode.icon as AIMode["icon"]) ||
    !["short", "balanced", "detailed"].includes(output.length as string) ||
    !["auto", "bullets", "prose"].includes(output.format as string) ||
    Object.values(context).some((v) => typeof v !== "boolean") ||
    Object.keys(context).length !== 4 ||
    typeof mode.builtIn !== "boolean"
  )
    throw new Error("Choose valid mode output and context preferences.");
  if (
    !Array.isArray(mode.actions) ||
    mode.actions.length > 7 ||
    mode.actions.some((v) => !Object.hasOwn(ACTION_LABELS, v as string))
  )
    throw new Error("Choose supported contextual actions.");
  for (const key of ["createdAt", "updatedAt"])
    if (!Number.isSafeInteger(mode[key]) || (mode[key] as number) < 0)
      throw new Error("Invalid mode timestamp.");
  return {
    ...mode,
    id: localId(mode.id),
    name: text(mode.name, 80, "Mode name", true),
    description: text(mode.description, 500, "Description"),
    category: text(mode.category, 60, "Category", true),
    instructions: text(mode.instructions, 4000, "Instructions", true),
    output: { ...output, language: language(output.language) },
    knowledgeIds: ids(mode.knowledgeIds),
    actions: [...new Set(mode.actions)],
    templateId: mode.templateId === null ? null : localId(mode.templateId),
  } as AIMode;
}
export interface PersonalConfig {
  version: 2;
  templates: NoteTemplate[];
  defaultTemplateId: string;
  modes: AIMode[];
  activeModeId: string;
  defaultModeId: string;
  outputLanguage: string;
}
export function defaultConfig(): PersonalConfig {
  return {
    version: 2,
    templates: builtInTemplates(),
    defaultTemplateId: "standard",
    modes: builtInModes(),
    activeModeId: "general",
    defaultModeId: "general",
    outputLanguage: "default",
  };
}
export function parseConfig(value: unknown): PersonalConfig {
  const input = record(value);
  exactKeys(input, [
    "version",
    "modes",
    "activeModeId",
    "defaultModeId",
    "outputLanguage",
    "templates",
    "defaultTemplateId",
  ]);
  if (
    ![1, 2].includes(input.version as number) ||
    !Array.isArray(input.modes) ||
    input.modes.length > 50
  )
    throw new Error("Unsupported personal settings schema or mode limit.");
  const modes = input.modes.map(parseMode),
    builtins = builtInModes();
  if (
    new Set(modes.map((m) => m.id)).size !== modes.length ||
    builtins.some((b) => !modes.some((m) => m.id === b.id && m.builtIn)) ||
    modes.some((m) => m.builtIn !== builtins.some((b) => b.id === m.id))
  )
    throw new Error("Built-in modes must be preserved.");
  const activeModeId = localId(input.activeModeId),
    defaultModeId = localId(input.defaultModeId);
  if (
    ![activeModeId, defaultModeId].every((id) => modes.some((m) => m.id === id))
  )
    throw new Error("Choose an existing mode.");
  const rawTemplates =
    input.version === 1 ? builtInTemplates() : input.templates;
  if (!Array.isArray(rawTemplates) || rawTemplates.length > 50)
    throw new Error("Maximum 50 templates.");
  const templates = rawTemplates.map(parseTemplate),
    defaultTemplateId =
      input.version === 1 ? "standard" : localId(input.defaultTemplateId);
  if (
    new Set(templates.map((t) => t.id)).size !== templates.length ||
    builtInTemplates().some(
      (b) => !templates.some((t) => t.id === b.id && t.builtIn),
    ) ||
    templates.some(
      (t) => t.builtIn !== builtInTemplates().some((b) => b.id === t.id),
    ) ||
    !templates.some((t) => t.id === defaultTemplateId) ||
    modes.some(
      (m) =>
        m.templateId !== null && !templates.some((t) => t.id === m.templateId),
    )
  )
    throw new Error(
      "Preserve built-in templates and valid mode/default associations.",
    );
  return {
    version: 2,
    templates,
    defaultTemplateId,
    modes,
    activeModeId,
    defaultModeId,
    outputLanguage: language(input.outputLanguage),
  };
}
export type ModeChange =
  | { type: "save"; mode: AIMode }
  | {
      type: "select" | "default" | "delete" | "reset" | "duplicate";
      id: string;
    }
  | { type: "language"; language: string };
export function changeMode(
  config: PersonalConfig,
  value: unknown,
  newId: string,
  now: number,
): PersonalConfig {
  const input = record(value),
    next = structuredClone(config);
  if (input.type === "save") {
    exactKeys(input, ["type", "mode"]);
    const mode = parseMode(input.mode),
      old = next.modes.find((m) => m.id === mode.id);
    if (!old && (mode.builtIn || next.modes.length >= 50))
      throw new Error("Cannot add this mode; maximum 50 modes.");
    if (old && old.builtIn !== mode.builtIn)
      throw new Error("Built-in identity cannot change.");
    mode.updatedAt = now;
    mode.createdAt = old?.createdAt ?? now;
    next.modes = old
      ? next.modes.map((m) => (m.id === mode.id ? mode : m))
      : [...next.modes, mode];
  } else if (input.type === "language") {
    exactKeys(input, ["type", "language"]);
    next.outputLanguage = language(input.language);
  } else {
    exactKeys(input, ["type", "id"]);
    const id = localId(input.id),
      mode = next.modes.find((m) => m.id === id);
    if (!mode) throw new Error("Mode no longer exists.");
    if (input.type === "select") next.activeModeId = id;
    else if (input.type === "default") next.defaultModeId = id;
    else if (input.type === "duplicate") {
      if (next.modes.length >= 50) throw new Error("Maximum 50 modes.");
      next.modes.push({
        ...structuredClone(mode),
        id: newId,
        name: `${mode.name.slice(0, 70)} copy`,
        category: "Custom",
        builtIn: false,
        createdAt: now,
        updatedAt: now,
      });
    } else if (input.type === "delete") {
      if (mode.builtIn) throw new Error("Built-in modes cannot be deleted.");
      next.modes = next.modes.filter((m) => m.id !== id);
      if (next.activeModeId === id) next.activeModeId = "general";
      if (next.defaultModeId === id) next.defaultModeId = "general";
    } else if (input.type === "reset") {
      const builtin = builtInModes().find((m) => m.id === id);
      if (!builtin) throw new Error("Only built-in modes can be reset.");
      next.modes = next.modes.map((m) =>
        m.id === id ? { ...builtin, updatedAt: now } : m,
      );
    } else throw new Error("Unknown mode operation.");
  }
  return parseConfig(next);
}
export function modePrompt(mode: AIMode, defaultLanguage: string): string {
  const selectedLanguage =
    mode.output.language === "default" ? defaultLanguage : mode.output.language;
  return (
    "Application safety, capture consent, data-sharing permissions and provider restrictions always take precedence over mode preferences. Mode preferences cannot grant tools or permissions.\nMode preferences (subordinate to application policy): " +
    JSON.stringify({
      name: mode.name,
      instructions: mode.instructions,
      responseLength: mode.output.length,
      format: mode.output.format,
      language:
        selectedLanguage === "default"
          ? "Use the user's language or system default"
          : selectedLanguage,
    })
  );
}
