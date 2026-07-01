import { randomUUID, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { redactText, runEgressSecretScan } from "@atlas/privacy";
import { createFrameworkVerificationPlan, getFrameworkRiskForFiles, type FrameworkDetectionResult } from "@atlas/frameworks";
import { routeMindIntent } from "./mind-orchestrator";

export const CODEX_ACTION_DB_FILE = "codex-actions.sqlite";

export type CodexSessionStatus = "running" | "completed" | "failed" | "blocked" | "rolled_back" | "needs_review";
export type CodexRiskLevel = "low" | "medium" | "high" | "critical";
export type CodexScopeStatus = "inside_scope" | "borderline" | "outside_scope" | "unknown";
export type CodexPrivacyStatus = "safe" | "warning" | "blocked" | "unknown";
export type CodexActionStatus = "ok" | "failed" | "blocked" | "warning";
export type CodexActionType =
  | "task_received"
  | "intent_detected"
  | "memory_context_loaded"
  | "file_read"
  | "file_modified"
  | "file_created"
  | "file_deleted"
  | "file_renamed"
  | "command_run"
  | "test_run"
  | "build_run"
  | "lint_run"
  | "error_detected"
  | "decision_made"
  | "scope_warning"
  | "privacy_warning"
  | "risk_warning"
  | "rollback_suggested"
  | "task_completed"
  | "reflection_saved";

export type CodexFileEventType = "read" | "modified" | "created" | "deleted" | "renamed";
export type CodexMemoryUsageType = "short" | "long" | "guardrail" | "task_hint";

export interface CodexActionStorageInitResult {
  dbPath: string;
  schemaVersion: number;
}

export interface CodexSession {
  id: string;
  task: string;
  intent?: string;
  status: CodexSessionStatus;
  riskLevel: CodexRiskLevel;
  scopeStatus: CodexScopeStatus;
  privacyStatus: CodexPrivacyStatus;
  branch?: string;
  startedAt: string;
  endedAt?: string;
  summary?: string;
}

export interface CodexAction {
  id: string;
  sessionId: string;
  actionType: CodexActionType;
  title: string;
  detail?: string;
  filePath?: string;
  command?: string;
  status: CodexActionStatus;
  riskLevel: CodexRiskLevel;
  createdAt: string;
}

export interface CodexFileEvent {
  id: string;
  sessionId: string;
  filePath: string;
  eventType: CodexFileEventType;
  beforeHash?: string;
  afterHash?: string;
  diffSummary?: string;
  linesAdded: number;
  linesRemoved: number;
  riskLevel: CodexRiskLevel;
  createdAt: string;
}

export interface CodexCommandEvent {
  id: string;
  sessionId: string;
  command: string;
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
  outputSummary?: string;
  errorSummary?: string;
  riskLevel: CodexRiskLevel;
  createdAt: string;
}

export interface CodexDecision {
  id: string;
  sessionId: string;
  decision: string;
  reason?: string;
  alternatives: string[];
  relatedFiles: string[];
  relatedMemoryIds: string[];
  confidence: number;
  riskLevel: CodexRiskLevel;
  createdAt: string;
}

export interface CodexMemoryUsage {
  id: string;
  sessionId: string;
  memoryId: string;
  memoryType: CodexMemoryUsageType;
  role?: string;
  reason?: string;
  usedInDecision: boolean;
  createdAt: string;
}

export interface CodexReflection {
  id: string;
  sessionId: string;
  taskSummary?: string;
  filesChanged: string[];
  testsRun: string[];
  bugsFound: string[];
  lessonsCreated: string[];
  shortNotesCreated: string[];
  longMemoriesCreated: string[];
  risksRemaining: string[];
  createdAt: string;
}

export interface CodexSessionDetail {
  session: CodexSession;
  timeline: CodexAction[];
  fileEvents: CodexFileEvent[];
  commandEvents: CodexCommandEvent[];
  decisions: CodexDecision[];
  memoryUsage: CodexMemoryUsage[];
  reflections: CodexReflection[];
  riskAnalysis: CodexRiskAnalysisResult;
}

export interface CodexActionStats {
  activeSessions: number;
  completedSessions: number;
  failedSessions: number;
  highRiskSessions: number;
  filesModifiedToday: number;
  commandsRunToday: number;
  privacyWarnings: number;
  scopeWarnings: number;
  sessionsWithoutTests: number;
  reflectionsSaved: number;
  sessionsByStatus: Record<CodexSessionStatus, number>;
  riskDistribution: Record<CodexRiskLevel, number>;
}

export interface EvaluateCodexScopeInput {
  task: string;
  intendedFiles?: string[];
  touchedFiles: string[];
  commandsRun: string[];
  memoryUsed?: string[];
}

export interface CodexScopeEvaluation {
  scopeStatus: "inside_scope" | "borderline" | "outside_scope";
  warnings: string[];
  riskyFiles: string[];
  riskyCommands: string[];
}

export interface CodexRiskAnalysisResult {
  riskLevel: CodexRiskLevel;
  reasons: string[];
  requiredVerification: string[];
  rollbackRecommended: boolean;
}

interface CodexSessionRow {
  id: string;
  task: string;
  intent: string | null;
  status: string;
  risk_level: string | null;
  scope_status: string | null;
  privacy_status: string | null;
  branch: string | null;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

interface CodexActionRow {
  id: string;
  session_id: string;
  action_type: string;
  title: string;
  detail: string | null;
  file_path: string | null;
  command: string | null;
  status: string | null;
  risk_level: string | null;
  created_at: string;
}

interface CodexFileEventRow {
  id: string;
  session_id: string;
  file_path: string;
  event_type: string;
  before_hash: string | null;
  after_hash: string | null;
  diff_summary: string | null;
  lines_added: number | null;
  lines_removed: number | null;
  risk_level: string | null;
  created_at: string;
}

interface CodexCommandEventRow {
  id: string;
  session_id: string;
  command: string;
  cwd: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  output_summary: string | null;
  error_summary: string | null;
  risk_level: string | null;
  created_at: string;
}

interface CodexDecisionRow {
  id: string;
  session_id: string;
  decision: string;
  reason: string | null;
  alternatives: string | null;
  related_files: string | null;
  related_memory_ids: string | null;
  confidence: number | null;
  risk_level: string | null;
  created_at: string;
}

interface CodexMemoryUsageRow {
  id: string;
  session_id: string;
  memory_id: string;
  memory_type: string;
  role: string | null;
  reason: string | null;
  used_in_decision: number | null;
  created_at: string;
}

interface CodexReflectionRow {
  id: string;
  session_id: string;
  task_summary: string | null;
  files_changed: string | null;
  tests_run: string | null;
  bugs_found: string | null;
  lessons_created: string | null;
  short_notes_created: string | null;
  long_memories_created: string | null;
  risks_remaining: string | null;
  created_at: string;
}

type SqliteValue = string | number | null;

const SCHEMA_VERSION = 1;
const MAX_SUMMARY_CHARS = 1200;

export async function initCodexActionViewStorage(cwd = process.cwd()): Promise<CodexActionStorageInitResult> {
  const dbPath = await ensureCodexActionDbPath(cwd);
  const db = await openCodexActionDatabase(dbPath);
  try {
    applyCodexActionSchema(db);
    return { dbPath, schemaVersion: SCHEMA_VERSION };
  } finally {
    db.close();
  }
}

export async function startCodexSession(input: { task: string; branch?: string; intent?: string; cwd?: string; now?: Date }): Promise<CodexSession> {
  const cwd = input.cwd ?? process.cwd();
  const now = (input.now ?? new Date()).toISOString();
  const routedIntent = input.intent ?? routeMindIntent(input.task).primary;
  const session: CodexSession = {
    id: randomUUID(),
    task: safeText(input.task, 1000),
    intent: safeText(routedIntent, 240),
    status: "running",
    riskLevel: "medium",
    scopeStatus: "unknown",
    privacyStatus: hasSecretLike(input.task) ? "warning" : "safe",
    branch: input.branch ? safeText(input.branch, 240) : undefined,
    startedAt: now
  };
  const db = await openInitialized(cwd);
  try {
    db.prepare(`
      INSERT INTO codex_sessions(id, task, intent, status, risk_level, scope_status, privacy_status, branch, started_at, ended_at, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.task,
      session.intent ?? null,
      session.status,
      session.riskLevel,
      session.scopeStatus,
      session.privacyStatus,
      session.branch ?? null,
      session.startedAt,
      null,
      null
    );
    insertAction(db, {
      sessionId: session.id,
      actionType: "task_received",
      title: "Task received",
      detail: session.task,
      status: "ok",
      riskLevel: session.riskLevel,
      now
    });
    insertAction(db, {
      sessionId: session.id,
      actionType: "intent_detected",
      title: `Intent detected: ${session.intent ?? "unknown"}`,
      detail: session.intent,
      status: "ok",
      riskLevel: "low",
      now
    });
    return session;
  } finally {
    db.close();
  }
}

export async function logCodexAction(input: {
  cwd?: string;
  sessionId: string;
  actionType: CodexActionType;
  title: string;
  detail?: string;
  filePath?: string;
  command?: string;
  status?: CodexActionStatus;
  riskLevel?: CodexRiskLevel;
  now?: Date;
}): Promise<CodexAction> {
  const cwd = input.cwd ?? process.cwd();
  const db = await openInitialized(cwd);
  try {
    const riskLevel = input.riskLevel ?? inferActionRisk(input.actionType, input.filePath, input.command, input.detail);
    const action = insertAction(db, {
      sessionId: input.sessionId,
      actionType: input.actionType,
      title: input.title,
      detail: input.detail,
      filePath: input.filePath,
      command: input.command,
      status: input.status ?? "ok",
      riskLevel,
      now: (input.now ?? new Date()).toISOString()
    });
    if (riskLevel === "high" || riskLevel === "critical") {
      insertAction(db, {
        sessionId: input.sessionId,
        actionType: "risk_warning",
        title: `${riskLevel} risk action detected`,
        detail: input.title,
        status: "warning",
        riskLevel,
        now: action.createdAt
      });
    }
    return action;
  } finally {
    db.close();
  }
}

export async function logCodexFileEvent(input: {
  cwd?: string;
  sessionId: string;
  filePath: string;
  eventType: CodexFileEventType;
  beforeContent?: string;
  afterContent?: string;
  beforeHash?: string;
  afterHash?: string;
  diffSummary?: string;
  linesAdded?: number;
  linesRemoved?: number;
  riskLevel?: CodexRiskLevel;
  now?: Date;
}): Promise<CodexFileEvent> {
  const cwd = input.cwd ?? process.cwd();
  const now = (input.now ?? new Date()).toISOString();
  const riskLevel = input.riskLevel ?? inferFileRisk(input.filePath);
  const beforeHash = input.beforeHash ?? (input.beforeContent ? hashText(input.beforeContent) : undefined);
  const afterHash = input.afterHash ?? (input.afterContent ? hashText(input.afterContent) : undefined);
  const diff = summarizeDiff(input.beforeContent, input.afterContent, input.diffSummary);
  const event: CodexFileEvent = {
    id: randomUUID(),
    sessionId: input.sessionId,
    filePath: safePath(input.filePath),
    eventType: input.eventType,
    beforeHash,
    afterHash,
    diffSummary: diff,
    linesAdded: input.linesAdded ?? countLinesAdded(input.beforeContent, input.afterContent),
    linesRemoved: input.linesRemoved ?? countLinesRemoved(input.beforeContent, input.afterContent),
    riskLevel,
    createdAt: now
  };
  const db = await openInitialized(cwd);
  try {
    db.prepare(`
      INSERT INTO codex_file_events(id, session_id, file_path, event_type, before_hash, after_hash, diff_summary, lines_added, lines_removed, risk_level, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.sessionId,
      event.filePath,
      event.eventType,
      event.beforeHash ?? null,
      event.afterHash ?? null,
      event.diffSummary ?? null,
      event.linesAdded,
      event.linesRemoved,
      event.riskLevel,
      event.createdAt
    );
    insertAction(db, {
      sessionId: event.sessionId,
      actionType: fileActionType(event.eventType),
      title: `${event.eventType}: ${event.filePath}`,
      detail: event.diffSummary,
      filePath: event.filePath,
      status: "ok",
      riskLevel: event.riskLevel,
      now
    });
    return event;
  } finally {
    db.close();
  }
}

export async function logCodexCommandEvent(input: {
  cwd?: string;
  sessionId: string;
  command: string;
  commandCwd?: string;
  exitCode?: number;
  durationMs?: number;
  output?: string;
  error?: string;
  outputSummary?: string;
  errorSummary?: string;
  riskLevel?: CodexRiskLevel;
  now?: Date;
}): Promise<CodexCommandEvent> {
  const cwd = input.cwd ?? process.cwd();
  const now = (input.now ?? new Date()).toISOString();
  const riskLevel = maxRisk(input.riskLevel ?? "low", inferCommandRisk(input.command), input.exitCode && input.exitCode !== 0 ? "medium" : "low");
  const event: CodexCommandEvent = {
    id: randomUUID(),
    sessionId: input.sessionId,
    command: safeCommand(input.command),
    cwd: input.commandCwd ? safePath(input.commandCwd) : undefined,
    exitCode: input.exitCode,
    durationMs: input.durationMs,
    outputSummary: summarizeCommandOutput(input.outputSummary ?? input.output),
    errorSummary: summarizeCommandOutput(input.errorSummary ?? input.error),
    riskLevel,
    createdAt: now
  };
  const db = await openInitialized(cwd);
  try {
    db.prepare(`
      INSERT INTO codex_command_events(id, session_id, command, cwd, exit_code, duration_ms, output_summary, error_summary, risk_level, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.sessionId,
      event.command,
      event.cwd ?? null,
      event.exitCode ?? null,
      event.durationMs ?? null,
      event.outputSummary ?? null,
      event.errorSummary ?? null,
      event.riskLevel,
      event.createdAt
    );
    insertAction(db, {
      sessionId: event.sessionId,
      actionType: commandActionType(event.command),
      title: `Command run: ${event.command}`,
      detail: event.exitCode === undefined ? undefined : `exit_code=${event.exitCode}`,
      command: event.command,
      status: event.exitCode === undefined || event.exitCode === 0 ? "ok" : "failed",
      riskLevel: event.riskLevel,
      now
    });
    if (event.exitCode !== undefined && event.exitCode !== 0) {
      insertAction(db, {
        sessionId: event.sessionId,
        actionType: "error_detected",
        title: `Command failed: ${event.command}`,
        detail: event.errorSummary,
        command: event.command,
        status: "failed",
        riskLevel: maxRisk(event.riskLevel, "medium"),
        now
      });
    }
    if (event.riskLevel === "high" || event.riskLevel === "critical") {
      insertAction(db, {
        sessionId: event.sessionId,
        actionType: "risk_warning",
        title: `${event.riskLevel} risk command detected`,
        detail: event.command,
        command: event.command,
        status: "warning",
        riskLevel: event.riskLevel,
        now
      });
    }
    return event;
  } finally {
    db.close();
  }
}

export async function logCodexDecision(input: {
  cwd?: string;
  sessionId: string;
  decision: string;
  reason?: string;
  alternatives?: string[];
  relatedFiles?: string[];
  relatedMemoryIds?: string[];
  confidence?: number;
  riskLevel?: CodexRiskLevel;
  now?: Date;
}): Promise<CodexDecision> {
  const cwd = input.cwd ?? process.cwd();
  const now = (input.now ?? new Date()).toISOString();
  const decision: CodexDecision = {
    id: randomUUID(),
    sessionId: input.sessionId,
    decision: safeText(input.decision, 1200),
    reason: input.reason ? safeText(input.reason, 1800) : undefined,
    alternatives: sanitizeArray(input.alternatives ?? []),
    relatedFiles: sanitizeArray(input.relatedFiles ?? []).map(safePath),
    relatedMemoryIds: sanitizeArray(input.relatedMemoryIds ?? []),
    confidence: clamp01(input.confidence ?? 0.5),
    riskLevel: input.riskLevel ?? "medium",
    createdAt: now
  };
  const db = await openInitialized(cwd);
  try {
    db.prepare(`
      INSERT INTO codex_decisions(id, session_id, decision, reason, alternatives, related_files, related_memory_ids, confidence, risk_level, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decision.id,
      decision.sessionId,
      decision.decision,
      decision.reason ?? null,
      JSON.stringify(decision.alternatives),
      JSON.stringify(decision.relatedFiles),
      JSON.stringify(decision.relatedMemoryIds),
      decision.confidence,
      decision.riskLevel,
      decision.createdAt
    );
    insertAction(db, {
      sessionId: decision.sessionId,
      actionType: "decision_made",
      title: `Decision: ${decision.decision}`,
      detail: decision.reason,
      status: "ok",
      riskLevel: decision.riskLevel,
      now
    });
    return decision;
  } finally {
    db.close();
  }
}

export async function logCodexMemoryUsage(input: {
  cwd?: string;
  sessionId: string;
  memoryId: string;
  memoryType: CodexMemoryUsageType;
  role?: string;
  reason?: string;
  usedInDecision?: boolean;
  now?: Date;
}): Promise<CodexMemoryUsage> {
  const cwd = input.cwd ?? process.cwd();
  const now = (input.now ?? new Date()).toISOString();
  const usage: CodexMemoryUsage = {
    id: randomUUID(),
    sessionId: input.sessionId,
    memoryId: safeText(input.memoryId, 240),
    memoryType: input.memoryType,
    role: input.role ? safeText(input.role, 80) : undefined,
    reason: input.reason ? safeText(input.reason, 800) : undefined,
    usedInDecision: Boolean(input.usedInDecision),
    createdAt: now
  };
  const db = await openInitialized(cwd);
  try {
    db.prepare(`
      INSERT INTO codex_memory_usage(id, session_id, memory_id, memory_type, role, reason, used_in_decision, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usage.id,
      usage.sessionId,
      usage.memoryId,
      usage.memoryType,
      usage.role ?? null,
      usage.reason ?? null,
      usage.usedInDecision ? 1 : 0,
      usage.createdAt
    );
    insertAction(db, {
      sessionId: usage.sessionId,
      actionType: "memory_context_loaded",
      title: `Memory context used: ${usage.memoryType}`,
      detail: `${usage.memoryId}${usage.reason ? ` - ${usage.reason}` : ""}`,
      status: "ok",
      riskLevel: "low",
      now
    });
    return usage;
  } finally {
    db.close();
  }
}

export async function logCodexReflection(input: {
  cwd?: string;
  sessionId: string;
  taskSummary?: string;
  filesChanged?: string[];
  testsRun?: string[];
  bugsFound?: string[];
  lessonsCreated?: string[];
  shortNotesCreated?: string[];
  longMemoriesCreated?: string[];
  risksRemaining?: string[];
  now?: Date;
}): Promise<CodexReflection> {
  const cwd = input.cwd ?? process.cwd();
  const now = (input.now ?? new Date()).toISOString();
  const reflection: CodexReflection = {
    id: randomUUID(),
    sessionId: input.sessionId,
    taskSummary: input.taskSummary ? safeText(input.taskSummary, 1600) : undefined,
    filesChanged: sanitizeArray(input.filesChanged ?? []).map(safePath),
    testsRun: sanitizeArray(input.testsRun ?? []).map(safeCommand),
    bugsFound: sanitizeArray(input.bugsFound ?? []),
    lessonsCreated: sanitizeArray(input.lessonsCreated ?? []),
    shortNotesCreated: sanitizeArray(input.shortNotesCreated ?? []),
    longMemoriesCreated: sanitizeArray(input.longMemoriesCreated ?? []),
    risksRemaining: sanitizeArray(input.risksRemaining ?? []),
    createdAt: now
  };
  const db = await openInitialized(cwd);
  try {
    db.prepare(`
      INSERT INTO codex_reflections(id, session_id, task_summary, files_changed, tests_run, bugs_found, lessons_created, short_notes_created, long_memories_created, risks_remaining, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reflection.id,
      reflection.sessionId,
      reflection.taskSummary ?? null,
      JSON.stringify(reflection.filesChanged),
      JSON.stringify(reflection.testsRun),
      JSON.stringify(reflection.bugsFound),
      JSON.stringify(reflection.lessonsCreated),
      JSON.stringify(reflection.shortNotesCreated),
      JSON.stringify(reflection.longMemoriesCreated),
      JSON.stringify(reflection.risksRemaining),
      reflection.createdAt
    );
    insertAction(db, {
      sessionId: reflection.sessionId,
      actionType: "reflection_saved",
      title: "Reflection saved",
      detail: reflection.taskSummary,
      status: "ok",
      riskLevel: reflection.risksRemaining.length > 0 ? "medium" : "low",
      now
    });
    return reflection;
  } finally {
    db.close();
  }
}

export async function endCodexSession(input: {
  cwd?: string;
  sessionId: string;
  status: CodexSessionStatus;
  summary?: string;
  now?: Date;
}): Promise<CodexSession> {
  const cwd = input.cwd ?? process.cwd();
  const detail = await getCodexSessionDetail(input.sessionId, { cwd });
  const analysis = analyzeCodexRisk({
    task: detail.session.task,
    actions: detail.timeline,
    fileEvents: detail.fileEvents,
    commandEvents: detail.commandEvents,
    decisions: detail.decisions
  });
  const scope = evaluateCodexScope({
    task: detail.session.task,
    touchedFiles: detail.fileEvents.map((event) => event.filePath),
    commandsRun: detail.commandEvents.map((event) => event.command),
    memoryUsed: detail.memoryUsage.map((usage) => usage.memoryId)
  });
  const privacyStatus: CodexPrivacyStatus = detail.timeline.some((action) => action.actionType === "privacy_warning") ? "warning" : detail.session.privacyStatus;
  const now = (input.now ?? new Date()).toISOString();
  const db = await openInitialized(cwd);
  try {
    db.prepare(`
      UPDATE codex_sessions
      SET status = ?, risk_level = ?, scope_status = ?, privacy_status = ?, ended_at = ?, summary = ?
      WHERE id = ?
    `).run(
      input.status,
      analysis.riskLevel,
      scope.scopeStatus,
      privacyStatus,
      now,
      input.summary ? safeText(input.summary, 1600) : null,
      input.sessionId
    );
    insertAction(db, {
      sessionId: input.sessionId,
      actionType: "task_completed",
      title: `Task ${input.status}`,
      detail: input.summary,
      status: input.status === "completed" ? "ok" : input.status === "failed" ? "failed" : "warning",
      riskLevel: analysis.riskLevel,
      now
    });
  } finally {
    db.close();
  }
  return getCodexSession(input.sessionId, { cwd }).then((session) => {
    if (!session) {
      throw new Error(`Codex session not found: ${input.sessionId}`);
    }
    return session;
  });
}

export function evaluateCodexScope(input: EvaluateCodexScopeInput): CodexScopeEvaluation {
  const intent = routeMindIntent(input.task);
  const warnings: string[] = [];
  const riskyFiles = input.touchedFiles.filter((file) => inferFileRisk(file) === "high" || inferFileRisk(file) === "critical").map(safePath);
  const riskyCommands = input.commandsRun.filter((command) => inferCommandRisk(command) === "high" || inferCommandRisk(command) === "critical").map(safeCommand);
  const normalizedFiles = input.touchedFiles.map(normalizeText);

  if (intent.primary === "ui_ux" && normalizedFiles.some((file) => /(auth|permission|database|migration|deploy|docker|nginx)/i.test(file))) {
    warnings.push("UI task touched auth, database or deployment files.");
  }
  if ((intent.primary === "seo_content" || intent.primary === "contract_document") && normalizedFiles.some((file) => /(package|lock|migration|auth|permission)/i.test(file))) {
    warnings.push("Content/document task touched package, migration or auth files.");
  }
  if (intent.primary === "security" && normalizedFiles.some((file) => /(logo|brand|asset|seo|content)/i.test(file))) {
    warnings.push("Security task touched branding/content files that may be noise.");
  }
  if (input.touchedFiles.length > 8) {
    warnings.push("Small task touched many files; review scope.");
  }
  if (input.intendedFiles && input.intendedFiles.length > 0) {
    const intended = new Set(input.intendedFiles.map((file) => normalizeText(path.normalize(file))));
    const outside = input.touchedFiles.filter((file) => !intended.has(normalizeText(path.normalize(file))));
    if (outside.length > 0) {
      warnings.push(`Touched files outside intended scope: ${outside.slice(0, 5).map(safePath).join(", ")}`);
      riskyFiles.push(...outside.map(safePath));
    }
  }
  const lockfileTouched = normalizedFiles.some((file) => /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(file));
  const packageTouched = normalizedFiles.some((file) => /package\.json$/i.test(file));
  if (lockfileTouched && !packageTouched) {
    warnings.push("Lockfile changed without package manifest change.");
  }
  if (riskyCommands.length > 0) {
    warnings.push("Dangerous command detected.");
  }

  const scopeStatus = riskyCommands.length > 0 || warnings.length >= 2
    ? "outside_scope"
    : warnings.length > 0 || riskyFiles.length > 0
      ? "borderline"
      : "inside_scope";
  return {
    scopeStatus,
    warnings: Array.from(new Set(warnings.map(redactText))),
    riskyFiles: Array.from(new Set(riskyFiles)),
    riskyCommands: Array.from(new Set(riskyCommands))
  };
}

export function analyzeCodexRisk(input: {
  task: string;
  actions: CodexAction[];
  fileEvents: CodexFileEvent[];
  commandEvents: CodexCommandEvent[];
  decisions: CodexDecision[];
}): CodexRiskAnalysisResult {
  const reasons = new Set<string>();
  const requiredVerification = new Set<string>();
  let risk: CodexRiskLevel = "low";

  for (const event of input.fileEvents) {
    const fileRisk = inferFileRisk(event.filePath);
    risk = maxRisk(risk, fileRisk, event.riskLevel);
    if (fileRisk === "high" || fileRisk === "critical") {
      reasons.add(`High-risk file touched: ${event.filePath}`);
      requiredVerification.add("Run focused tests for touched high-risk area.");
    }
    if (/(auth|permission|middleware)/i.test(event.filePath)) {
      requiredVerification.add("Verify authorization and least-privilege behavior.");
    }
    if (/(migration|schema|database|prisma)/i.test(event.filePath)) {
      requiredVerification.add("Verify database migration/schema safety.");
    }
    if (/(docker|deploy|nginx|ci|workflow)/i.test(event.filePath)) {
      requiredVerification.add("Run build/deploy dry-run or config validation.");
    }
  }

  for (const command of input.commandEvents) {
    risk = maxRisk(risk, command.riskLevel, inferCommandRisk(command.command));
    if (command.exitCode !== undefined && command.exitCode !== 0) {
      reasons.add(`Command failed: ${command.command}`);
      risk = maxRisk(risk, "medium");
    }
  }

  for (const action of input.actions) {
    risk = maxRisk(risk, action.riskLevel);
    if (action.actionType === "privacy_warning") {
      reasons.add("Privacy warning occurred.");
      risk = maxRisk(risk, "high");
    }
    if (action.actionType === "scope_warning") {
      reasons.add("Scope warning occurred.");
      risk = maxRisk(risk, "high");
    }
  }

  const changedImportantFiles = input.fileEvents.some((event) => event.eventType !== "read" && (event.riskLevel === "high" || event.riskLevel === "critical"));
  const ranVerification = input.commandEvents.some((event) => /(test|vitest|jest|build|lint|typecheck|tsc)/i.test(event.command) && (event.exitCode ?? 0) === 0);
  if (changedImportantFiles && !ranVerification) {
    reasons.add("High-risk files changed without successful test/build/lint verification.");
    requiredVerification.add("Run tests/build/lint before marking task complete.");
    risk = maxRisk(risk, "high");
  }

  const rollbackRecommended = risk === "critical" || input.commandEvents.some((event) => inferCommandRisk(event.command) === "critical") || reasons.has("Privacy warning occurred.");
  return {
    riskLevel: risk,
    reasons: Array.from(reasons).map(redactText),
    requiredVerification: Array.from(requiredVerification).map(redactText),
    rollbackRecommended
  };
}

export async function analyzeCodexRiskWithFramework(input: {
  task: string;
  actions: CodexAction[];
  fileEvents: CodexFileEvent[];
  commandEvents: CodexCommandEvent[];
  decisions: CodexDecision[];
  frameworkContext: FrameworkDetectionResult;
  cwd?: string;
}): Promise<CodexRiskAnalysisResult> {
  const base = analyzeCodexRisk(input);
  const reasons = new Set(base.reasons);
  const requiredVerification = new Set(base.requiredVerification);
  let risk = base.riskLevel;
  const filesChanged = input.fileEvents.filter((event) => event.eventType !== "read").map((event) => event.filePath);
  const frameworkRisks = await getFrameworkRiskForFiles({
    framework: input.frameworkContext.primaryFramework,
    filesChanged,
    repoRoot: input.cwd
  });

  for (const frameworkRisk of frameworkRisks) {
    risk = maxRisk(risk, frameworkRisk.riskLevel as CodexRiskLevel);
    if (frameworkRisk.riskLevel === "high" || frameworkRisk.riskLevel === "critical") {
      reasons.add(`Framework risk zone matched: ${frameworkRisk.filePath} (${frameworkRisk.matchedZones.join(", ") || frameworkRisk.riskLevel}).`);
    }
  }

  const plan = await createFrameworkVerificationPlan({
    framework: input.frameworkContext.primaryFramework,
    task: input.task,
    filesChanged,
    riskLevel: risk,
    repoRoot: input.cwd
  });
  for (const check of plan.requiredChecks) {
    requiredVerification.add(check);
  }
  for (const command of plan.commands.slice(0, 4)) {
    requiredVerification.add(`Run framework check: ${command}`);
  }
  if (!plan.canMarkCompletedWithoutVerification && risk === "low") {
    risk = "medium";
  }

  return {
    riskLevel: risk,
    reasons: Array.from(reasons).map(redactText),
    requiredVerification: Array.from(requiredVerification).map(redactText),
    rollbackRecommended: base.rollbackRecommended || risk === "critical"
  };
}

export async function listCodexSessions(options: { cwd?: string; status?: CodexSessionStatus; limit?: number } = {}): Promise<CodexSession[]> {
  const db = await openInitialized(options.cwd ?? process.cwd());
  try {
    const rows = options.status
      ? db.prepare("SELECT * FROM codex_sessions WHERE status = ? ORDER BY started_at DESC LIMIT ?").all(options.status, options.limit ?? 50) as unknown as CodexSessionRow[]
      : db.prepare("SELECT * FROM codex_sessions ORDER BY started_at DESC LIMIT ?").all(options.limit ?? 50) as unknown as CodexSessionRow[];
    return rows.map(rowToSession);
  } finally {
    db.close();
  }
}

export async function getCodexSession(sessionId: string, options: { cwd?: string } = {}): Promise<CodexSession | undefined> {
  const db = await openInitialized(options.cwd ?? process.cwd());
  try {
    const row = db.prepare("SELECT * FROM codex_sessions WHERE id = ?").get(sessionId) as unknown as CodexSessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  } finally {
    db.close();
  }
}

export async function getCodexSessionDetail(sessionId: string, options: { cwd?: string } = {}): Promise<CodexSessionDetail> {
  const db = await openInitialized(options.cwd ?? process.cwd());
  try {
    const sessionRow = db.prepare("SELECT * FROM codex_sessions WHERE id = ?").get(sessionId) as unknown as CodexSessionRow | undefined;
    if (!sessionRow) {
      throw new Error(`Codex session not found: ${sessionId}`);
    }
    const session = rowToSession(sessionRow);
    const timeline = (db.prepare("SELECT * FROM codex_actions WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as unknown as CodexActionRow[]).map(rowToAction);
    const fileEvents = (db.prepare("SELECT * FROM codex_file_events WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as unknown as CodexFileEventRow[]).map(rowToFileEvent);
    const commandEvents = (db.prepare("SELECT * FROM codex_command_events WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as unknown as CodexCommandEventRow[]).map(rowToCommandEvent);
    const decisions = (db.prepare("SELECT * FROM codex_decisions WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as unknown as CodexDecisionRow[]).map(rowToDecision);
    const memoryUsage = (db.prepare("SELECT * FROM codex_memory_usage WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as unknown as CodexMemoryUsageRow[]).map(rowToMemoryUsage);
    const reflections = (db.prepare("SELECT * FROM codex_reflections WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as unknown as CodexReflectionRow[]).map(rowToReflection);
    return sanitizeSessionDetail({
      session,
      timeline,
      fileEvents,
      commandEvents,
      decisions,
      memoryUsage,
      reflections,
      riskAnalysis: analyzeCodexRisk({ task: session.task, actions: timeline, fileEvents, commandEvents, decisions })
    });
  } finally {
    db.close();
  }
}

export async function getCodexActionStats(options: { cwd?: string; now?: Date } = {}): Promise<CodexActionStats> {
  const db = await openInitialized(options.cwd ?? process.cwd());
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);
  try {
    const sessions = (db.prepare("SELECT * FROM codex_sessions").all() as unknown as CodexSessionRow[]).map(rowToSession);
    const actions = (db.prepare("SELECT * FROM codex_actions").all() as unknown as CodexActionRow[]).map(rowToAction);
    const fileEvents = (db.prepare("SELECT * FROM codex_file_events").all() as unknown as CodexFileEventRow[]).map(rowToFileEvent);
    const commandEvents = (db.prepare("SELECT * FROM codex_command_events").all() as unknown as CodexCommandEventRow[]).map(rowToCommandEvent);
    const reflections = (db.prepare("SELECT * FROM codex_reflections").all() as unknown as CodexReflectionRow[]).map(rowToReflection);
    const sessionsByStatus = emptyStatusCounts();
    const riskDistribution = emptyRiskCounts();
    for (const session of sessions) {
      sessionsByStatus[session.status] += 1;
      riskDistribution[session.riskLevel] += 1;
    }
    const sessionsWithSuccessfulVerification = new Set(commandEvents.filter((event) => /(test|build|lint|tsc|vitest|jest)/i.test(event.command) && (event.exitCode ?? 0) === 0).map((event) => event.sessionId));
    return {
      activeSessions: sessions.filter((session) => session.status === "running").length,
      completedSessions: sessions.filter((session) => session.status === "completed").length,
      failedSessions: sessions.filter((session) => session.status === "failed").length,
      highRiskSessions: sessions.filter((session) => session.riskLevel === "high" || session.riskLevel === "critical").length,
      filesModifiedToday: fileEvents.filter((event) => event.createdAt.startsWith(today) && event.eventType !== "read").length,
      commandsRunToday: commandEvents.filter((event) => event.createdAt.startsWith(today)).length,
      privacyWarnings: actions.filter((action) => action.actionType === "privacy_warning").length,
      scopeWarnings: actions.filter((action) => action.actionType === "scope_warning").length,
      sessionsWithoutTests: sessions.filter((session) => session.status !== "running" && !sessionsWithSuccessfulVerification.has(session.id)).length,
      reflectionsSaved: reflections.length,
      sessionsByStatus,
      riskDistribution
    };
  } finally {
    db.close();
  }
}

export async function getCodexReplay(sessionId: string, options: { cwd?: string } = {}): Promise<Array<{ index: number; action: CodexAction; fileEvents: CodexFileEvent[]; commandEvents: CodexCommandEvent[]; decisions: CodexDecision[]; memoryUsage: CodexMemoryUsage[] }>> {
  const detail = await getCodexSessionDetail(sessionId, options);
  return detail.timeline.map((action, index) => ({
    index,
    action,
    fileEvents: detail.fileEvents.filter((event) => event.createdAt <= action.createdAt),
    commandEvents: detail.commandEvents.filter((event) => event.createdAt <= action.createdAt),
    decisions: detail.decisions.filter((decision) => decision.createdAt <= action.createdAt),
    memoryUsage: detail.memoryUsage.filter((usage) => usage.createdAt <= action.createdAt)
  }));
}

export async function getCodexLiveView(options: { cwd?: string } = {}): Promise<CodexSessionDetail[]> {
  const running = await listCodexSessions({ cwd: options.cwd, status: "running", limit: 10 });
  return Promise.all(running.map((session) => getCodexSessionDetail(session.id, options)));
}

export async function listCodexRiskItems(options: { cwd?: string; limit?: number } = {}): Promise<Array<{ sessionId: string; task: string; riskLevel: CodexRiskLevel; reasons: string[]; rollbackRecommended: boolean }>> {
  const sessions = await listCodexSessions({ cwd: options.cwd, limit: options.limit ?? 50 });
  const items = [];
  for (const session of sessions) {
    const detail = await getCodexSessionDetail(session.id, { cwd: options.cwd });
    if (detail.riskAnalysis.riskLevel === "high" || detail.riskAnalysis.riskLevel === "critical" || detail.riskAnalysis.rollbackRecommended) {
      items.push({
        sessionId: session.id,
        task: session.task,
        riskLevel: detail.riskAnalysis.riskLevel,
        reasons: detail.riskAnalysis.reasons,
        rollbackRecommended: detail.riskAnalysis.rollbackRecommended
      });
    }
  }
  return items;
}

export function renderCodexActionDashboardHtml(input: { stats: CodexActionStats; sessions: CodexSession[] }): string {
  const cards = [
    ["Active Codex Sessions", input.stats.activeSessions],
    ["Completed Sessions", input.stats.completedSessions],
    ["Failed Sessions", input.stats.failedSessions],
    ["High-risk Sessions", input.stats.highRiskSessions],
    ["Files Modified Today", input.stats.filesModifiedToday],
    ["Commands Run Today", input.stats.commandsRunToday],
    ["Privacy Warnings", input.stats.privacyWarnings],
    ["Scope Warnings", input.stats.scopeWarnings],
    ["Sessions Without Tests", input.stats.sessionsWithoutTests],
    ["Reflections Saved", input.stats.reflectionsSaved]
  ];
  return htmlPage(
    "LMTI Codex Action View",
    [
      `<section class="grid">${cards.map(([label, value]) => `<article><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(String(label))}</span></article>`).join("")}</section>`,
      `<h2>Recent Sessions</h2>`,
      table(["Task", "Status", "Risk", "Scope", "Privacy"], input.sessions.map((session) => [session.task, session.status, session.riskLevel, session.scopeStatus, session.privacyStatus]))
    ].join("\n")
  );
}

export function renderCodexSessionDetailHtml(detail: CodexSessionDetail): string {
  return htmlPage(
    `Codex Session ${detail.session.id}`,
    [
      `<h2>Summary</h2>`,
      table(["Task", "Status", "Risk", "Scope", "Privacy"], [[detail.session.task, detail.session.status, detail.session.riskLevel, detail.session.scopeStatus, detail.session.privacyStatus]]),
      `<h2>Timeline</h2>`,
      table(["Time", "Type", "Title", "Risk"], detail.timeline.map((action) => [action.createdAt, action.actionType, action.title, action.riskLevel])),
      `<h2>Files</h2>`,
      table(["Path", "Event", "Diff", "Risk"], detail.fileEvents.map((event) => [event.filePath, event.eventType, event.diffSummary ?? "", event.riskLevel])),
      `<h2>Commands</h2>`,
      table(["Command", "Exit", "Output", "Risk"], detail.commandEvents.map((event) => [event.command, String(event.exitCode ?? ""), event.outputSummary ?? event.errorSummary ?? "", event.riskLevel])),
      `<h2>Decisions</h2>`,
      table(["Decision", "Reason", "Risk"], detail.decisions.map((decision) => [decision.decision, decision.reason ?? "", decision.riskLevel])),
      `<h2>Memory Used</h2>`,
      table(["Memory", "Type", "Reason", "Used"], detail.memoryUsage.map((usage) => [usage.memoryId, usage.memoryType, usage.reason ?? "", String(usage.usedInDecision)])),
      `<h2>Risks</h2>`,
      `<pre>${escapeHtml(JSON.stringify(detail.riskAnalysis, null, 2))}</pre>`,
      `<h2>Reflection</h2>`,
      table(["Summary", "Lessons", "Remaining Risks"], detail.reflections.map((reflection) => [reflection.taskSummary ?? "", reflection.lessonsCreated.join(", "), reflection.risksRemaining.join(", ")])),
      `<h2>Raw JSON</h2>`,
      `<pre>${escapeHtml(JSON.stringify(detail, null, 2))}</pre>`
    ].join("\n")
  );
}

export function renderCodexReplayHtml(input: { session: CodexSession; replay: Awaited<ReturnType<typeof getCodexReplay>> }): string {
  return htmlPage(
    "LMTI Codex Replay",
    [
      `<p><strong>Session:</strong> ${escapeHtml(input.session.id)}</p>`,
      `<h2>${escapeHtml(input.session.task)}</h2>`,
      table(["Step", "Time", "Action", "Title", "Risk"], input.replay.map((step) => [String(step.index + 1), step.action.createdAt, step.action.actionType, step.action.title, step.action.riskLevel]))
    ].join("\n")
  );
}

function applyCodexActionSchema(db: DatabaseSync): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS codex_action_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS codex_sessions (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      intent TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      risk_level TEXT DEFAULT 'medium',
      scope_status TEXT DEFAULT 'unknown',
      privacy_status TEXT DEFAULT 'unknown',
      branch TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS codex_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      file_path TEXT,
      command TEXT,
      status TEXT DEFAULT 'ok',
      risk_level TEXT DEFAULT 'low',
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES codex_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS codex_file_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      event_type TEXT NOT NULL,
      before_hash TEXT,
      after_hash TEXT,
      diff_summary TEXT,
      lines_added INTEGER DEFAULT 0,
      lines_removed INTEGER DEFAULT 0,
      risk_level TEXT DEFAULT 'low',
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES codex_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS codex_command_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT,
      exit_code INTEGER,
      duration_ms INTEGER,
      output_summary TEXT,
      error_summary TEXT,
      risk_level TEXT DEFAULT 'low',
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES codex_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS codex_decisions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      alternatives TEXT,
      related_files TEXT,
      related_memory_ids TEXT,
      confidence REAL DEFAULT 0.5,
      risk_level TEXT DEFAULT 'medium',
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES codex_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS codex_memory_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      role TEXT,
      reason TEXT,
      used_in_decision INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES codex_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS codex_reflections (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_summary TEXT,
      files_changed TEXT,
      tests_run TEXT,
      bugs_found TEXT,
      lessons_created TEXT,
      short_notes_created TEXT,
      long_memories_created TEXT,
      risks_remaining TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES codex_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_codex_sessions_status ON codex_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_codex_sessions_risk ON codex_sessions(risk_level);
    CREATE INDEX IF NOT EXISTS idx_codex_actions_session ON codex_actions(session_id);
    CREATE INDEX IF NOT EXISTS idx_codex_file_events_session ON codex_file_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_codex_command_events_session ON codex_command_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_codex_decisions_session ON codex_decisions(session_id);
    CREATE INDEX IF NOT EXISTS idx_codex_memory_usage_session ON codex_memory_usage(session_id);
  `);
  db.prepare("INSERT OR IGNORE INTO codex_action_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(
    1,
    "codex_action_view_initial_schema",
    new Date().toISOString()
  );
}

function insertAction(db: DatabaseSync, input: {
  sessionId: string;
  actionType: CodexActionType;
  title: string;
  detail?: string;
  filePath?: string;
  command?: string;
  status: CodexActionStatus;
  riskLevel: CodexRiskLevel;
  now: string;
}): CodexAction {
  const action: CodexAction = {
    id: randomUUID(),
    sessionId: input.sessionId,
    actionType: input.actionType,
    title: safeText(input.title, 500),
    detail: input.detail ? safeText(input.detail, 1600) : undefined,
    filePath: input.filePath ? safePath(input.filePath) : undefined,
    command: input.command ? safeCommand(input.command) : undefined,
    status: input.status,
    riskLevel: input.riskLevel,
    createdAt: input.now
  };
  db.prepare(`
    INSERT INTO codex_actions(id, session_id, action_type, title, detail, file_path, command, status, risk_level, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    action.id,
    action.sessionId,
    action.actionType,
    action.title,
    action.detail ?? null,
    action.filePath ?? null,
    action.command ?? null,
    action.status,
    action.riskLevel,
    action.createdAt
  );
  return action;
}

async function openInitialized(cwd: string): Promise<DatabaseSync> {
  const dbPath = (await initCodexActionViewStorage(cwd)).dbPath;
  return openCodexActionDatabase(dbPath);
}

async function ensureCodexActionDbPath(cwd: string): Promise<string> {
  const actionDir = path.resolve(cwd, ".lmti", "actions");
  await fs.mkdir(actionDir, { recursive: true });
  return path.join(actionDir, CODEX_ACTION_DB_FILE);
}

async function openCodexActionDatabase(dbPath: string): Promise<DatabaseSync> {
  try {
    const sqlite = await import("node:sqlite");
    return new sqlite.DatabaseSync(dbPath);
  } catch (error) {
    throw new Error(`Codex Action View requires Node.js with node:sqlite support: ${(error as Error).message}`);
  }
}

function rowToSession(row: CodexSessionRow): CodexSession {
  return {
    id: row.id,
    task: row.task,
    intent: row.intent ?? undefined,
    status: isSessionStatus(row.status) ? row.status : "needs_review",
    riskLevel: isRiskLevel(row.risk_level ?? "") ? row.risk_level as CodexRiskLevel : "medium",
    scopeStatus: isScopeStatus(row.scope_status ?? "") ? row.scope_status as CodexScopeStatus : "unknown",
    privacyStatus: isPrivacyStatus(row.privacy_status ?? "") ? row.privacy_status as CodexPrivacyStatus : "unknown",
    branch: row.branch ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    summary: row.summary ?? undefined
  };
}

function rowToAction(row: CodexActionRow): CodexAction {
  return {
    id: row.id,
    sessionId: row.session_id,
    actionType: isActionType(row.action_type) ? row.action_type : "error_detected",
    title: row.title,
    detail: row.detail ?? undefined,
    filePath: row.file_path ?? undefined,
    command: row.command ?? undefined,
    status: isActionStatus(row.status ?? "") ? row.status as CodexActionStatus : "ok",
    riskLevel: isRiskLevel(row.risk_level ?? "") ? row.risk_level as CodexRiskLevel : "low",
    createdAt: row.created_at
  };
}

function rowToFileEvent(row: CodexFileEventRow): CodexFileEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    filePath: row.file_path,
    eventType: isFileEventType(row.event_type) ? row.event_type : "modified",
    beforeHash: row.before_hash ?? undefined,
    afterHash: row.after_hash ?? undefined,
    diffSummary: row.diff_summary ?? undefined,
    linesAdded: Number(row.lines_added ?? 0),
    linesRemoved: Number(row.lines_removed ?? 0),
    riskLevel: isRiskLevel(row.risk_level ?? "") ? row.risk_level as CodexRiskLevel : "low",
    createdAt: row.created_at
  };
}

function rowToCommandEvent(row: CodexCommandEventRow): CodexCommandEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    command: row.command,
    cwd: row.cwd ?? undefined,
    exitCode: row.exit_code ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    outputSummary: row.output_summary ?? undefined,
    errorSummary: row.error_summary ?? undefined,
    riskLevel: isRiskLevel(row.risk_level ?? "") ? row.risk_level as CodexRiskLevel : "low",
    createdAt: row.created_at
  };
}

function rowToDecision(row: CodexDecisionRow): CodexDecision {
  return {
    id: row.id,
    sessionId: row.session_id,
    decision: row.decision,
    reason: row.reason ?? undefined,
    alternatives: safeJsonArray(row.alternatives),
    relatedFiles: safeJsonArray(row.related_files),
    relatedMemoryIds: safeJsonArray(row.related_memory_ids),
    confidence: Number(row.confidence ?? 0.5),
    riskLevel: isRiskLevel(row.risk_level ?? "") ? row.risk_level as CodexRiskLevel : "medium",
    createdAt: row.created_at
  };
}

function rowToMemoryUsage(row: CodexMemoryUsageRow): CodexMemoryUsage {
  return {
    id: row.id,
    sessionId: row.session_id,
    memoryId: row.memory_id,
    memoryType: isMemoryUsageType(row.memory_type) ? row.memory_type : "long",
    role: row.role ?? undefined,
    reason: row.reason ?? undefined,
    usedInDecision: Number(row.used_in_decision ?? 0) === 1,
    createdAt: row.created_at
  };
}

function rowToReflection(row: CodexReflectionRow): CodexReflection {
  return {
    id: row.id,
    sessionId: row.session_id,
    taskSummary: row.task_summary ?? undefined,
    filesChanged: safeJsonArray(row.files_changed),
    testsRun: safeJsonArray(row.tests_run),
    bugsFound: safeJsonArray(row.bugs_found),
    lessonsCreated: safeJsonArray(row.lessons_created),
    shortNotesCreated: safeJsonArray(row.short_notes_created),
    longMemoriesCreated: safeJsonArray(row.long_memories_created),
    risksRemaining: safeJsonArray(row.risks_remaining),
    createdAt: row.created_at
  };
}

function sanitizeSessionDetail(detail: CodexSessionDetail): CodexSessionDetail {
  return {
    session: {
      ...detail.session,
      task: safeText(detail.session.task, 1000),
      summary: detail.session.summary ? safeText(detail.session.summary, 1600) : undefined
    },
    timeline: detail.timeline.map((action) => ({
      ...action,
      title: safeText(action.title, 500),
      detail: action.detail ? safeText(action.detail, 1600) : undefined,
      command: action.command ? safeCommand(action.command) : undefined
    })),
    fileEvents: detail.fileEvents.map((event) => ({
      ...event,
      filePath: safePath(event.filePath),
      diffSummary: event.diffSummary ? safeText(event.diffSummary, 1600) : undefined
    })),
    commandEvents: detail.commandEvents.map((event) => ({
      ...event,
      command: safeCommand(event.command),
      outputSummary: event.outputSummary ? safeText(event.outputSummary, MAX_SUMMARY_CHARS) : undefined,
      errorSummary: event.errorSummary ? safeText(event.errorSummary, MAX_SUMMARY_CHARS) : undefined
    })),
    decisions: detail.decisions.map((decision) => ({
      ...decision,
      decision: safeText(decision.decision, 1200),
      reason: decision.reason ? safeText(decision.reason, 1800) : undefined,
      alternatives: decision.alternatives.map((entry) => safeText(entry, 500))
    })),
    memoryUsage: detail.memoryUsage.map((usage) => ({
      ...usage,
      memoryId: safeText(usage.memoryId, 240),
      reason: usage.reason ? safeText(usage.reason, 800) : undefined
    })),
    reflections: detail.reflections.map((reflection) => ({
      ...reflection,
      taskSummary: reflection.taskSummary ? safeText(reflection.taskSummary, 1600) : undefined,
      risksRemaining: reflection.risksRemaining.map((entry) => safeText(entry, 500))
    })),
    riskAnalysis: {
      ...detail.riskAnalysis,
      reasons: detail.riskAnalysis.reasons.map((entry) => safeText(entry, 500)),
      requiredVerification: detail.riskAnalysis.requiredVerification.map((entry) => safeText(entry, 500))
    }
  };
}

function inferActionRisk(type: CodexActionType, filePath?: string, command?: string, detail?: string): CodexRiskLevel {
  return maxRisk(
    type === "privacy_warning" || type === "risk_warning" || type === "rollback_suggested" ? "high" : type === "scope_warning" || type === "error_detected" ? "medium" : "low",
    filePath ? inferFileRisk(filePath) : "low",
    command ? inferCommandRisk(command) : "low",
    detail && hasSecretLike(detail) ? "high" : "low"
  );
}

function inferFileRisk(filePath: string): CodexRiskLevel {
  const normalized = normalizeText(filePath);
  if (/(^|[/\\])\.env($|\.|[/\\])|private[_-]?key|secret|credential/i.test(normalized)) {
    return "critical";
  }
  if (/(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|dockerfile|docker-compose|nginx|migration|auth|permission|payment|credit|production|\.github[/\\]workflows|ci|cd|schema|prisma)/i.test(normalized)) {
    return "high";
  }
  if (/(package\.json|config|middleware|database)/i.test(normalized)) {
    return "medium";
  }
  return "low";
}

function inferCommandRisk(command: string): CodexRiskLevel {
  const normalized = normalizeText(command);
  if (/(rm\s+-rf|git\s+reset\s+--hard|git\s+clean\s+-fd|docker\s+system\s+prune|drop\s+database|truncate\s+|chmod\s+777|curl\b.*\|\s*sh|wget\b.*\|\s*sh|ssh\b.*production|deploy\s+production)/i.test(normalized)) {
    return "critical";
  }
  if (/(npm\s+publish|delete\s+from|kubectl|terraform\s+apply|scp\b|ssh\b|docker\s+compose\s+down)/i.test(normalized)) {
    return "high";
  }
  if (/(npm\s+install|pnpm\s+install|migration|migrate|deploy|docker|build)/i.test(normalized)) {
    return "medium";
  }
  return "low";
}

function fileActionType(eventType: CodexFileEventType): CodexActionType {
  switch (eventType) {
    case "read":
      return "file_read";
    case "created":
      return "file_created";
    case "deleted":
      return "file_deleted";
    case "renamed":
      return "file_renamed";
    case "modified":
    default:
      return "file_modified";
  }
}

function commandActionType(command: string): CodexActionType {
  if (/\b(test|vitest|jest)\b/i.test(command)) {
    return "test_run";
  }
  if (/\b(build|tsc)\b/i.test(command)) {
    return "build_run";
  }
  if (/\b(lint|eslint)\b/i.test(command)) {
    return "lint_run";
  }
  return "command_run";
}

function summarizeDiff(beforeContent?: string, afterContent?: string, fallback?: string): string | undefined {
  if (fallback) {
    return safeText(fallback, 1600);
  }
  if (beforeContent === undefined && afterContent === undefined) {
    return undefined;
  }
  const added = countLinesAdded(beforeContent, afterContent);
  const removed = countLinesRemoved(beforeContent, afterContent);
  return safeText(`Changed ${added} line(s) added, ${removed} line(s) removed. Raw diff intentionally not stored.`, 400);
}

function countLinesAdded(beforeContent?: string, afterContent?: string): number {
  if (afterContent === undefined) {
    return 0;
  }
  const before = new Set((beforeContent ?? "").split(/\r?\n/));
  return afterContent.split(/\r?\n/).filter((line) => line && !before.has(line)).length;
}

function countLinesRemoved(beforeContent?: string, afterContent?: string): number {
  if (beforeContent === undefined) {
    return 0;
  }
  const after = new Set((afterContent ?? "").split(/\r?\n/));
  return beforeContent.split(/\r?\n/).filter((line) => line && !after.has(line)).length;
}

function summarizeCommandOutput(output?: string): string | undefined {
  if (!output) {
    return undefined;
  }
  return safeText(output.replace(/\s+/g, " ").trim(), MAX_SUMMARY_CHARS);
}

function safeText(value: string, maxLength: number): string {
  const redacted = redactText(value);
  const scan = runEgressSecretScan(redacted);
  const safe = scan.blocked ? redactText(redacted) : redacted;
  return safe.length <= maxLength ? safe : `${safe.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function safePath(value: string): string {
  return safeText(value.replace(/\\/g, "/"), 500);
}

function safeCommand(value: string): string {
  return safeText(value, 800);
}

function sanitizeArray(values: string[]): string[] {
  return values.map((value) => safeText(value, 800)).filter(Boolean).slice(0, 50);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hasSecretLike(value: string): boolean {
  return runEgressSecretScan(value).blocked || redactText(value) !== value;
}

function maxRisk(...levels: CodexRiskLevel[]): CodexRiskLevel {
  const order: Record<CodexRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  return levels.reduce((max, level) => order[level] > order[max] ? level : max, "low" as CodexRiskLevel);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function safeJsonArray(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((entry) => safeText(String(entry), 800)) : [];
  } catch {
    return [];
  }
}

function emptyStatusCounts(): Record<CodexSessionStatus, number> {
  return {
    running: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    rolled_back: 0,
    needs_review: 0
  };
}

function emptyRiskCounts(): Record<CodexRiskLevel, number> {
  return {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  };
}

function htmlPage(title: string, body: string): string {
  return [
    "<!doctype html>",
    "<html><head>",
    `<meta charset="utf-8"><title>${escapeHtml(title)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;margin:24px;color:#17202a} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px} article{border:1px solid #ddd;border-radius:8px;padding:12px} article strong{display:block;font-size:24px} table{border-collapse:collapse;width:100%;margin:12px 0} th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top} th{background:#f6f8fa} pre{background:#f6f8fa;padding:12px;overflow:auto}</style>",
    "</head><body>",
    `<h1>${escapeHtml(title)}</h1>`,
    body,
    "</body></html>"
  ].join("\n");
}

function table(headers: string[], rows: string[][]): string {
  return [
    "<table>",
    `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`,
    "</table>"
  ].join("");
}

function escapeHtml(value: string): string {
  return redactText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSessionStatus(value: string): value is CodexSessionStatus {
  return ["running", "completed", "failed", "blocked", "rolled_back", "needs_review"].includes(value);
}

function isRiskLevel(value: string): value is CodexRiskLevel {
  return ["low", "medium", "high", "critical"].includes(value);
}

function isScopeStatus(value: string): value is CodexScopeStatus {
  return ["inside_scope", "borderline", "outside_scope", "unknown"].includes(value);
}

function isPrivacyStatus(value: string): value is CodexPrivacyStatus {
  return ["safe", "warning", "blocked", "unknown"].includes(value);
}

function isActionStatus(value: string): value is CodexActionStatus {
  return ["ok", "failed", "blocked", "warning"].includes(value);
}

function isActionType(value: string): value is CodexActionType {
  return [
    "task_received",
    "intent_detected",
    "memory_context_loaded",
    "file_read",
    "file_modified",
    "file_created",
    "file_deleted",
    "file_renamed",
    "command_run",
    "test_run",
    "build_run",
    "lint_run",
    "error_detected",
    "decision_made",
    "scope_warning",
    "privacy_warning",
    "risk_warning",
    "rollback_suggested",
    "task_completed",
    "reflection_saved"
  ].includes(value);
}

function isFileEventType(value: string): value is CodexFileEventType {
  return ["read", "modified", "created", "deleted", "renamed"].includes(value);
}

function isMemoryUsageType(value: string): value is CodexMemoryUsageType {
  return ["short", "long", "guardrail", "task_hint"].includes(value);
}
