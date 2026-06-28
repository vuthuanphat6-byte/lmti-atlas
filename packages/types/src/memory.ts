import type { SensitivityLevel } from "./privacy";

export type MemoryScope = "short_term" | "long_term";

export type MemoryConfidence = "low" | "medium" | "high";

export type IntentCategory =
  | "bugfix"
  | "deploy"
  | "debug"
  | "auth"
  | "permission"
  | "routing"
  | "dashboard"
  | "ui"
  | "api"
  | "database"
  | "partner"
  | "admin"
  | "memory"
  | "privacy"
  | "unknown";

export interface InferredIntent {
  primaryIntent: IntentCategory;
  secondaryIntents: IntentCategory[];
  keywords: string[];
  negativeKeywords: string[];
  confidence: number;
}

export type PromptPolicy = "allow_raw" | "summarize_only" | "do_not_prompt";

export type MemoryContextMode = "raw" | "summary" | "metadata_only" | "excluded";

export type MemoryKind =
  | "task"
  | "decision"
  | "rule"
  | "lesson"
  | "bug"
  | "risk"
  | "route"
  | "permission"
  | "deploy_note"
  | "debug_note"
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
  promptPolicy?: PromptPolicy;
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
    | "promptPolicy"
    | "expiresAt"
  >
>;

export interface MemorySearchOptions {
  scope?: MemoryScope;
  kind?: MemoryKind;
  includeExpired?: boolean;
  includeSecret?: boolean;
  includeRaw?: boolean;
  includeSecretMeta?: boolean;
  includeLowScore?: boolean;
  limit?: number;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
  mode?: MemoryContextMode;
  promptPolicy?: PromptPolicy;
  why?: string[];
  intentMatch?: number;
  keywordMatch?: number;
  negativeKeywordPenalty?: number;
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
  promptPolicy?: PromptPolicy;
  mode?: Exclude<MemoryContextMode, "excluded">;
  why?: string[];
  score: number;
}
