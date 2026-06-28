import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AmfDocument,
  AtlasIndex,
  MemoryConfidence,
  MemoryKind,
  MemoryPatch,
  MemoryRecord,
  MemoryScope,
  MemorySearchOptions,
  MemorySearchResult,
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
export const SHORT_TERM_MEMORY_FILE = "short-term.json";
export const LONG_TERM_MEMORY_FILE = "long-term.json";
export const MEMORY_EVENTS_FILE = "events.jsonl";
const DEFAULT_SHORT_TERM_TTL_MS = 24 * 60 * 60 * 1000;

export interface InitResult {
  atlasDir: string;
  amfPath: string;
  indexPath: string;
  configPath: string;
  memoryDir: string;
  experimentsDir: string;
}

export interface LmtiConfig {
  version: "0.1.0";
  kernel: "atlas";
  projectName: string;
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
    }
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
  await fs.mkdir(path.join(atlasDir, "cache"), { recursive: true });
  await fs.mkdir(path.join(atlasDir, "logs"), { recursive: true });
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.mkdir(experimentsDir, { recursive: true });

  const indexPath = path.join(atlasDir, INDEX_FILE);
  const amfPath = path.join(atlasDir, AMF_FILE);
  const configPath = path.join(atlasDir, CONFIG_FILE);
  await ensureFile(configPath, JSON.stringify(createDefaultLmtiConfig(), null, 2));
  await ensureFile(amfPath, JSON.stringify(createPlaceholderAmf(cwd), null, 2));
  await ensureJsonArray(path.join(memoryDir, SHORT_TERM_MEMORY_FILE));
  await ensureJsonArray(path.join(memoryDir, LONG_TERM_MEMORY_FILE));
  await ensureFile(path.join(memoryDir, MEMORY_EVENTS_FILE), "");

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

  return { atlasDir, amfPath, indexPath, configPath, memoryDir, experimentsDir };
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
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
    expiresAt:
      record.scope === "short_term"
        ? record.expiresAt ?? new Date((options.now ?? new Date()).getTime() + (options.shortTermTtlMs ?? DEFAULT_SHORT_TERM_TTL_MS)).toISOString()
        : record.expiresAt,
    version: record.version ?? 1
  };

  validateMemory(memory);
  const records = await readMemoryScope(memory.scope, cwd);
  records.push(memory);
  await writeMemoryScope(memory.scope, records, cwd);
  await appendMemoryEvent(cwd, { event: "memory.create", id: memory.id, scope: memory.scope, kind: memory.kind });
  return memory;
}

export async function listMemory(scope?: MemoryScope, options: MemoryRuntimeOptions = {}): Promise<MemoryRecord[]> {
  const cwd = options.cwd ?? process.cwd();
  await initAtlasStorage(cwd);
  await decayMemory(options);
  const records = scope ? await readMemoryScope(scope, cwd) : await readAllMemory(cwd);
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
  await ensureFile(path.join(memoryDir, MEMORY_EVENTS_FILE), "");
}

async function readAllMemory(cwd: string): Promise<MemoryRecord[]> {
  const [shortTerm, longTerm] = await Promise.all([readMemoryScope("short_term", cwd), readMemoryScope("long_term", cwd)]);
  return [...shortTerm, ...longTerm];
}

async function writeAllMemory(records: MemoryRecord[], cwd: string): Promise<void> {
  await writeMemoryScope(
    "short_term",
    records.filter((record) => record.scope === "short_term"),
    cwd
  );
  await writeMemoryScope(
    "long_term",
    records.filter((record) => record.scope === "long_term"),
    cwd
  );
}

async function readMemoryScope(scope: MemoryScope, cwd: string): Promise<MemoryRecord[]> {
  await initMemoryFiles(cwd);
  const content = await fs.readFile(memoryFilePath(cwd, scope), "utf8");
  return JSON.parse(content) as MemoryRecord[];
}

async function writeMemoryScope(scope: MemoryScope, records: MemoryRecord[], cwd: string): Promise<void> {
  await initMemoryFiles(cwd);
  await fs.writeFile(memoryFilePath(cwd, scope), JSON.stringify(records, null, 2), "utf8");
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
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
