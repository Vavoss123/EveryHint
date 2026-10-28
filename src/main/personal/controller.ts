import { randomUUID } from "node:crypto";
import {
  changeMode,
  defaultConfig,
  localId,
  parseConfig,
  text,
  type PersonalConfig,
} from "../../shared/modes";
import { parseTemplate, type NoteTemplate } from "../../shared/templates";
import { basename, extname } from "node:path";
import { importLocalDocument } from "./import";
import type {
  KnowledgeDocument,
  KnowledgeExcerpt,
  KnowledgeSection,
} from "../../shared/knowledge";
import type { ModeContext, PersonalState } from "../../shared/personal";
import { exactKeys, record } from "../../shared/validation";
import type { PersonalStore } from "./store";

export class PersonalController {
  private state: PersonalState = {
    revision: 0,
    scopeId: randomUUID(),
    unlocked: false,
    config: defaultConfig(),
    error: null,
    documents: [],
    processing: false,
  };
  private store?: PersonalStore;
  private profile = "";
  private busy = false;
  private importAbort?: AbortController;
  constructor(
    private create: (profile: string) => PersonalStore,
    private changed: (state: PersonalState) => void,
    private invalidate: () => void,
    private pickFile?: () => Promise<string | null>,
  ) {}
  get value(): PersonalState {
    return structuredClone(this.state);
  }
  get modeContext(): ModeContext {
    const config = this.state.config;
    return structuredClone({
      mode: config.modes.find((m) => m.id === config.activeModeId)!,
      outputLanguage: config.outputLanguage,
    });
  }
  private publish(): void {
    this.state.revision++;
    this.changed(this.value);
  }
  switchProfile(profile: string): void {
    if (profile !== this.profile) {
      this.lock();
      this.profile = profile;
    }
  }
  lock(): void {
    this.importAbort?.abort();
    this.invalidate();
    const store = this.store;
    this.store = undefined;
    this.state = {
      revision: this.state.revision,
      scopeId: randomUUID(),
      unlocked: false,
      config: defaultConfig(),
      error: null,
      documents: [],
      processing: false,
    };
    void store?.close();
    this.publish();
  }
  async command(value: unknown): Promise<PersonalState> {
    const request = record(value);
    exactKeys(request, ["scopeId", "value"]);
    if (request.scopeId !== this.state.scopeId)
      throw new Error("Personal profile changed. Reload this page.");
    const input = record(request.value),
      scope = this.state.scopeId;
    if (input.type === "lock") {
      exactKeys(input, ["type"]);
      this.lock();
      return this.value;
    }
    if (input.type === "cancel-import") {
      exactKeys(input, ["type"]);
      this.importAbort?.abort();
      return this.value;
    }
    if (this.busy)
      throw new Error("Wait for the current personal library operation.");
    this.busy = true;
    try {
      if (input.type === "unlock") {
        exactKeys(input, ["type"]);
        if (!this.store) {
          const store = this.create(this.profile);
          this.store = store;
          await store.open();
          const config = await store.call<PersonalConfig>("config");
          const documents = await store.call<KnowledgeDocument[]>("documents");
          if (scope !== this.state.scopeId) {
            await store.close();
            throw new Error("Profile changed during unlock.");
          }
          config.activeModeId = config.defaultModeId;
          this.invalidate();
          this.state.config = config;
          this.state.unlocked = true;
          this.state.documents = documents;
        }
      } else if (input.type === "import") {
        exactKeys(input, ["type"]);
        const store = this.requireStore();
        this.importAbort = new AbortController();
        this.state.processing = true;
        this.publish();
        const path = await this.pickFile?.();
        this.importAbort.signal.throwIfAborted();
        if (scope !== this.state.scopeId)
          throw new Error("Profile changed during import.");
        if (path) {
          const type = extname(path).slice(1).toLowerCase();
          if (!["pdf", "docx", "txt", "md"].includes(type))
            throw new Error("Only PDF, DOCX, TXT and Markdown are supported.");
          const result = await importLocalDocument(
            path,
            type as KnowledgeDocument["type"],
            this.importAbort.signal,
          );
          if (scope !== this.state.scopeId)
            throw new Error("Profile changed during extraction.");
          this.importAbort.signal.throwIfAborted();
          const now = Date.now();
          const document: KnowledgeDocument = {
            id: randomUUID(),
            name: basename(path).slice(0, 200),
            type: type as KnowledgeDocument["type"],
            bytes: result.bytes,
            importedAt: now,
            updatedAt: now,
            enabled: true,
            status: result.extraction.partial ? "partial" : "ready",
            notices: result.extraction.notices,
            sectionCount: result.extraction.sections.length,
          };
          await store.call("import", {
            document,
            extraction: result.extraction,
          });
          if (scope !== this.state.scopeId)
            throw new Error("Profile changed during import commit.");
          const documents = await store.call<KnowledgeDocument[]>("documents");
          if (scope !== this.state.scopeId)
            throw new Error(
              "Profile changed while listing imported documents.",
            );
          this.state.documents = documents;
          this.state.lastImport = result.metrics;
        }
      } else if (
        input.type === "document" ||
        input.type === "delete-document"
      ) {
        exactKeys(
          input,
          input.type === "document"
            ? ["type", "id", "name", "enabled"]
            : ["type", "id"],
        );
        const id = localId(input.id),
          store = this.requireStore();
        this.invalidate();
        if (input.type === "document") {
          const name = text(input.name, 200, "Document name", true);
          if (typeof input.enabled !== "boolean")
            throw new Error("Choose enabled or disabled.");
          await store.call("documentChange", {
            id,
            name,
            enabled: input.enabled,
          });
        } else await store.call("deleteDocument", id);
        if (scope !== this.state.scopeId)
          throw new Error("Profile changed during document update.");
        const documents = await store.call<KnowledgeDocument[]>("documents");
        const config = await store.call<PersonalConfig>("config");
        if (scope !== this.state.scopeId)
          throw new Error("Profile changed while loading document changes.");
        config.activeModeId = this.state.config.activeModeId;
        this.state.config = config;
        this.state.documents = documents;
      } else {
        if (!this.store && input.type === "select") {
          this.state.config = changeMode(
            this.state.config,
            input,
            randomUUID(),
            Date.now(),
          );
          this.invalidate();
          this.publish();
          return this.value;
        }
        if (!this.store || !this.state.unlocked)
          throw new Error("Unlock personal settings first.");
        const config =
          typeof input.type === "string" && input.type.endsWith("-template")
            ? this.changeTemplate(input)
            : changeMode(this.state.config, input, randomUUID(), Date.now());
        if (
          config.modes.some(
            (m) =>
              m.knowledgeIds.length > 10 ||
              m.knowledgeIds.some(
                (id) => !this.state.documents.some((d) => d.id === id),
              ),
          )
        )
          throw new Error(
            "Associate at most 10 existing knowledge documents per mode.",
          );
        this.invalidate();
        await this.store.call("save", config);
        if (scope !== this.state.scopeId)
          throw new Error("Profile changed during save.");
        this.state.config = config;
      }
      this.state.error = null;
      this.publish();
      return this.value;
    } catch (error) {
      if (scope === this.state.scopeId) {
        this.state.error =
          error instanceof Error ? error.message : "Personal settings failed.";
        if (!this.state.unlocked) {
          const store = this.store;
          this.store = undefined;
          await store?.close();
        }
        this.publish();
      }
      throw error;
    } finally {
      this.busy = false;
      this.importAbort = undefined;
      if (scope === this.state.scopeId) {
        this.state.processing = false;
        this.publish();
      }
    }
  }
  private requireStore(): PersonalStore {
    if (!this.store || !this.state.unlocked)
      throw new Error("Unlock the personal library first.");
    return this.store;
  }
  template(id?: string): NoteTemplate {
    const config = this.state.config,
      selected =
        id ?? this.modeContext.mode.templateId ?? config.defaultTemplateId;
    const template = config.templates.find((t) => t.id === selected);
    if (!template) throw new Error("Meeting template no longer exists.");
    return structuredClone(template);
  }
  private changeTemplate(input: Record<string, unknown>): PersonalConfig {
    const config = structuredClone(this.state.config),
      now = Date.now();
    if (input.type === "save-template") {
      exactKeys(input, ["type", "template"]);
      const template = parseTemplate(input.template),
        old = config.templates.find((t) => t.id === template.id);
      if (old?.builtIn !== undefined && old.builtIn !== template.builtIn)
        throw new Error("Built-in template identity cannot change.");
      if (!old && (template.builtIn || config.templates.length >= 50))
        throw new Error("Cannot add this template; maximum 50.");
      template.createdAt = old?.createdAt ?? now;
      template.updatedAt = now;
      config.templates = old
        ? config.templates.map((t) => (t.id === old.id ? template : t))
        : [...config.templates, template];
    } else {
      exactKeys(input, ["type", "id"]);
      const id = localId(input.id),
        template = config.templates.find((t) => t.id === id);
      if (!template) throw new Error("Template no longer exists.");
      if (input.type === "default-template") config.defaultTemplateId = id;
      else if (input.type === "duplicate-template") {
        if (config.templates.length >= 50)
          throw new Error("Maximum 50 templates.");
        config.templates.push({
          ...structuredClone(template),
          id: randomUUID(),
          name: `${template.name.slice(0, 70)} copy`,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        });
      } else if (input.type === "delete-template") {
        if (template.builtIn)
          throw new Error("Built-in templates cannot be deleted.");
        config.templates = config.templates.filter((t) => t.id !== id);
        config.modes.forEach((m) => {
          if (m.templateId === id) m.templateId = null;
        });
        if (config.defaultTemplateId === id)
          config.defaultTemplateId = "standard";
      } else throw new Error("Unknown template operation.");
    }
    return parseConfig(config);
  }
  async inspect(value: unknown): Promise<KnowledgeSection[]> {
    const input = record(value);
    exactKeys(input, ["scopeId", "id"]);
    const scope = this.state.scopeId,
      revision = this.state.revision;
    if (input.scopeId !== scope) throw new Error("Profile changed.");
    const result = await this.requireStore().call<KnowledgeSection[]>(
      "sections",
      localId(input.id),
    );
    if (scope !== this.state.scopeId || revision !== this.state.revision)
      throw new Error("Profile or document changed during inspection.");
    return result;
  }
  async search(value: unknown) {
    const input = record(value);
    exactKeys(input, ["scopeId", "query", "offset"]);
    const scope = this.state.scopeId,
      revision = this.state.revision;
    if (input.scopeId !== scope) throw new Error("Profile changed.");
    const result = await this.requireStore().call<{
      excerpts: KnowledgeExcerpt[];
      nextOffset: number | null;
      scanned: number;
    }>("retrieve", {
      query: text(input.query, 6000, "Search query"),
      ids: this.state.documents.map((d) => d.id),
      offset: input.offset,
    });
    if (scope !== this.state.scopeId || revision !== this.state.revision)
      throw new Error("Profile or documents changed during search.");
    return result;
  }
  async retrieve(
    query: string,
    selectedIds: string[],
  ): Promise<KnowledgeExcerpt[]> {
    const scope = this.state.scopeId;
    const allowed = this.modeContext.mode.knowledgeIds.filter((id) =>
      selectedIds.includes(id),
    );
    if (!allowed.length) return [];
    const result = await this.requireStore().call<{
      excerpts: KnowledgeExcerpt[];
    }>("retrieve", { query, ids: allowed.slice(0, 10), offset: 0 });
    if (scope !== this.state.scopeId)
      throw new Error("Profile changed during retrieval.");
    return result.excerpts;
  }
  async knowledgeContext(query: string, selectedIds: string[]) {
    const scope = this.state.scopeId,
      revision = this.state.revision;
    const excerpts = await this.retrieve(query, selectedIds);
    const valid = () =>
      this.state.unlocked &&
      scope === this.state.scopeId &&
      revision === this.state.revision;
    if (!valid()) throw new Error("Knowledge changed during retrieval.");
    return { excerpts, valid };
  }
}
