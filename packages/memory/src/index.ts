import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AmfDocument,
  AtlasIndex,
  InferredIntent,
  MemoryConfidence,
  MemoryContextMode,
  MemoryKind,
  MemoryMetadata,
  MemoryPatch,
  MemorySearchResult,
  PolicyDecision,
  PolicySafeMemoryResult,
  PromptPolicy,
  MemoryRecord,
  MemoryScope,
  MemorySearchOptions,
  MemorySensitivity,
  NewMemoryRecord,
  PrivacyContext
} from "@atlas/types";
import { AMF_VERSION, createEmptyAmf } from "@atlas/types";
import {
  auditSensitiveAccess,
  createPrivacyContext,
  createSafeSummary,
  evaluateAccess,
  redactText
} from "@atlas/privacy";
import type { MemoryAddInput, MemorySearchQuery, MemoryStore } from "./types";

export type { MemoryAddInput, MemorySearchQuery, MemoryStore } from "./types";
export type { MemoryRecord, MemorySearchResult };

export const LMTI_DIR = ".lmti";
export const ATLAS_DIR = LMTI_DIR;
export const AMF_FILE = "project.amf.json";
export const INDEX_FILE = "index.json";
export const CONFIG_FILE = "config.json";
export const MEMORY_DIR = "memory";
export const EXPERIMENTS_DIR = "experiments";
export const EVENTS_DIR = "events";
export const SHORT_TERM_MEMORY_FILE = "short-term.json";
export const LONG_TERM_MEMORY_FILE = "long-term.json";
export const LESSONS_MEMORY_FILE = "lessons.json";
export const MEMORY_EVENTS_FILE = "events.jsonl";
export const TASK_EVENTS_FILE = "tasks.jsonl";
const DEFAULT_SHORT_TERM_TTL_MS = 24 * 60 * 60 * 1000;
const CONTEXT_MEMORY_SCORE_THRESHOLD = 3;

export interface InitResult {
  atlasDir: string;
  amfPath: string;
  indexPath: string;
  configPath: string;
  memoryDir: string;
  experimentsDir: string;
  eventsDir: string;
}

export interface LmtiConfig {
  version: "0.1.0";
  kernel: "atlas";
  projectName: string;
  migratedFrom?: "atlas";
  legacyDetected?: boolean;
  privacy: {
    defaultRole: "developer";
    allowSecretExport: false;
    allowExternalModelRawMemory: false;
  };
  codex: {
    attached: boolean;
    agentsFile: "AGENTS.md";
  };
}

export interface MemoryRuntimeOptions {
  cwd?: string;
  now?: Date;
  shortTermTtlMs?: number;
  privacyContext?: PrivacyContext;
}

export interface MemoryPrivacyFinding {
  id: string;
  scope: MemoryScope;
  sensitivity?: string;
  issue: string;
  recommendation: string;
}

export interface ContextMemorySearchResult {
  results: MemorySearchResult[];
  filteredOut: number;
}

export interface TaskDoneInput {
  title: string;
  summary: string;
  lesson?: string;
  tags?: string[];
  sensitivity?: MemorySensitivity;
  promptPolicy?: PromptPolicy;
  projectId?: string;
  taskIntent?: InferredIntent;
}

export interface TaskDoneEvent {
  title: string;
  summary: string;
  lessonMemoryId?: string;
  tags: string[];
  projectId: string;
  inferredIntent?: InferredIntent;
  recordedAt: string;
}

export interface TaskDoneResult {
  event: TaskDoneEvent;
  lessonMemory?: MemoryRecord;
  suggestion?: string;
}

export interface MemorySanitizationResult {
  mode: MemoryContextMode;
  record?: MemoryRecord;
  reason: string;
}

export interface RetrieveMemoryMetadataOptions extends MemoryRuntimeOptions {
  scope?: MemoryScope;
  kind?: MemoryKind;
}

export interface FetchAllowedMemoryContentOptions extends MemoryRuntimeOptions {
  metadata: MemoryMetadata[];
  privacyContext: PrivacyContext;
  taskIntent: InferredIntent;
  policyDecisions?: PolicyDecision[];
  limit?: number;
}

export function createDefaultLmtiConfig(): LmtiConfig {
  return {
    version: "0.1.0",
    kernel: "atlas",
    projectName: "",
    privacy: {
      defaultRole: "developer",
      allowSecretExport: false,
      allowExternalModelRawMemory: false
    },
    codex: {
      attached: true,
      agentsFile: "AGENTS.md"
    },
    legacyDetected: false
  };
}

function createPlaceholderAmf(cwd: string): AmfDocument {
  const root = path.resolve(cwd);
  const projectName = path.basename(root);
  return createEmptyAmf({
    name: projectName,
    root: normalizePath(root),
    compiledAt: "",
    atlasVersion: "0.0.0",
    amfVersion: AMF_VERSION,
    compiler: {
      name: "LMTI init placeholder",
      version: "0.1.0"
    },
    sourceBoundary: {
      root: normalizePath(root),
      ignoredDirectories: [],
      ignoredFiles: [],
      maxFileBytes: 0
    },
    checksum: "uncompiled"
  });
}

export async function initAtlasStorage(cwd = process.cwd()): Promise<InitResult> {
  const atlasDir = path.resolve(cwd, ATLAS_DIR);
  const memoryDir = path.join(atlasDir, MEMORY_DIR);
  const experimentsDir = path.join(atlasDir, EXPERIMENTS_DIR);
  const eventsDir = path.join(atlasDir, EVENTS_DIR);
  await fs.mkdir(path.join(atlasDir, "cache"), { recursive: true });
  await fs.mkdir(path.join(atlasDir, "logs"), { recursive: true });
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.mkdir(experimentsDir, { recursive: true });
  await fs.mkdir(eventsDir, { recursive: true });

  const indexPath = path.join(atlasDir, INDEX_FILE);
  const amfPath = path.join(atlasDir, AMF_FILE);
  const configPath = path.join(atlasDir, CONFIG_FILE);
  await ensureFile(configPath, JSON.stringify(createDefaultLmtiConfig(), null, 2));
  await ensureFile(amfPath, JSON.stringify(createPlaceholderAmf(cwd), null, 2));
  await ensureJsonArray(path.join(memoryDir, SHORT_TERM_MEMORY_FILE));
  await ensureJsonArray(path.join(memoryDir, LONG_TERM_MEMORY_FILE));
  await ensureJsonArray(path.join(memoryDir, LESSONS_MEMORY_FILE));
  await ensureFile(path.join(memoryDir, MEMORY_EVENTS_FILE), "");
  await ensureFile(path.join(eventsDir, TASK_EVENTS_FILE), "");

  try {
    await fs.access(indexPath);
  } catch {
    await fs.writeFile(
      indexPath,
      JSON.stringify(
        {
          version: "0.1.0",
          projectName: "",
          amfPath,
          compiledAt: "",
          files: 0,
          modules: 0,
          dependencies: 0,
          risks: 0
        },
        null,
        2
      ),
      "utf8"
    );
  }

  return { atlasDir, amfPath, indexPath, configPath, memoryDir, experimentsDir, eventsDir };
}

