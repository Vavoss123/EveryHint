import type { Result } from "./contracts";
import type { AIMode, ModeChange, PersonalConfig } from "./modes";
import type {
  KnowledgeDocument,
  KnowledgeExcerpt,
  KnowledgeSection,
} from "./knowledge";

export interface PersonalState {
  lastImport?: { extractionMs: number; parserHeapBytes: number };
  revision: number;
  scopeId: string;
  unlocked: boolean;
  config: PersonalConfig;
  error: string | null;
  documents: KnowledgeDocument[];
  processing: boolean;
}
export interface PersonalBridge {
  get(): Promise<Result<PersonalState>>;
  onState(listener: (state: PersonalState) => void): () => void;
  command(input: {
    scopeId: string;
    value:
      | { type: "unlock" | "lock" | "import" | "cancel-import" }
      | { type: "document"; id: string; name: string; enabled: boolean }
      | { type: "delete-document"; id: string }
      | ModeChange
      | import("./templates").TemplateChange;
  }): Promise<Result<PersonalState>>;
  inspect(input: {
    scopeId: string;
    id: string;
  }): Promise<Result<KnowledgeSection[]>>;
  search(input: { scopeId: string; query: string; offset: number }): Promise<
    Result<{
      excerpts: KnowledgeExcerpt[];
      nextOffset: number | null;
      scanned: number;
    }>
  >;
}
export interface ModeContext {
  mode: AIMode;
  outputLanguage: string;
}
