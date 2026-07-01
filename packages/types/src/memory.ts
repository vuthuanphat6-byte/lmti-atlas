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

export type MemoryStatus = "active" | "weak" | "archived" | "superseded";

export interface MemoryAssociation {
  targetMemoryId: string;
  weight: number;
  reason: string;
  createdAt: string;
}

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
  memoryStrength?: number;
  baseActivation?: number;
  retrievalCount?: number;
  lastRetrievedAt?: string;
  lastReinforcedAt?: string;
  decayRate?: number;
  stability?: number;
  priorityScore?: number;
  emotionalWeight?: number;
  contextCues?: string[];
  associations?: MemoryAssociation[];
  supersededBy?: string;
  status?: MemoryStatus;
  nextReviewAt?: string;
  reviewIntervalDays?: number;
  easinessFactor?: number;
  reviewCount?: number;
  negativeCues?: string[];
  inferredIntent?: InferredIntent;
  privacySafeSummary?: string;
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
    | "memoryStrength"
    | "baseActivation"
    | "retrievalCount"
    | "lastRetrievedAt"
    | "lastReinforcedAt"
    | "decayRate"
    | "stability"
    | "priorityScore"
    | "emotionalWeight"
    | "contextCues"
    | "associations"
    | "supersededBy"
    | "status"
    | "nextReviewAt"
    | "reviewIntervalDays"
    | "easinessFactor"
    | "reviewCount"
    | "negativeCues"
    | "inferredIntent"
    | "privacySafeSummary"
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
  lexicalScore?: number;
  activation?: number;
  baseActivation?: number;
  associationScore?: number;
  priorityScore?: number;
  contextCueMatch?: number;
  negativeKeywordPenalty?: number;
  privacyPenalty?: number;
  filteredOutReason?: string;
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
  activation?: number;
}

export type TaskOutcome = "pass" | "fail" | "partial" | "unknown";

export type TaskObservationPrivacyStatus = "pass" | "warning" | "blocked";

export type LessonApprovalStatus = "pending" | "approved" | "rejected" | "needs_review";

export type LessonCandidateType =
  | "bug_fix"
  | "architecture"
  | "security"
  | "testing"
  | "deployment"
  | "workflow"
  | "permission"
  | "data_model"
  | "cli"
  | "other";

export interface SourceRef {
  ref: string;
  kind?: "file" | "test" | "command" | "task" | "user" | "memory" | "other";
}

export interface FileTouchSummary {
  path: string;
  changeType: "created" | "modified" | "deleted" | "renamed";
  changeSummary?: string;
  riskLevel?: "low" | "medium" | "high";
}

export interface CommandRunSummary {
  command: string;
  exitCode: number | null;
  status: "pass" | "fail" | "unknown";
  outputSummary?: string;
  outputRedacted: true;
}

export interface TestRunSummary {
  name: string;
  status: "pass" | "fail" | "unknown";
  command?: string;
  summary?: string;
}

export interface ErrorSummary {
  message: string;
  source?: string;
  severity?: "low" | "medium" | "high";
}

export interface DecisionSummary {
  decision: string;
  reason?: string;
  source?: string;
}

export interface TaskObservation {
  taskId: string;
  taskTitle: string;
  taskSummary?: string;
  agent?: string;
  filesTouched: FileTouchSummary[];
  commandsRun: CommandRunSummary[];
  tests: TestRunSummary[];
  errors: ErrorSummary[];
  decisions: DecisionSummary[];
  outcome: TaskOutcome;
  privacyScanStatus: TaskObservationPrivacyStatus;
  sourceRefs: SourceRef[];
  createdAt: string;
}

export type EvidenceType =
  | "file_changed"
  | "test_passed"
  | "test_failed"
  | "command_exit_code"
  | "error_observed"
  | "user_instruction"
  | "agent_summary"
  | "privacy_check";

export interface Evidence {
  type: EvidenceType;
  ref: string;
  summary: string;
  confidence: number;
}

export interface LessonCandidate {
  id: string;
  taskId: string;
  lessonType: LessonCandidateType;
  title: string;
  summary: string;
  lesson: string;
  appliesTo: string[];
  sourceRefs: SourceRef[];
  evidence: Evidence[];
  confidence: number;
  privacyStatus: TaskObservationPrivacyStatus;
  approvalStatus: LessonApprovalStatus;
  verifyRequired: boolean;
  suggestedVerification: string[];
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