export async function writeAmfDocument(amf: AmfDocument, cwd = process.cwd()): Promise<InitResult> {
  const storage = await initAtlasStorage(cwd);
  await fs.writeFile(storage.amfPath, JSON.stringify(amf, null, 2), "utf8");

  const index: AtlasIndex = {
    version: amf.project.amfVersion,
    projectName: amf.project.name,
    amfPath: storage.amfPath,
    compiledAt: amf.project.compiledAt,
    files: amf.files.length,
    modules: amf.modules.length,
    dependencies: amf.dependencies.length,
    risks: amf.risks.length
  };

  await fs.writeFile(storage.indexPath, JSON.stringify(index, null, 2), "utf8");
  await appendEvent(cwd, {
    event: "compile",
    projectName: amf.project.name,
    compiledAt: amf.project.compiledAt,
    files: amf.files.length,
    modules: amf.modules.length,
    risks: amf.risks.length
  });

  return storage;
}

export async function readAmfDocument(amfPath?: string, cwd = process.cwd()): Promise<AmfDocument> {
  const resolved = amfPath ? path.resolve(cwd, amfPath) : path.resolve(cwd, ATLAS_DIR, AMF_FILE);
  const content = await fs.readFile(resolved, "utf8");
  return JSON.parse(content) as AmfDocument;
}

export async function appendEvent(cwd: string, event: Record<string, unknown>): Promise<void> {
  const atlasDir = path.resolve(cwd, ATLAS_DIR);
  await fs.mkdir(path.join(atlasDir, "logs"), { recursive: true });
  const line = JSON.stringify({ ...event, recordedAt: new Date().toISOString() });
  await fs.appendFile(path.join(atlasDir, "logs", "events.log"), `${line}\n`, "utf8");
}

export async function createMemory(record: NewMemoryRecord, options: MemoryRuntimeOptions = {}): Promise<MemoryRecord> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  await decayMemory(options);

  const now = (options.now ?? new Date()).toISOString();
  const memory: MemoryRecord = {
    id: record.id ?? randomUUID(),
    scope: record.scope,
    kind: record.kind,
    title: record.title.trim(),
    content: record.content.trim(),
    projectId: record.projectId.trim(),
    sourceRefs: record.sourceRefs ?? [],
    tags: record.tags ?? [],
    importance: clampImportance(record.importance),
    confidence: record.confidence,
    sensitivity: record.sensitivity,
    promptPolicy: normalizePromptPolicy(record.promptPolicy, record.sensitivity),
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
    expiresAt:
      record.scope === "short_term"
        ? record.expiresAt ?? new Date((options.now ?? new Date()).getTime() + (options.shortTermTtlMs ?? DEFAULT_SHORT_TERM_TTL_MS)).toISOString()
        : record.expiresAt,
    version: record.version ?? 1
  };

  validateMemory(memory);
  const records = memory.kind === "lesson" ? await readLessonMemory(cwd) : await readMemoryScope(memory.scope, cwd);
  records.push(memory);
  if (memory.kind === "lesson") {
    await writeLessonMemory(records, cwd);
  } else {
    await writeMemoryScope(memory.scope, records, cwd);
  }
  await appendMemoryEvent(cwd, { event: "memory.create", id: memory.id, scope: memory.scope, kind: memory.kind });
  return memory;
}

export async function listMemory(scope?: MemoryScope, options: MemoryRuntimeOptions = {}): Promise<MemoryRecord[]> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  await decayMemory(options);
  const records = scope ? (scope === "long_term" ? [...(await readMemoryScope(scope, cwd)), ...(await readLessonMemory(cwd))] : await readMemoryScope(scope, cwd)) : await readAllMemory(cwd);
  const visible = await applyPrivacy(records, options);
  return visible.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getMemory(id: string, options: MemoryRuntimeOptions = {}): Promise<MemoryRecord | undefined> {
  const records = await readAllMemory(options.cwd ?? process.cwd());
  return records.find((record) => record.id === id);
}

export async function updateMemory(id: string, patch: MemoryPatch, options: MemoryRuntimeOptions = {}): Promise<MemoryRecord> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  await decayMemory(options);

  const all = await readAllMemory(cwd);
  const existing = all.find((record) => record.id === id);
  if (!existing) {
    throw new Error(`Memory not found: ${id}`);
  }

  const updated: MemoryRecord = {
    ...existing,
    ...patch,
    id: existing.id,
    title: patch.title?.trim() ?? existing.title,
    content: patch.content?.trim() ?? existing.content,
    projectId: patch.projectId?.trim() ?? existing.projectId,
    importance: patch.importance === undefined ? existing.importance : clampImportance(patch.importance),
    updatedAt: (options.now ?? new Date()).toISOString(),
    version: existing.version + 1
  };

  validateMemory(updated);
  const without = all.filter((record) => record.id !== id);
  await writeAllMemory([...without, updated], cwd);
  await appendMemoryEvent(cwd, { event: "memory.update", id: updated.id, scope: updated.scope, kind: updated.kind });
  return updated;
}

