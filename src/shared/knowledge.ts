export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_CHARS = 400000;
export interface KnowledgeSection {
  id: string;
  heading: string;
  page: number | null;
  text: string;
}
export interface KnowledgeDocument {
  id: string;
  name: string;
  type: "pdf" | "docx" | "txt" | "md";
  bytes: number;
  importedAt: number;
  updatedAt: number;
  enabled: boolean;
  status: "ready" | "partial";
  notices: string[];
  sectionCount: number;
}
export interface KnowledgeExcerpt extends KnowledgeSection {
  documentId: string;
  documentName: string;
  ref: string;
  score: number;
}
export interface Extraction {
  sections: KnowledgeSection[];
  notices: string[];
  partial: boolean;
}
