import type { SensitivityLevel } from "./privacy";

export type MemoryScope = "short_term" | "long_term";

export type MemoryConfidence = "low" | "medium" | "high";

export type MemoryKind =
  | "task"
  | "decision"
  | "rule"
  | "bug"
  | "risk"
  | "summary"
  | "preference"
  | "experience"
  | "system_note";

export type MemorySensitivity = SensitivityLevel;

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  kind: MemoryKind;
  title: string;
  content: string;
  projectId: string;
  sourceRefs: string[];
  tags: string[];
  importance: number;
  confidence: MemoryConfidence;
  sensitivity: MemorySensitivity;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  version: number;
}

export type NewMemoryRecord = Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "version"> &
  Partial<Pick<MemoryRecord, "id" | "createdAt" | "updatedAt" | "version">>;

export type MemoryPatch = Partial<
  Pick<
    MemoryRecord,
    | "scope"
    | "kind"
    | "title"
    | "content"
    | "projectId"
    | "sourceRefs"
    | "tags"
    | "importance"
    | "confidence"
    | "sensitivity"
    | "expiresAt"
  >
>;

export interface MemorySearchOptions {
  scope?: MemoryScope;
  kind?: MemoryKind;
  includeExpired?: boolean;
  includeSecret?: boolean;
  limit?: number;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
}

export interface ContextMemory {
  id: string;
  scope: MemoryScope;
  kind: MemoryKind;
  title: string;
  content?: string;
  summary?: string;
  tags: string[];
  importance: number;
  confidence: MemoryConfidence;
  sensitivity: MemorySensitivity;
  score: number;
}