export async function deleteMemory(id: string, options: MemoryRuntimeOptions = {}): Promise<boolean> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  const all = await readAllMemory(cwd);
  const next = all.filter((record) => record.id !== id);
  if (next.length === all.length) {
    return false;
  }
  await writeAllMemory(next, cwd);
  await appendMemoryEvent(cwd, { event: "memory.delete", id });
  return true;
}

export async function searchMemory(
  query: string,
  options: MemorySearchOptions & MemoryRuntimeOptions = {}
): Promise<MemorySearchResult[]> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  if (!options.includeExpired) {
    await decayMemory(options);
  }

  const keywords = tokenize(query);
  const records = options.scope ? await readMemoryScope(options.scope, cwd) : await readAllMemory(cwd);
  const scored = records
    .filter((record) => options.includeExpired || !isExpired(record, options.now ?? new Date()))
    .filter((record) => !options.kind || record.kind === options.kind)
    .map((record) => ({
      record,
      score: scoreMemory(record, keywords)
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || right.record.importance - left.record.importance);

  const privacyContext = privacyContextForOptions(options, {
    includeSecret: options.includeSecret ?? options.privacyContext?.includeSecret ?? false,
    command: options.privacyContext?.command ?? "memory search"
  });
  const visible: MemorySearchResult[] = [];
  for (const result of scored) {
    const sanitized = await applyPrivacyToRecord(result.record, { ...options, privacyContext });
    if (sanitized) {
      visible.push({ ...result, record: sanitized });
    }
    if (visible.length >= (options.limit ?? 20)) {
      break;
    }
  }
  return visible;
}

export async function retrieveMemoryMetadata(options: RetrieveMemoryMetadataOptions = {}): Promise<MemoryMetadata[]> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  const records = options.scope
    ? options.scope === "long_term"
      ? [...(await readMemoryScope(options.scope, cwd)), ...(await readLessonMemory(cwd))]
      : await readMemoryScope(options.scope, cwd)
    : await readAllMemory(cwd);

  return records.filter((record) => !options.kind || record.kind === options.kind).map((record) => toMemoryMetadata(record, options.now ?? new Date()));
}

export async function fetchAllowedMemoryContent(options: FetchAllowedMemoryContentOptions): Promise<PolicySafeMemoryResult[]> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  const records = await readAllMemory(cwd);
  const byId = new Map(records.map((record) => [record.id, record]));
  const decisionByMemoryId = new Map((options.policyDecisions ?? []).map((decision) => [decision.memoryId, decision.id]));
  const results: PolicySafeMemoryResult[] = [];

  for (const metadata of options.metadata) {
    const record = byId.get(metadata.id);
    if (!record) {
      continue;
    }

    const sanitized = await sanitizeMemoryForContext(record, options.privacyContext, options.taskIntent, {
      cwd,
      score: 0,
      why: ["passed metadata hard gate"]
    });
    if (!sanitized.record || sanitized.mode === "excluded") {
      continue;
    }

    const safeResult: PolicySafeMemoryResult = {
      metadata,
      mode: sanitized.mode,
      policyDecisionId: decisionByMemoryId.get(metadata.id) ?? `missing-policy-decision:${metadata.id}`,
      scoreInputs: createPolicySafeScoreInputs(metadata, sanitized.record, sanitized.mode),
      score: 0,
      why: [sanitized.reason]
    };

    if (sanitized.mode === "raw") {
      safeResult.safeContent = sanitized.record.content;
    } else if (sanitized.mode === "summary") {
      safeResult.safeSummary = sanitized.record.content;
    } else {
      safeResult.safeSummary = `${metadata.sensitivity} memory metadata only; raw content withheld.`;
    }

    results.push(safeResult);
    if (results.length >= (options.limit ?? 16)) {
      break;
    }
  }

  return results;
}

export async function searchMemoryForContext(
  query: string,
  options: MemorySearchOptions & MemoryRuntimeOptions & { taskIntent?: InferredIntent } = {}
): Promise<ContextMemorySearchResult> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  if (!options.includeExpired) {
    await decayMemory(options);
  }

  const taskIntent = options.taskIntent ?? createUnknownIntent(query);
  const privacyContext = privacyContextForOptions(options, {
    includeSecret: options.includeSecret ?? false,
    includeRaw: options.includeRaw ?? false,
    command: options.privacyContext?.command ?? "context"
  });
  const records = options.scope ? (options.scope === "long_term" ? [...(await readMemoryScope(options.scope, cwd)), ...(await readLessonMemory(cwd))] : await readMemoryScope(options.scope, cwd)) : await readAllMemory(cwd);
  const scored = records
    .filter((record) => options.includeExpired || !isExpired(record, options.now ?? new Date()))
    .filter((record) => !options.kind || record.kind === options.kind)
    .map((record) => ({
      record,
      ...scoreContextMemory(record, taskIntent, options.now ?? new Date())
    }))
    .sort((left, right) => right.score - left.score || right.record.importance - left.record.importance);

  const results: MemorySearchResult[] = [];
  let filteredOut = 0;
  const minScore = options.includeLowScore ? 1 : CONTEXT_MEMORY_SCORE_THRESHOLD;

  for (const candidate of scored) {
    if (candidate.score < minScore) {
      filteredOut += 1;
      continue;
    }

    const sanitized = await sanitizeMemoryForContext(candidate.record, privacyContext, taskIntent, {
      cwd,
      includeSecretMeta: Boolean(options.includeSecretMeta),
      score: candidate.score,
      why: candidate.why
    });
    if (!sanitized.record || sanitized.mode === "excluded") {
      filteredOut += 1;
      continue;
    }

    results.push({
      record: sanitized.record,
      score: candidate.score,
      mode: sanitized.mode,
      promptPolicy: sanitized.record.promptPolicy,
      why: [...candidate.why, sanitized.reason],
      intentMatch: candidate.intentMatch,
      keywordMatch: candidate.keywordMatch,
      negativeKeywordPenalty: candidate.negativeKeywordPenalty
    });

    if (results.length >= (options.limit ?? 16)) {
      break;
    }
  }

  return { results, filteredOut };
}

export async function sanitizeMemoryForContext(
  memory: MemoryRecord,
  privacyContext: PrivacyContext,
  taskIntent: InferredIntent,
  options: { cwd?: string; includeSecretMeta?: boolean; score?: number; why?: string[] } = {}
): Promise<MemorySanitizationResult> {
  const promptPolicy = normalizePromptPolicy(memory.promptPolicy, memory.sensitivity);
  const normalized = normalizeStoredMemory({ ...memory, promptPolicy });
  const cwd = options.cwd ?? process.cwd();

  if (promptPolicy === "do_not_prompt") {
    await appendContextPrivacyAudit(cwd, normalized, privacyContext, "excluded", "do_not_prompt memory filtered from context", taskIntent, options.score);
    return { mode: "excluded", reason: "do_not_prompt memory filtered from context" };
  }

  if (normalized.sensitivity === "secret") {
    if (privacyContext.role === "owner" && options.includeSecretMeta) {
      await appendContextPrivacyAudit(cwd, normalized, privacyContext, "metadata_only", "secret memory exposed as metadata only", taskIntent, options.score);
      return {
        mode: "metadata_only",
        reason: "secret memory metadata only for owner",
        record: {
          ...normalized,
          content: "",
          promptPolicy
        }
      };
    }
    await appendContextPrivacyAudit(cwd, normalized, privacyContext, "excluded", "secret memory filtered from normal context", taskIntent, options.score);
    return { mode: "excluded", reason: "secret memory filtered from normal context" };
  }

  if (normalized.sensitivity === "confidential") {
    await appendContextPrivacyAudit(cwd, normalized, privacyContext, "summary", "confidential memory summarized; raw blocked", taskIntent, options.score);
    return {
      mode: "summary",
      reason: "confidential memory summarized; raw blocked",
      record: {
        ...normalized,
        content: createSafeSummary(normalized),
        promptPolicy
      }
    };
  }

  if (normalized.sensitivity === "internal") {
    if (privacyContext.role === "owner" && privacyContext.includeRaw) {
      await appendContextPrivacyAudit(cwd, normalized, privacyContext, "raw", "owner requested raw internal memory", taskIntent, options.score);
      return {
        mode: "raw",
        reason: "owner requested raw internal memory",
        record: {
          ...normalized,
          content: redactText(normalized.content),
          promptPolicy
        }
      };
    }
    return {
      mode: "summary",
      reason: "internal memory summarized by default",
      record: {
        ...normalized,
        content: createTaskRelevantSummary(normalized, taskIntent),
        promptPolicy: "summarize_only"
      }
    };
  }

  if (promptPolicy === "summarize_only") {
    return {
      mode: "summary",
      reason: "public memory requested summarize_only",
      record: {
        ...normalized,
        content: createTaskRelevantSummary(normalized, taskIntent),
        promptPolicy
      }
    };
  }

  return {
    mode: "raw",
    reason: "public allow_raw memory included",
    record: {
      ...normalized,
      content: redactText(normalized.content),
      promptPolicy
    }
  };
}

export async function promoteMemory(id: string, options: MemoryRuntimeOptions = {}): Promise<MemoryRecord> {
  const existing = await getMemory(id, options);
  if (!existing) {
    throw new Error(`Memory not found: ${id}`);
  }
  if (existing.scope === "long_term") {
    return existing;
  }
  return updateMemory(
    id,
    {
      scope: "long_term",
      expiresAt: undefined
    },
    options
  );
}

export async function recordTaskDone(input: TaskDoneInput, options: MemoryRuntimeOptions = {}): Promise<TaskDoneResult> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  const tags = Array.from(new Set([...(input.tags ?? []), ...intentTags(input.taskIntent)]));
  const projectId = input.projectId?.trim() || "default";
  let lessonMemory: MemoryRecord | undefined;

  if (input.lesson?.trim()) {
    lessonMemory = await createMemory(
      {
        scope: "long_term",
        kind: "lesson",
        title: input.title.trim(),
        content: input.lesson.trim(),
        projectId,
        sourceRefs: [],
        tags,
        importance: 0.8,
        confidence: "medium",
        sensitivity: input.sensitivity ?? "internal",
        promptPolicy: input.promptPolicy ?? "summarize_only"
      },
      options
    );
  }

  const event: TaskDoneEvent = {
    title: input.title.trim(),
    summary: input.summary.trim(),
    lessonMemoryId: lessonMemory?.id,
    tags,
    projectId,
    inferredIntent: input.taskIntent,
    recordedAt: (options.now ?? new Date()).toISOString()
  };
  await appendTaskEvent(cwd, event);

  return {
    event,
    lessonMemory,
    suggestion: lessonMemory ? undefined : createRememberSuggestion(input.title, input.summary, tags, input.sensitivity ?? "internal", input.promptPolicy ?? "summarize_only")
  };
}

export async function decayMemory(options: MemoryRuntimeOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  await initMemoryFiles(cwd);
  const now = options.now ?? new Date();
  const shortTerm = await readMemoryScope("short_term", cwd);
  const active = shortTerm.filter((record) => !isExpired(record, now));
  const removed = shortTerm.length - active.length;
  if (removed > 0) {
    await writeMemoryScope("short_term", active, cwd);
    await appendMemoryEvent(cwd, { event: "memory.decay", removed });
  }
  return removed;
}

export async function checkMemoryPrivacy(options: MemoryRuntimeOptions = {}): Promise<MemoryPrivacyFinding[]> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  const records = await readAllMemory(cwd);
  const findings: MemoryPrivacyFinding[] = [];

  for (const record of records) {
    if (!record.sensitivity) {
      findings.push({
        id: record.id,
        scope: record.scope,
        issue: "Memory is missing mandatory sensitivity.",
        recommendation: "Set sensitivity to public, internal, confidential or secret."
      });
    }

    const redacted = redactText(record.content);
    if (redacted !== record.content && record.sensitivity !== "secret") {
      findings.push({
        id: record.id,
        scope: record.scope,
        sensitivity: record.sensitivity,
        issue: "Memory content appears to contain unredacted sensitive material.",
        recommendation: "Mark as secret or rewrite content with secrets removed."
      });
    }
  }

  return findings;
}

export class InMemoryStore implements MemoryStore {
  private records = new Map<string, MemoryRecord>();

  async add(record: MemoryRecord): Promise<MemoryRecord> {
    const copy = { ...record, sourceRefs: [...record.sourceRefs], tags: [...record.tags] };
    this.records.set(copy.id, copy);
    return copy;
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    const record = this.records.get(id);
    return record ? { ...record, sourceRefs: [...record.sourceRefs], tags: [...record.tags] } : undefined;
  }

  async list(scope?: MemoryScope): Promise<MemoryRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => !scope || record.scope === scope)
      .map((record) => ({ ...record, sourceRefs: [...record.sourceRefs], tags: [...record.tags] }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async search(query: string, options: MemorySearchQuery = {}): Promise<MemorySearchResult[]> {
    const keywords = tokenize(query);
    const tagFilters = new Set(options.tags ?? []);
    const records = await this.list(options.scope);
    return records
      .filter((record) => tagFilters.size === 0 || record.tags.some((tag) => tagFilters.has(tag)))
      .map((record) => ({ record, score: scoreMemory(record, keywords) }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score || right.record.importance - left.record.importance)
      .slice(0, options.limit ?? 20);
  }

  async clear(scope?: MemoryScope): Promise<void> {
    if (!scope) {
      this.records.clear();
      return;
    }

    for (const [id, record] of this.records.entries()) {
      if (record.scope === scope) {
        this.records.delete(id);
      }
    }
  }
}

export class ShortTermMemory {
  constructor(
    private readonly store: MemoryStore = new InMemoryStore(),
    private readonly options: { projectId?: string; ttlMs?: number } = {}
  ) {}

  async add(input: MemoryAddInput): Promise<MemoryRecord> {
    return this.store.add(createRuntimeMemoryRecord("short_term", input, this.options));
  }

  async search(query: string, options: Omit<MemorySearchQuery, "scope"> = {}): Promise<MemorySearchResult[]> {
    return this.store.search(query, { ...options, scope: "short_term" });
  }

  async list(): Promise<MemoryRecord[]> {
    return this.store.list("short_term");
  }

  async clear(): Promise<void> {
    await this.store.clear("short_term");
  }

  getStore(): MemoryStore {
    return this.store;
  }
}

export class LongTermMemory {
  constructor(
    private readonly store: MemoryStore = new InMemoryStore(),
    private readonly options: { projectId?: string } = {}
  ) {}

  async add(input: MemoryAddInput): Promise<MemoryRecord> {
    return this.store.add(createRuntimeMemoryRecord("long_term", input, this.options));
  }

  async search(query: string, options: Omit<MemorySearchQuery, "scope"> = {}): Promise<MemorySearchResult[]> {
    return this.store.search(query, { ...options, scope: "long_term" });
  }

  async list(): Promise<MemoryRecord[]> {
    return this.store.list("long_term");
  }

  async clear(): Promise<void> {
    await this.store.clear("long_term");
  }

  getStore(): MemoryStore {
    return this.store;
  }
}

function createRuntimeMemoryRecord(
  scope: MemoryScope,
  input: MemoryAddInput,
  options: { projectId?: string; ttlMs?: number }
): MemoryRecord {
  const now = new Date().toISOString();
  const sourceRefs = input.sourceRefs ?? (input.source ? [input.source] : []);
  const expiresAt =
    scope === "short_term"
      ? input.expiresAt ?? new Date(Date.now() + (options.ttlMs ?? DEFAULT_SHORT_TERM_TTL_MS)).toISOString()
      : undefined;

  return {
    id: input.id ?? randomUUID(),
    scope,
    kind: normalizeKind(input.kind),
    title: input.title.trim(),
    content: input.content.trim(),
    projectId: input.projectId ?? options.projectId ?? "runtime",
    sourceRefs,
    tags: input.tags ?? [],
    importance: clampImportance(input.importance ?? 0.5),
    confidence: normalizeConfidence(input.confidence),
    sensitivity: normalizeSensitivity(input.sensitivity),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    expiresAt,
    version: 1
  };
}

function normalizeKind(kind?: MemoryKind): MemoryKind {
  return kind ?? "system_note";
}

function normalizeStoredMemory(record: MemoryRecord): MemoryRecord {
  const raw = record as Partial<MemoryRecord> & {
    type?: string;
    summary?: string;
    source?: string;
    project?: string;
    privacy?: string[];
  };
  const sensitivity = normalizeSensitivity(raw.sensitivity ?? sensitivityFromLegacyPrivacy(raw.privacy));
  return {
    ...record,
    id: raw.id ?? randomUUID(),
    scope: raw.scope === "short_term" || raw.scope === "long_term" ? raw.scope : "long_term",
    kind: normalizeMemoryKind(raw.kind ?? raw.type),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Untitled memory",
    content: typeof raw.content === "string" ? raw.content : typeof raw.summary === "string" ? raw.summary : "",
    projectId: typeof raw.projectId === "string" ? raw.projectId : typeof raw.project === "string" ? raw.project : "default",
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : typeof raw.source === "string" ? [raw.source] : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    importance: typeof raw.importance === "number" ? raw.importance : 0.5,
    confidence: normalizeLegacyConfidence(raw.confidence),
    sensitivity,
    promptPolicy: normalizePromptPolicy(normalizeLegacyPromptPolicy(raw.promptPolicy), sensitivity),
    createdAt: raw.createdAt ?? raw.updatedAt ?? new Date(0).toISOString(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? new Date(0).toISOString(),
    expiresAt: raw.expiresAt,
    version: typeof raw.version === "number" ? raw.version : 1
  };
}

function normalizeMemoryKind(kind?: string): MemoryKind {
  const allowed = new Set<MemoryKind>([
    "task",
    "decision",
    "rule",
    "lesson",
    "bug",
    "risk",
    "route",
    "permission",
    "deploy_note",
    "debug_note",
    "summary",
    "preference",
    "experience",
    "system_note"
  ]);
  if (allowed.has(kind as MemoryKind)) {
    return kind as MemoryKind;
  }
  if (kind === "deploy" || kind === "deployment") {
    return "deploy_note";
  }
  return "system_note";
}

function normalizeLegacyConfidence(confidence?: string): MemoryConfidence {
  return confidence === "low" || confidence === "medium" || confidence === "high" ? confidence : "medium";
}

function sensitivityFromLegacyPrivacy(privacy?: string[]): MemorySensitivity | undefined {
  if (!Array.isArray(privacy)) {
    return undefined;
  }
  if (privacy.includes("secret")) {
    return "secret";
  }
  if (privacy.includes("confidential")) {
    return "confidential";
  }
  if (privacy.includes("public")) {
    return "public";
  }
  return "internal";
}

function normalizeLegacyPromptPolicy(promptPolicy?: PromptPolicy | string): PromptPolicy | undefined {
  if (promptPolicy === "never_prompt_raw") {
    return "do_not_prompt";
  }
  if (promptPolicy === "allow_raw" || promptPolicy === "summarize_only" || promptPolicy === "do_not_prompt") {
    return promptPolicy;
  }
  return undefined;
}

function toMemoryMetadata(record: MemoryRecord, now: Date): MemoryMetadata {
  const normalized = normalizeStoredMemory(record);
  return {
    id: normalized.id,
    scope: normalized.scope,
    kind: normalized.kind,
    title: redactText(normalized.title),
    projectId: normalized.projectId,
    sourceRefs: normalized.sourceRefs.map(redactText),
    tags: normalized.tags.map(redactText),
    importance: normalized.importance,
    confidence: normalized.confidence,
    sensitivity: normalized.sensitivity,
    promptPolicy: normalizePromptPolicy(normalized.promptPolicy, normalized.sensitivity),
    status: deriveMemoryStatus(normalized, now),
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    expiresAt: normalized.expiresAt,
    version: normalized.version
  };
}

function deriveMemoryStatus(record: MemoryRecord, now: Date): MemoryMetadata["status"] {
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }

  const markers = [record.title, ...record.tags].join(" ").toLowerCase();
  if (/\bdeprecated\b|\bobsolete\b|\bsuperseded\b/.test(markers)) {
    return "deprecated";
  }
  if (/\bpending\b|\breview\b|\bunverified\b/.test(markers)) {
    return "pending";
  }
  if (/\brejected\b|\binvalid\b/.test(markers)) {
    return "rejected";
  }
  return "active";
}

function createPolicySafeScoreInputs(metadata: MemoryMetadata, record: MemoryRecord, mode: MemoryContextMode): string[] {
  const base = [
    metadata.kind,
    metadata.title,
    metadata.projectId,
    ...metadata.tags,
    ...metadata.sourceRefs
  ];

  if (mode === "raw" || mode === "summary") {
    base.push(record.content);
  }

  return base.map(redactText);
}

function normalizePromptPolicy(promptPolicy: PromptPolicy | undefined, sensitivity: MemorySensitivity): PromptPolicy {
  if (promptPolicy === "allow_raw" || promptPolicy === "summarize_only" || promptPolicy === "do_not_prompt") {
    return promptPolicy;
  }
  if (sensitivity === "public") {
    return "allow_raw";
  }
  if (sensitivity === "secret") {
    return "do_not_prompt";
  }
  return "summarize_only";
}

function normalizeConfidence(confidence?: MemoryConfidence): MemoryConfidence {
  return confidence ?? "medium";
}

function normalizeSensitivity(sensitivity?: MemorySensitivity): MemorySensitivity {
  return sensitivity ?? "internal";
}

async function initMemoryFiles(cwd: string): Promise<void> {
  const memoryDir = path.resolve(cwd, ATLAS_DIR, MEMORY_DIR);
  await fs.mkdir(memoryDir, { recursive: true });
  await ensureJsonArray(path.join(memoryDir, SHORT_TERM_MEMORY_FILE));
  await ensureJsonArray(path.join(memoryDir, LONG_TERM_MEMORY_FILE));
  await ensureJsonArray(path.join(memoryDir, LESSONS_MEMORY_FILE));
  await ensureFile(path.join(memoryDir, MEMORY_EVENTS_FILE), "");
}

async function readAllMemory(cwd: string): Promise<MemoryRecord[]> {
  const [shortTerm, longTerm, lessons] = await Promise.all([readMemoryScope("short_term", cwd), readMemoryScope("long_term", cwd), readLessonMemory(cwd)]);
  return [...shortTerm, ...longTerm, ...lessons];
}

async function writeAllMemory(records: MemoryRecord[], cwd: string): Promise<void> {
  await writeMemoryScope(
    "short_term",
    records.filter((record) => record.scope === "short_term"),
    cwd
  );
  await writeMemoryScope(
    "long_term",
    records.filter((record) => record.scope === "long_term" && record.kind !== "lesson"),
    cwd
  );
  await writeLessonMemory(records.filter((record) => record.kind === "lesson"), cwd);
}

async function readMemoryScope(scope: MemoryScope, cwd: string): Promise<MemoryRecord[]> {
  await initMemoryFiles(cwd);
  const content = await fs.readFile(memoryFilePath(cwd, scope), "utf8");
  return (JSON.parse(content) as MemoryRecord[]).map(normalizeStoredMemory);
}

async function writeMemoryScope(scope: MemoryScope, records: MemoryRecord[], cwd: string): Promise<void> {
  await initMemoryFiles(cwd);
  await fs.writeFile(memoryFilePath(cwd, scope), JSON.stringify(records, null, 2), "utf8");
}

async function readLessonMemory(cwd: string): Promise<MemoryRecord[]> {
  await initMemoryFiles(cwd);
  const content = await fs.readFile(path.resolve(cwd, ATLAS_DIR, MEMORY_DIR, LESSONS_MEMORY_FILE), "utf8");
  return (JSON.parse(content) as MemoryRecord[]).map(normalizeStoredMemory);
}

async function writeLessonMemory(records: MemoryRecord[], cwd: string): Promise<void> {
  await initMemoryFiles(cwd);
  await fs.writeFile(path.resolve(cwd, ATLAS_DIR, MEMORY_DIR, LESSONS_MEMORY_FILE), JSON.stringify(records, null, 2), "utf8");
}

function memoryFilePath(cwd: string, scope: MemoryScope): string {
  const file = scope === "short_term" ? SHORT_TERM_MEMORY_FILE : LONG_TERM_MEMORY_FILE;
  return path.resolve(cwd, ATLAS_DIR, MEMORY_DIR, file);
}

async function applyPrivacy(records: MemoryRecord[], options: MemoryRuntimeOptions): Promise<MemoryRecord[]> {
  const visible: MemoryRecord[] = [];
  for (const record of records) {
    const sanitized = await applyPrivacyToRecord(record, options);
    if (sanitized) {
      visible.push(sanitized);
    }
  }
  return visible;
}

async function applyPrivacyToRecord(record: MemoryRecord, options: MemoryRuntimeOptions): Promise<MemoryRecord | undefined> {
  const cwd = options.cwd ?? process.cwd();
  const privacyContext = privacyContextForOptions(options);
  const evaluation = evaluateAccess(record, privacyContext);
  await auditSensitiveAccess(cwd, record, privacyContext, evaluation.decision, evaluation.reason);

  if (evaluation.decision === "deny") {
    return undefined;
  }

  if (evaluation.decision === "summarize") {
    return {
      ...record,
      title: redactText(record.title),
      content: createSafeSummary(record)
    };
  }

  if (record.sensitivity === "secret" && privacyContext.role === "owner" && privacyContext.includeSecret && privacyContext.includeRaw) {
    return record;
  }

  return {
    ...record,
    title: redactText(record.title),
    content: redactText(record.content)
  };
}

function privacyContextForOptions(options: MemoryRuntimeOptions, overrides: Partial<PrivacyContext> = {}): PrivacyContext {
  return createPrivacyContext({
    ...options.privacyContext,
    includeSecret: overrides.includeSecret ?? options.privacyContext?.includeSecret ?? false,
    includeRaw: overrides.includeRaw ?? options.privacyContext?.includeRaw ?? false,
    command: overrides.command ?? options.privacyContext?.command ?? "memory",
    timestamp: options.now?.toISOString() ?? options.privacyContext?.timestamp
  });
}

async function appendMemoryEvent(cwd: string, event: Record<string, unknown>): Promise<void> {
  await initMemoryFiles(cwd);
  const line = JSON.stringify({ ...event, recordedAt: new Date().toISOString() });
  await fs.appendFile(path.resolve(cwd, ATLAS_DIR, MEMORY_DIR, MEMORY_EVENTS_FILE), `${line}\n`, "utf8");
}

async function appendTaskEvent(cwd: string, event: TaskDoneEvent): Promise<void> {
  const eventsDir = path.resolve(cwd, ATLAS_DIR, EVENTS_DIR);
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.appendFile(path.join(eventsDir, TASK_EVENTS_FILE), `${JSON.stringify(event)}\n`, "utf8");
}

function intentTags(taskIntent?: InferredIntent): string[] {
  if (!taskIntent) {
    return [];
  }
  return [taskIntent.primaryIntent, ...taskIntent.secondaryIntents].filter((intent) => intent !== "unknown");
}

function createRememberSuggestion(title: string, summary: string, tags: string[], sensitivity: MemorySensitivity, promptPolicy: PromptPolicy): string {
  const safeTitle = title.replace(/"/g, "'");
  const safeSummary = summary.replace(/"/g, "'");
  const tagArg = tags.length > 0 ? tags.join(",") : "lesson";
  return `Should this be remembered as a project lesson? Use lmti remember --kind lesson --title "${safeTitle}" --content "${safeSummary}" --tags ${tagArg} --sensitivity ${sensitivity} --prompt-policy ${promptPolicy}`;
}

async function ensureJsonArray(filePath: string): Promise<void> {
  await ensureFile(filePath, "[]");
}

async function ensureFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, "utf8");
  }
}

function validateMemory(record: MemoryRecord): void {
  if (!record.title) {
    throw new Error("Memory title is required.");
  }
  if (!record.content) {
    throw new Error("Memory content is required.");
  }
  if (!record.projectId) {
    throw new Error("Memory projectId is required.");
  }
  if (record.scope === "long_term" && record.expiresAt) {
    throw new Error("Long-term memory must not expire automatically.");
  }
  if (record.promptPolicy && !["allow_raw", "summarize_only", "do_not_prompt"].includes(record.promptPolicy)) {
    throw new Error(`Invalid prompt policy: ${record.promptPolicy}`);
  }
}

function isExpired(record: MemoryRecord, now: Date): boolean {
  return Boolean(record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime());
}

function clampImportance(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

function scoreMemory(record: MemoryRecord, keywords: string[]): number {
  if (keywords.length === 0) {
    return 0;
  }
  const corpus = normalizeSearchText([record.title, record.content, record.kind, record.scope, record.projectId, ...record.tags, ...record.sourceRefs].join(" "));
  let score = 0;
  for (const keyword of keywords) {
    if (corpus.includes(keyword)) {
      score += keyword.length > 3 ? 2 : 1;
    }
  }
  return score + record.importance;
}

function scoreContextMemory(
  record: MemoryRecord,
  taskIntent: InferredIntent,
  now: Date
): { score: number; why: string[]; intentMatch: number; keywordMatch: number; negativeKeywordPenalty: number } {
  const corpus = normalizeSearchText([record.title, record.content, record.kind, record.scope, record.projectId, ...record.tags, ...record.sourceRefs].join(" "));
  const why: string[] = [];
  let intentMatch = 0;
  let keywordMatch = 0;
  let negativeKeywordPenalty = 0;

  const primaryTerms = [taskIntent.primaryIntent, ...intentKeywords(taskIntent.primaryIntent)];
  if (taskIntent.primaryIntent !== "unknown" && primaryTerms.some((term) => corpus.includes(normalizeSearchText(term)))) {
    intentMatch = 1;
    why.push(`matched primary intent ${taskIntent.primaryIntent}`);
  }

  for (const secondary of taskIntent.secondaryIntents) {
    const terms = [secondary, ...intentKeywords(secondary)];
    if (terms.some((term) => corpus.includes(normalizeSearchText(term)))) {
      intentMatch += 0.5;
      why.push(`matched secondary intent ${secondary}`);
    }
  }

  for (const keyword of taskIntent.keywords) {
    const normalized = normalizeSearchText(keyword);
    if (normalized && corpus.includes(normalized)) {
      keywordMatch += normalized.length > 3 ? 2 : 1;
    }
  }
  if (keywordMatch > 0) {
    why.push(`matched ${keywordMatch} keyword weight`);
  }

  for (const keyword of taskIntent.negativeKeywords) {
    const normalized = normalizeSearchText(keyword);
    if (normalized && corpus.includes(normalized)) {
      negativeKeywordPenalty += 1;
    }
  }
  if (negativeKeywordPenalty > 0) {
    why.push(`penalized ${negativeKeywordPenalty} negative keyword match`);
  }

  const memoryKindWeight = memoryKindWeightForIntent(record.kind, taskIntent);
  if (memoryKindWeight > 0) {
    why.push(`${record.kind} memory fits task intent`);
  }

  const routeMatch = routeMatchForIntent(corpus, taskIntent);
  if (routeMatch > 0) {
    why.push("matched route/API clue");
  }

  const recencyWeight = recencyWeightFor(record, now);
  const importanceWeight = record.importance * 2;
  const score = intentMatch * 5 + routeMatch * 4 + memoryKindWeight + keywordMatch + recencyWeight + importanceWeight - negativeKeywordPenalty * 8;

  return {
    score: Math.max(0, Math.round(score * 10) / 10),
    why,
    intentMatch,
    keywordMatch,
    negativeKeywordPenalty
  };
}

function memoryKindWeightForIntent(kind: MemoryKind, taskIntent: InferredIntent): number {
  const intents = new Set([taskIntent.primaryIntent, ...taskIntent.secondaryIntents]);
  if (kind === "permission" && intents.has("permission")) {
    return 4;
  }
  if (kind === "route" && intents.has("routing")) {
    return 4;
  }
  if ((kind === "deploy_note" || kind === "risk") && intents.has("deploy")) {
    return 3;
  }
  if ((kind === "debug_note" || kind === "bug" || kind === "risk") && (intents.has("debug") || intents.has("bugfix"))) {
    return 3;
  }
  if ((kind === "lesson" || kind === "rule" || kind === "decision") && taskIntent.primaryIntent !== "unknown") {
    return 2;
  }
  return 0;
}

function routeMatchForIntent(corpus: string, taskIntent: InferredIntent): number {
  const intents = new Set([taskIntent.primaryIntent, ...taskIntent.secondaryIntents]);
  if ((intents.has("routing") || intents.has("api") || intents.has("permission")) && (/\/[a-z0-9_-]+/i.test(corpus) || corpus.includes("endpoint") || corpus.includes("route"))) {
    return 1;
  }
  return 0;
}

function recencyWeightFor(record: MemoryRecord, now: Date): number {
  const updatedAt = new Date(record.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) {
    return 0;
  }
  const ageMs = now.getTime() - updatedAt;
  if (ageMs < 0) {
    return 0;
  }
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) {
    return 1;
  }
  if (ageMs <= 30 * 24 * 60 * 60 * 1000) {
    return 0.5;
  }
  return 0;
}

function intentKeywords(intent: InferredIntent["primaryIntent"]): string[] {
  switch (intent) {
    case "permission":
      return ["permission", "403", "forbidden", "least privilege", "role", "access"];
    case "routing":
      return ["route", "routing", "redirect", "path", "url"];
    case "dashboard":
      return ["dashboard", "summary", "agent"];
    case "deploy":
      return ["deploy", "build", "env", "logs", "release"];
    case "debug":
      return ["debug", "error", "risk", "module", "trace"];
    case "bugfix":
      return ["bug", "fix", "error", "loi"];
    case "api":
      return ["api", "endpoint", "request", "response"];
    case "partner":
      return ["partner"];
    case "privacy":
      return ["privacy", "secret", "confidential", "prompt"];
    case "memory":
      return ["memory", "lesson", "rule", "decision"];
    default:
      return [intent];
  }
}

function createUnknownIntent(query: string): InferredIntent {
  return {
    primaryIntent: "unknown",
    secondaryIntents: [],
    keywords: tokenize(query),
    negativeKeywords: [],
    confidence: 0
  };
}

function createTaskRelevantSummary(record: MemoryRecord, taskIntent: InferredIntent): string {
  const intentLabel = [taskIntent.primaryIntent, ...taskIntent.secondaryIntents].filter((intent) => intent !== "unknown").join(", ") || "task";
  const tags = record.tags.length > 0 ? ` Tags: ${record.tags.slice(0, 6).join(", ")}.` : "";
  return `${record.sensitivity} ${record.kind} memory "${redactText(record.title)}" matched ${intentLabel}.${tags} Raw content withheld by prompt policy.`;
}

async function appendContextPrivacyAudit(
  cwd: string,
  memory: MemoryRecord,
  privacyContext: PrivacyContext,
  mode: MemoryContextMode,
  reason: string,
  taskIntent: InferredIntent,
  score?: number
): Promise<void> {
  const shouldLog =
    memory.sensitivity === "confidential" ||
    memory.sensitivity === "secret" ||
    normalizePromptPolicy(memory.promptPolicy, memory.sensitivity) === "do_not_prompt" ||
    (memory.sensitivity === "internal" && mode === "raw");
  if (!shouldLog) {
    return;
  }

  const logsDir = path.resolve(cwd, ATLAS_DIR, "logs");
  await fs.mkdir(logsDir, { recursive: true });
  await fs.appendFile(
    path.join(logsDir, "privacy-audit.jsonl"),
    `${JSON.stringify({
      event: "memory.context_privacy",
      memoryId: memory.id,
      title: redactText(memory.title),
      sensitivity: memory.sensitivity,
      promptPolicy: normalizePromptPolicy(memory.promptPolicy, memory.sensitivity),
      mode,
      role: privacyContext.role,
      command: privacyContext.command,
      reason,
      primaryIntent: taskIntent.primaryIntent,
      score,
      recordedAt: new Date().toISOString()
    })}\n`,
    "utf8"
  );
}

function tokenize(query: string): string[] {
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "fix", "bug"]);
  return Array.from(
    new Set(
      normalizeSearchText(query)
        .split(/[^a-z0-9_]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !stopWords.has(part))
    )
  );
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/l(?:á|Ã¡)»(?:—|�)?i/giu, "loi")
    .replace(/b(?:á|Ã¡)»(?:‹|�)?/giu, "bi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
