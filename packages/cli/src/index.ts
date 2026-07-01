#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { compileProject } from "@atlas/compiler";
import { contextPackToCognitiveItems, runCognitiveCycle } from "@atlas/cognition";
import {
  createFrameworkVerificationPlan,
  createMonorepoMap,
  detectFramework,
  ensureFrameworkConfig,
  formatFrameworkDetection,
  getFrameworkAdapter,
  listFrameworkAdapters,
  renderFrameworkCommandsHtml,
  renderFrameworkDetectionHtml,
  renderFrameworkRiskZonesHtml,
  renderFrameworkVerificationHtml,
  renderMonorepoMapHtml
} from "@atlas/frameworks";
import { contextPackToBeliefs, contextPackToSensoryInputs, estimateComputeCost, runWorldModelCycle } from "@atlas/world-model";
import {
  addProjectMemory,
  approveLessonCandidate,
  checkMemoryPrivacy,
  checkProjectMemoryPrivacy,
  classifyLibraryMemory,
  cleanupShortMemoryNotes,
  consolidateMemory,
  createMemory,
  createDefaultLmtiConfig,
  createShortMemoryNote,
  deleteProjectMemory,
  deleteMemory,
  decayMemoryLifecycle,
  evaluateShortMemoryForPromotion,
  explainMemory,
  expireShortMemoryNotes,
  getLessonCandidate,
  getLessonCandidateReviewSummary,
  getMemoryAssociations,
  getProjectMemoryStats,
  initProjectMemoryStorage,
  initAtlasStorage,
  listLessonCandidates,
  listMemory,
  EXPERIMENTS_DIR,
  type InitResult,
  type LibraryPrivacyLevel,
  type LibraryZone,
  type LmtiConfig,
  type ShortMemoryPriority,
  migrateJsonMemoryToProjectMemory,
  promoteMemory,
  promoteShortMemoryToLongMemory,
  proposeLessonCandidate,
  recordTaskDone,
  rejectLessonCandidate,
  retrieveMemoryContextForTask,
  reinforceMemory,
  retrieveMemoryForTask,
  retrieveShortMemoryForTask,
  reviewMemory,
  readAmfDocument,
  fetchAllowedMemoryContent,
  retrieveMemoryMetadata,
  searchMemory,
  searchMemoryForContext,
  searchProjectMemory,
  writeAmfDocument
} from "@atlas/memory";
import { buildContextPack, formatInspection, inferIntent, inspectAmf } from "@atlas/kernel";
import {
  canonicalStoragePaths,
  detectLegacyAtlasStorage,
  doctorLmti,
  formatDoctorReport,
  formatMigrationResult,
  type DoctorSeverity,
  migrateAtlasToLmti,
  type DoctorReport,
  type MigrationResult
} from "@atlas/migration";
import {
  endCodexSession,
  getCodexActionStats,
  getCodexReplay,
  getCodexSession,
  getCodexSessionDetail,
  listCodexRiskItems,
  listCodexSessions,
  logCodexAction,
  logCodexCommandEvent,
  logCodexDecision,
  logCodexFileEvent,
  logCodexMemoryUsage,
  logCodexReflection,
  prepareCodexContext,
  reflectAfterTask,
  renderCodexReplayHtml,
  renderCodexSessionDetailHtml,
  startCodexSession,
  type CodexActionType,
  type CodexFileEventType,
  type CodexMemoryUsageType,
  type CodexSessionStatus
} from "@atlas/runtime";
import {
  appendAuditEvent,
  createPrivacyContext,
  deriveEffectiveContextRole,
  hardGateMemoryMetadata,
  inferSinkRole,
  readAuditEvents,
  redactText,
  retainAuditEvents,
  runEgressSecretScan,
  verifyAuditIntegrity
} from "@atlas/privacy";
import type {
  AccessRole,
  AdapterManifest,
  AdapterPrivacyProfile,
  AdapterSandboxResult,
  AmfDocument,
  BlockedMemory,
  CommandRunSummary,
  ContextCandidate,
  ContextPackage,
  ContextRequest,
  DecisionSummary,
  ErrorSummary,
  FileEntry,
  FileTouchSummary,
  InferredIntent,
  LessonApprovalStatus,
  LessonCandidateType,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemorySearchResult,
  MemorySensitivity,
  ModuleEntry,
  NewMemoryRecord,
  ObserverFrame,
  PolicySafeMemoryResult,
  PreflightResult,
  PromptPolicy,
  SourceRef,
  TestRunSummary,
  TaskObservationPrivacyStatus,
  TaskOutcome
} from "@atlas/types";

const DEFAULT_PREFLIGHT_ADAPTER_MANIFEST: AdapterManifest = {
  id: "codex-local-preflight",
  name: "Codex Local Preflight Adapter",
  version: "0.1.0",
  kind: "model",
  scopes: ["context:read"],
  privacy: {
    allowRawSecret: false,
    allowRawConfidential: false,
    requiresEgressScan: true,
    defaultModelTarget: "external_model"
  },
  sandbox: {
    network: false,
    filesystem: "none",
    allowMemoryStore: false,
    timeoutMs: 30_000
  }
};

const DEFAULT_ADAPTER_PRIVACY_PROFILE: AdapterPrivacyProfile = {
  allowRawSecret: false,
  allowRawConfidential: false,
  requiresEgressScan: true,
  defaultModelTarget: "external_model"
};

const KNOWN_ADAPTERS = new Set(["codex", "claude-code", "cursor", "aider", "continue", "mcp", "openai-agents", "langchain", "crewai", "autogen", "generic", "custom"]);

const DEFAULT_PUBLISH_TARGET_BRANCH = "main";
const DEFAULT_PUBLISH_ALLOWED_BRANCHES = ["main", "release/*", "publish/*", "publish-*"];
const DEFAULT_PRIVATE_REPO_PATTERNS = ["/atlas", "private", "internal"];
const DEFAULT_PROTECTED_PUBLISH_PATHS = [
  ".env",
  ".env.*",
  ".lmti/memory/*.sqlite",
  ".lmti/private/**",
  "**/secrets/**",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx"
];

type PublishPreflightStatus = "pass" | "warn" | "error";
type PublishPreflightResultState = "pass" | "warning" | "blocked";

export interface PublishPreflightCheck {
  name: string;
  title: string;
  status: PublishPreflightStatus;
  message: string;
  fix?: string;
}

export interface PublishPreflightResult {
  command: "lmti publish preflight";
  result: PublishPreflightResultState;
  exitCode: 0 | 1 | 2;
  targetRepo?: string;
  currentOrigin?: string;
  currentBranch?: string;
  targetBranch: string;
  checks: PublishPreflightCheck[];
  next: string;
  configSources: string[];
}

interface CliBoundaryMessage {
  code: string;
  message: string;
  suggestion?: string;
}

type CliStatus = "pass" | "warn" | "blocked" | "error";
type CliExitCode = 0 | 1 | 2 | 3 | 4 | 5;

interface CliJsonEnvelope {
  schemaVersion: "lmti.cli.v1";
  command: string;
  status: CliStatus;
  warnings: CliBoundaryMessage[];
  errors: CliBoundaryMessage[];
  data: unknown;
}

interface LmtiSkillDefinition {
  id: string;
  name: string;
  description: string;
  file: string;
  intents: string[];
  requiresPolicy: boolean;
  requiresMemory: boolean;
  riskLevel: "low" | "medium" | "high" | string;
}

interface LmtiSkillRouteOutcome {
  status: CliStatus;
  warnings: CliBoundaryMessage[];
  errors: CliBoundaryMessage[];
  result: {
    request: string;
    intent: string;
    decision: "skill_selected" | "multiple_candidates" | "no_skill_found" | "invalid_registry";
    selectedSkill?: {
      id: string;
      name: string;
      file: string;
      riskLevel: string;
    };
    candidates: Array<{
      id: string;
      score: number;
      intent: string;
      riskLevel: string;
      reason: string;
    }>;
    secondarySkills: Array<{ id: string; reason: string }>;
    requiresPolicy: boolean;
    requiresMemory: boolean;
    requiredPolicyGates: string[];
    recommendedCommands: string[];
    memoryRequest?: {
      intent: string;
      privacyMax: "public" | "internal";
      includeLessons: boolean;
      includeRelatedFiles: boolean;
    };
    reason: string;
  };
}

class CliUsageError extends Error {
  readonly exitCode = 4 as const;
}

interface PublishPreflightOptions {
  target?: string;
  strict?: boolean;
  publicRepo?: string;
}

interface PublishPreflightConfig {
  publicRepo?: string;
  privateRepoPatterns: string[];
  targetBranch: string;
  allowedPublishBranches: string[];
  protectedPaths: string[];
  sources: string[];
}

export interface CliMainOptions {
  cwd?: string;
}

export async function main(argv: string[], options: CliMainOptions = {}): Promise<void> {
  const [command, ...args] = argv;
  const cwd = options.cwd ?? process.cwd();

  switch (command) {
    case "init":
      await runInit(args);
      return;
    case "check":
      await runDoctor(args);
      return;
    case "route":
      await runSkill(["route", ...args], cwd);
      return;
    case "compile":
      await runCompile(args);
      return;
    case "migrate":
      await runMigrate(args);
      return;
    case "doctor":
      await runDoctor(args);
      return;
    case "inspect":
      await runInspect(args);
      return;
    case "context":
      await runContext(args);
      return;
    case "preflight":
      await runPreflight(args, cwd);
      return;
    case "publish":
      await runPublish(args, cwd);
      return;
    case "skill":
      await runSkill(args, cwd);
      return;
    case "thoth":
      await runThoth(args, cwd);
      return;
    case "policy":
      await runPolicy(args, cwd);
      return;
    case "config":
      await runConfig(args, cwd);
      return;
    case "agent":
      await runAgent(args, cwd);
      return;
    case "cleanup":
      await runCleanup(args, cwd);
      return;
    case "attach":
      await runAttach(args);
      return;
    case "experiment":
      await runExperiment(args);
      return;
    case "memory":
      await runMemory(args);
      return;
    case "mind":
      await runMind(args);
      return;
    case "framework":
      await runFramework(args);
      return;
    case "actions":
      await runActions(args, cwd);
      return;
    case "cognition":
      await runCognition(args);
      return;
    case "world":
      await runWorld(args);
      return;
    case "remember":
      await runRemember(args);
      return;
    case "task":
      await runTask(args);
      return;
    case "privacy":
      await runPrivacy(args);
      return;
    case "benchmark":
      await runBenchmark(args);
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      process.exitCode = 4;
      throw new CliUsageError(`Unknown command: ${command}`);
  }
}

async function runInit(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const storage = await initCommand(process.cwd(), { yes: Boolean(flags.yes) });
  printWarnings(storage.warnings);

  if (storage.skippedDueToLegacy) {
    console.log("Legacy Atlas storage detected.");
    console.log("No .lmti directory was created to avoid duplicate active mind files.");
    console.log("Run `lmti migrate --yes` or `lmti init --yes` to copy legacy state into .lmti.");
    return;
  }

  console.log("LMTI initialized.");
  console.log(`Storage: ${storage.atlasDir}`);
  console.log(`Config: ${storage.configPath}`);
  console.log(`AMF: ${storage.amfPath}`);
  console.log(`Index: ${storage.indexPath}`);
  if (storage.migration?.reportPath) {
    console.log(`Migration report: ${storage.migration.reportPath}`);
  }
}

export interface InitCommandOptions {
  yes?: boolean;
}

export type InitCommandResult = InitResult & {
  warnings: string[];
  skippedDueToLegacy?: boolean;
  migration?: MigrationResult;
};

export async function initCommand(cwd: string, options: InitCommandOptions = {}): Promise<InitCommandResult> {
  const scan = await detectLegacyAtlasStorage(cwd);
  const warnings: string[] = [];

  if (scan.hasLegacy && !scan.canonical.dirExists) {
    if (!options.yes) {
      warnings.push("Legacy Atlas storage exists. Use `lmti init --yes` or `lmti migrate --yes` to migrate it into .lmti.");
      const paths = canonicalStoragePaths(cwd);
      return {
        ...paths,
        eventsDir: path.join(paths.atlasDir, "events"),
        warnings,
        skippedDueToLegacy: true
      };
    }

    const migration = await migrateAtlasToLmti(cwd);
    const storage = await initAtlasStorage(cwd);
    return {
      ...storage,
      warnings: migration.warnings,
      migration
    };
  }

  if (scan.hasLegacy && scan.canonical.dirExists) {
    warnings.push("Legacy Atlas storage detected; .lmti remains the canonical active storage. Legacy files were not deleted.");
  }

  const storage = await initAtlasStorage(cwd);
  return { ...storage, warnings };
}

async function runCompile(args: string[]): Promise<void> {
  const projectPath = args[0] ?? ".";

  console.log("Generating Mind...");
  console.log("");
  console.log("Modules...");
  console.log("Rules...");
  console.log("Dependencies...");
  console.log("Architecture...");
  console.log("");

  const { amf, storage, warnings } = await compileCommand(process.cwd(), projectPath);
  printWarnings(warnings);

  console.log("Done.");
  console.log("");
  console.log(`${amf.project.name} compiled.`);
  console.log(`${storage.amfPath} generated.`);
}

export async function compileCommand(cwd: string, projectPath = ".") {
  const warnings: string[] = [];
  let migration: MigrationResult | undefined;
  const scan = await detectLegacyAtlasStorage(cwd);
  if (scan.hasLegacy && !scan.canonical.dirExists) {
    migration = await migrateAtlasToLmti(cwd);
    warnings.push("Legacy Atlas storage detected and migrated to .lmti before compile.");
    warnings.push(...migration.warnings);
  } else if (scan.hasLegacy && scan.canonical.dirExists) {
    warnings.push("Legacy Atlas storage detected; using .lmti/project.amf.json as canonical. Legacy files were not deleted.");
  }

  const amf = await compileProject(projectPath, { cwd });
  const storage = await writeAmfDocument(amf, cwd);
  return { amf, storage, warnings, migration };
}

async function runMigrate(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  if (!flags.yes) {
    const report = await doctorLmti(process.cwd());
    console.log(formatDoctorReport(report));
    console.log("");
    console.log("No files were changed. Run `lmti migrate --yes` to copy legacy Atlas state into .lmti.");
    return;
  }

  const result = await migrateCommand(process.cwd(), { yes: true });
  console.log(formatMigrationResult(result));
}

export async function migrateCommand(cwd: string, options: { yes?: boolean } = {}): Promise<MigrationResult> {
  if (!options.yes) {
    return {
      status: "skipped",
      legacyDetected: false,
      canonicalAmfPath: canonicalStoragePaths(cwd).amfPath,
      configPath: canonicalStoragePaths(cwd).configPath,
      changes: [],
      warnings: ["Migration not run. Pass yes: true or use `lmti migrate --yes`."],
      legacyEntries: []
    };
  }
  return migrateAtlasToLmti(cwd);
}

async function runDoctor(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  if (flags.security) {
    const report = await doctorSecurityCommand(process.cwd());
    if (flags.json) {
      const status = report.status === "pass" ? "pass" : report.status === "warn" ? "warn" : "blocked";
      setCliExitCode(status);
      printCliEnvelope("lmti.doctor.security", status, securityDoctorMessages(report, "warn"), securityDoctorMessages(report, "fail"), report);
      return;
    }
    printSafeJson(report, "doctor security");
    return;
  }
  const report = await doctorCommand(process.cwd(), { fix: Boolean(flags.fix) });
  if (flags.json) {
    const status = doctorStatusToCliStatus(report.status);
    setCliExitCode(status);
    printCliEnvelope("lmti.doctor", status, doctorProblemMessages(report, "warning"), doctorProblemMessages(report, "error"), report);
    return;
  }
  console.log(formatDoctorReport(report));
}

export async function doctorCommand(cwd: string, options: { fix?: boolean } = {}): Promise<DoctorReport> {
  return doctorLmti(cwd, options);
}

export interface SecurityDoctorCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface SecurityDoctorReport {
  status: "pass" | "warn" | "fail";
  checks: SecurityDoctorCheck[];
  recommendations: string[];
}

export async function doctorSecurityCommand(cwd: string): Promise<SecurityDoctorReport> {
  const checks: SecurityDoctorCheck[] = [];
  const recommendations = new Set<string>();
  const paths = canonicalStoragePaths(cwd);
  const legacy = await detectLegacyAtlasStorage(cwd);

  if (legacy.hasLegacy) {
    checks.push({ id: "legacy-storage", status: "warn", message: "Legacy Atlas storage detected; keep .lmti as canonical and avoid duplicate active mind files." });
    recommendations.add("Run `lmti doctor` or `lmti migrate --yes` before release if legacy storage is still active.");
  } else {
    checks.push({ id: "legacy-storage", status: "pass", message: "No legacy Atlas storage detected." });
  }

  const configText = await readTextIfExists(paths.configPath);
  if (!configText) {
    checks.push({ id: "config-present", status: "fail", message: ".lmti/config.json is missing." });
    recommendations.add("Run `lmti init` to create canonical local config.");
  } else {
    checks.push({ id: "config-present", status: "pass", message: ".lmti/config.json exists." });
    const configScan = runEgressSecretScan(configText);
    checks.push({
      id: "config-secret-scan",
      status: configScan.blocked ? "fail" : "pass",
      message: configScan.blocked ? `Config contains secret-like material: ${configScan.findings.join(", ")}.` : "Config contains no detected secret-like material."
    });
    if (configScan.blocked) {
      recommendations.add("Remove secrets from .lmti/config.json; use secure storage before adding adapter credentials.");
    }

    try {
      const config = JSON.parse(configText) as Partial<LmtiConfig>;
      const privacy = config.privacy;
      const permissive = Boolean(privacy?.allowSecretExport) || Boolean(privacy?.allowExternalModelRawMemory);
      checks.push({
        id: "privacy-config",
        status: permissive ? "fail" : "pass",
        message: permissive ? "Privacy config allows secret export or external raw memory." : "Privacy config keeps secret export and external raw memory disabled."
      });
      if (permissive) {
        recommendations.add("Set privacy.allowSecretExport=false and privacy.allowExternalModelRawMemory=false.");
      }
    } catch {
      checks.push({ id: "config-json", status: "fail", message: ".lmti/config.json is not valid JSON." });
      recommendations.add("Repair .lmti/config.json before using adapters or context commands.");
    }
  }

  try {
    const audit = await verifyAuditIntegrity(cwd);
    checks.push({
      id: "audit-integrity",
      status: audit.valid ? "pass" : "fail",
      message: audit.valid ? `Audit hash chain valid (${audit.checked} events checked).` : `Audit integrity failed (${audit.failures.length} failure(s)).`
    });
    if (!audit.valid) {
      recommendations.add("Inspect .lmti/privacy/audit.jsonl locally and investigate possible tampering.");
    }
  } catch {
    checks.push({ id: "audit-integrity", status: "warn", message: "Audit integrity could not be verified yet." });
    recommendations.add("Run `lmti privacy audit --verify` after privacy storage is initialized.");
  }

  try {
    const memory = await checkMemoryPrivacy({ cwd });
    checks.push({
      id: "memory-privacy",
      status: memory.length > 0 ? "warn" : "pass",
      message: memory.length > 0 ? `${memory.length} memory privacy finding(s) require review.` : "Memory privacy check has no findings."
    });
    if (memory.length > 0) {
      recommendations.add("Review `lmti privacy check` findings and mark secret-like memory as secret/do_not_prompt.");
    }
  } catch {
    checks.push({ id: "memory-privacy", status: "warn", message: "Memory privacy check could not run." });
  }

  try {
    const lessonReview = await getLessonCandidateReviewSummary({ cwd });
    const needsAttention = lessonReview.pending + lessonReview.needsReview + lessonReview.privacyWarnings + lessonReview.missingEvidence;
    checks.push({
      id: "lesson-candidates",
      status: needsAttention > 0 ? "warn" : "pass",
      message:
        needsAttention > 0
          ? `${lessonReview.pending} pending, ${lessonReview.needsReview} needs-review, ${lessonReview.privacyWarnings} privacy warning lesson candidate(s) require approval workflow.`
          : "No lesson candidates require approval review."
    });
    if (needsAttention > 0) {
      recommendations.add("Run `lmti memory lesson candidates` and approve only evidence-backed, privacy-safe lessons.");
    }
  } catch {
    checks.push({ id: "lesson-candidates", status: "warn", message: "Lesson candidate review check could not run." });
  }

  const failed = checks.some((check) => check.status === "fail");
  const warned = checks.some((check) => check.status === "warn");
  return {
    status: failed ? "fail" : warned ? "warn" : "pass",
    checks,
    recommendations: Array.from(recommendations)
  };
}

async function migrateLegacyIfLmtiMissing(cwd: string, warnings: string[] = []): Promise<MigrationResult | undefined> {
  const scan = await detectLegacyAtlasStorage(cwd);
  if (scan.hasLegacy && !scan.canonical.dirExists) {
    const migration = await migrateAtlasToLmti(cwd);
    warnings.push("Legacy Atlas storage detected and migrated to .lmti.");
    warnings.push(...migration.warnings);
    return migration;
  }
  return undefined;
}

function printWarnings(warnings: string[]): void {
  for (const warning of Array.from(new Set(warnings))) {
    console.warn(`[LMTI] ${warning}`);
  }
}

async function runInspect(args: string[]): Promise<void> {
  const amf = await readAmfDocument(args[0], process.cwd());
  console.log(formatInspection(inspectAmf(amf)));
}

async function runContext(args: string[]): Promise<void> {
  if (args.length === 0) {
    throw new Error('Usage: lmti context "<task>" [amfPath] [--include-secret]');
  }

  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  const amfPath = positional[1];
  const includeSecret = Boolean(flags["include-secret"]);
  const role = parseRole(stringFlag(flags, "role") ?? "developer");
  const contextPack = await contextCommand(process.cwd(), task, { amfPath, includeSecret, role, flags });
  printSafeJson(contextPack, "context");
}

export async function contextCommand(
  cwd: string,
  task: string,
  options: {
    amfPath?: string;
    includeSecret?: boolean;
    role?: AccessRole;
    flags?: Record<string, FlagValue>;
  } = {}
) {
  const flags = options.flags ?? {};
  const adapterManifest = flags.adapter || flags["adapter-manifest"]
    ? await loadAdapterManifest(cwd, stringFlag(flags, "adapter-manifest"), stringFlag(flags, "adapter"))
    : undefined;
  const adapterEffectiveRole = adapterManifest ? deriveEffectiveContextRole(options.role ?? "developer", adapterManifest.privacy.defaultModelTarget) : undefined;
  const includeSecret = adapterManifest ? false : Boolean(options.includeSecret);
  const includeRaw = Boolean(flags["include-raw"]);
  const includeSecretMeta = Boolean(flags["include-secret-meta"]);
  const includeLowScore = Boolean(flags["include-low-score"]);
  const role = adapterEffectiveRole ?? options.role ?? "developer";
  await migrateLegacyIfLmtiMissing(cwd);
  const amf = await readCompiledAmf(cwd, options.amfPath);
  const inferredIntent = inferIntent(task);
  const memorySelection = await searchMemoryForContext(task, {
    cwd,
    includeSecret,
    includeRaw: adapterManifest ? false : includeRaw,
    includeSecretMeta: adapterManifest ? false : includeSecretMeta,
    includeLowScore,
    taskIntent: inferredIntent,
    privacyContext: createCliPrivacyContext(role, flags, "context", "context generation"),
    limit: 16
  });
  return buildContextPack(amf, task, {
    memories: memorySelection.results,
    includeSecret,
    includeLowScore,
    inferredIntent,
    memoriesFilteredOut: memorySelection.filteredOut
  });
}

async function runPreflight(args: string[], cwd = process.cwd()): Promise<void> {
  if (args[0] === "publish") {
    await runPublishPreflight(args.slice(1), cwd);
    return;
  }

  if (args.length === 0) {
    throw new Error('Usage: lmti preflight "<task>" [amfPath] [--role developer] [--model-target external_model]');
  }

  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  const amfPath = positional[1];
  const role = parseRole(stringFlag(flags, "role") ?? "developer");
  const modelTarget = stringFlag(flags, "model-target");
  const result = await preflightCommand(cwd, task, { amfPath, role, modelTarget, flags });
  printSafeJson(result, "preflight");
}

async function runPublish(args: string[], cwd = process.cwd()): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "preflight" || subcommand === "check") {
    await runPublishPreflight(rest, cwd);
    return;
  }
  throw new CliUsageError("Usage: lmti publish <check|preflight> [--target main] [--json] [--strict] [--fix-suggest]");
}

async function runPublishPreflight(args: string[], cwd = process.cwd()): Promise<void> {
  const { flags } = parseArgs(args);
  const result = await publishPreflightCommand(cwd, {
    target: stringFlag(flags, "target"),
    strict: Boolean(flags.strict)
  });

  process.exitCode = result.exitCode;
  if (flags.json) {
    printSafeJson(createPublishEnvelope(result), "publish preflight");
    return;
  }
  printSafeText(formatPublishPreflight(result, { fixSuggest: Boolean(flags["fix-suggest"]) }));
}

async function runSkill(args: string[], cwd = process.cwd()): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "list":
      await runSkillList(rest, cwd, "lmti.skill.list");
      return;
    case "route":
      await runSkillRoute(rest, cwd, "lmti.skill.route");
      return;
    case "show":
      await runSkillShow(rest, cwd, "lmti.skill.show");
      return;
    case "validate":
      await runSkillValidate(rest, cwd, "lmti.skill.validate");
      return;
    case "help":
    case "--help":
    case undefined:
      printSkillHelp();
      return;
    default:
      throw new CliUsageError("Usage: lmti skill <list|route|show|validate> [--json]");
  }
}

async function runThoth(args: string[], cwd = process.cwd()): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "list":
      await runSkillList(rest, cwd, "lmti.thoth.list");
      return;
    case "route":
      await runSkillRoute(rest, cwd, "lmti.thoth.route");
      return;
    case "show":
      await runSkillShow(rest, cwd, "lmti.thoth.show");
      return;
    case "validate":
      await runSkillValidate(rest, cwd, "lmti.thoth.validate");
      return;
    case "explain":
      await runThothExplain(rest, cwd);
      return;
    case "inspect":
      await runThothInspect(rest, cwd);
      return;
    case "doctor":
      await runThothDoctor(rest, cwd);
      return;
    case "help":
    case "--help":
    case undefined:
      printThothHelp();
      return;
    default:
      throw new CliUsageError("Usage: lmti thoth <list|route|explain|show|inspect|validate|doctor> [--json]");
  }
}

async function runSkillList(args: string[], cwd: string, commandName: string): Promise<void> {
  const { flags } = parseArgs(args);
  const registry = await readSkillRegistry(cwd);
  if (flags.json) {
    printCliEnvelope(commandName, "pass", [], [], { skills: registry });
    return;
  }
  const lines = [
    "LMTI Skills",
    "",
    "| Skill | Intent | Risk | Policy | Memory |",
    "|---|---|---|---|---|",
    ...registry.map((skill) => `| ${skill.id} | ${skill.intents.join(", ")} | ${skill.riskLevel} | ${skill.requiresPolicy ? "yes" : "no"} | ${skill.requiresMemory ? "yes" : "no"} |`)
  ];
  printSafeText(lines.join("\n"));
}

async function runSkillRoute(args: string[], cwd: string, commandName: string): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const request = positional.join(" ").trim();
  if (!request) {
    writeCliUsage(commandName, `Usage: ${commandName.replace(/\./gu, " ")} "<task>" [--json]`, Boolean(flags.json));
    return;
  }
  const outcome = await routeSkillCommand(cwd, request);
  setCliExitCode(outcome.status);
  if (flags.json) {
    printCliEnvelope(commandName, outcome.status, outcome.warnings, outcome.errors, outcome.result);
    return;
  }
  printSkillRoute(outcome);
}

async function runSkillShow(args: string[], cwd: string, commandName: string): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    writeCliUsage(commandName, `Usage: ${commandName.replace(/\./gu, " ")} <skill-id> [--json]`, Boolean(flags.json));
    return;
  }
  const result = await loadSkillContentCommand(cwd, id);
  setCliExitCode(result.status);
  if (flags.json) {
    printCliEnvelope(commandName, result.status, result.warnings, result.errors, result.data);
    return;
  }
  if (result.errors.length > 0) {
    printSafeText(result.errors.map((error) => `${error.code}: ${error.message}`).join("\n"));
    return;
  }
  printSafeText(result.data.content);
}

async function runSkillValidate(args: string[], cwd: string, commandName: string): Promise<void> {
  const { flags } = parseArgs(args);
  const report = await validateSkillsCommand(cwd);
  setCliExitCode(report.status);
  if (flags.json) {
    printCliEnvelope(commandName, report.status, report.warnings, report.errors, report.data);
    return;
  }
  const lines = [
    "LMTI Skill Validation",
    "",
    "| Check | Status | Detail |",
    "|---|---|---|",
    ...report.data.checks.map((check) => `| ${check.check} | ${check.status.toUpperCase()} | ${check.detail.replace(/\|/gu, "\\|")} |`),
    "",
    `Result: ${report.status.toUpperCase()}`
  ];
  printSafeText(lines.join("\n"));
}

async function runThothExplain(args: string[], cwd: string): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const request = positional.join(" ").trim();
  if (!request) {
    writeCliUsage("lmti.thoth.explain", 'Usage: lmti thoth explain "<task>" [--json]', Boolean(flags.json));
    return;
  }
  const outcome = await routeSkillCommand(cwd, request);
  const explanation = {
    request,
    selectedSkill: outcome.result.selectedSkill?.id,
    intent: outcome.result.intent,
    why: outcome.result.reason,
    recommendedFlow: outcome.result.recommendedCommands
  };
  setCliExitCode(outcome.status);
  if (flags.json) {
    printCliEnvelope("lmti.thoth.explain", outcome.status, outcome.warnings, outcome.errors, explanation);
    return;
  }
  printSafeText([
    "LMTI Thoth Explain",
    "",
    `Intent: ${explanation.intent}`,
    `Selected skill: ${explanation.selectedSkill ?? "none"}`,
    `Why: ${explanation.why}`,
    "",
    "Recommended flow:",
    ...explanation.recommendedFlow.map((step, index) => `${index + 1}. ${step}`)
  ].join("\n"));
}

async function runThothInspect(args: string[], cwd: string): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    writeCliUsage("lmti.thoth.inspect", "Usage: lmti thoth inspect <skill-id> [--json]", Boolean(flags.json));
    return;
  }
  const registry = await readSkillRegistry(cwd);
  const skill = registry.find((item) => item.id === id);
  const status: CliStatus = skill ? "pass" : "error";
  const errors = skill ? [] : [{ code: "THOTH_SKILL_NOT_FOUND", message: "Skill id was not found in skills/registry.toml." }];
  setCliExitCode(status);
  if (flags.json) {
    printCliEnvelope("lmti.thoth.inspect", status, [], errors, { skill });
    return;
  }
  printSafeText(skill ? [`Skill: ${skill.id}`, `File: ${skill.file}`, `Risk: ${skill.riskLevel}`, `Intents: ${skill.intents.join(", ")}`].join("\n") : errors[0].message);
}

async function runThothDoctor(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  const report = await validateSkillsCommand(cwd);
  setCliExitCode(report.status);
  if (flags.json) {
    printCliEnvelope("lmti.thoth.doctor", report.status, report.warnings, report.errors, report.data);
    return;
  }
  printSafeText(`LMTI Thoth Doctor\n\nResult: ${report.status.toUpperCase()}\nSkills checked: ${report.data.skillsChecked}`);
}

async function runPolicy(args: string[], cwd = process.cwd()): Promise<void> {
  const [subcommand, ...rest] = args;
  const { flags } = parseArgs(rest);
  if (subcommand === "list") {
    const data = {
      decisions: ["allow", "warn", "block", "require_user_approval"],
      highRiskActions: ["publish", "deploy", "migration", "memory_export", "destructive_cleanup"]
    };
    if (flags.json) {
      printCliEnvelope("lmti.policy.list", "pass", [], [], data);
      return;
    }
    printSafeText(["LMTI Policy Actions", "", ...data.highRiskActions.map((action) => `- ${action}`)].join("\n"));
    return;
  }
  if (subcommand !== "check") {
    throw new CliUsageError("Usage: lmti policy <check|list> [--action publish] [--json]");
  }
  const action = stringFlag(flags, "action");
  if (!action) {
    writeCliUsage("lmti.policy.check", "Usage: lmti policy check --action <action> [--path <path>] [--json]", Boolean(flags.json));
    return;
  }
  const result = evaluatePolicyAction(action, parseCsv(stringFlag(flags, "path") ?? stringFlag(flags, "paths")), cwd);
  setCliExitCode(result.status);
  if (flags.json) {
    printCliEnvelope("lmti.policy.check", result.status, result.warnings, result.errors, result.data);
    return;
  }
  printSafeText(`LMTI Policy Check\n\nAction: ${action}\nDecision: ${result.data.decision}\nResult: ${result.status.toUpperCase()}`);
}

async function runConfig(args: string[], cwd = process.cwd()): Promise<void> {
  const [subcommand, ...rest] = args;
  const { flags } = parseArgs(rest);
  if (!["show", "inspect", "validate"].includes(subcommand ?? "")) {
    throw new CliUsageError("Usage: lmti config <show|inspect|validate> [--json]");
  }
  const report = await inspectConfigCommand(cwd, stringFlag(flags, "config"));
  const commandName = `lmti.config.${subcommand}`;
  const status = report.errors.length > 0 ? "error" : report.warnings.length > 0 ? "warn" : "pass";
  setCliExitCode(status);
  if (flags.json) {
    printCliEnvelope(commandName, status, report.warnings, report.errors, report.data);
    return;
  }
  printSafeText([
    subcommand === "validate" ? "LMTI Config Validate" : "LMTI Config",
    "",
    `Path: ${report.data.path ?? "(missing)"}`,
    `Format: ${report.data.format ?? "(unknown)"}`,
    `Exists: ${report.data.exists ? "yes" : "no"}`,
    `Result: ${status.toUpperCase()}`
  ].join("\n"));
}

async function runAgent(args: string[], cwd = process.cwd()): Promise<void> {
  const [subcommand, ...rest] = args;
  const { positional, flags } = parseArgs(rest);
  if (subcommand === "inspect") {
    const data = {
      boundary: "CLI/API JSON only",
      directStorageAccess: false,
      rawSQLiteAccess: false,
      secretMemoryAllowed: false,
      commands: ["lmti skill route", "lmti skill show", "lmti memory retrieve", "lmti policy check", "lmti publish check"]
    };
    if (flags.json) {
      printCliEnvelope("lmti.agent.inspect", "pass", [], [], data);
      return;
    }
    printSafeText(["LMTI Agent Boundary", "", ...data.commands.map((command) => `- ${command}`)].join("\n"));
    return;
  }
  if (subcommand !== "context") {
    throw new CliUsageError("Usage: lmti agent <inspect|context> --intent <intent> [--json]");
  }
  const intent = stringFlag(flags, "intent") ?? positional[0];
  if (!intent) {
    writeCliUsage("lmti.agent.context", "Usage: lmti agent context --intent <intent> [--json]", Boolean(flags.json));
    return;
  }
  const results = await retrieveMemoryForTask(intent, {
    cwd,
    privacyMode: "safe",
    limit: parseNumberFlag(flags, "limit", 8)
  });
  const data = { intent, results, privacy: { max: "internal", secret: "blocked", doNotPrompt: "blocked" } };
  if (flags.json) {
    printCliEnvelope("lmti.agent.context", "pass", [], [], data);
    return;
  }
  printSafeText([
    "LMTI Agent Context",
    "",
    `Intent: ${intent}`,
    `Results: ${results.length}`,
    "Privacy: secret and do_not_prompt memory blocked"
  ].join("\n"));
}

async function runCleanup(args: string[], cwd = process.cwd()): Promise<void> {
  const [subcommand, ...rest] = args;
  const { flags } = parseArgs(rest);
  if (subcommand !== "check") {
    throw new CliUsageError("Usage: lmti cleanup check [--json]");
  }
  const reportPath = path.join(cwd, "docs", "cleanup-report.md");
  const reportExists = await pathExists(reportPath);
  const gitStatus = runGit(cwd, ["status", "--porcelain=v1"]);
  const dirty = gitStatus.ok && gitStatus.stdout.trim().length > 0;
  const checks = [
    { check: "cleanup_report", status: reportExists ? "pass" : "warn", detail: reportExists ? "docs/cleanup-report.md exists" : "cleanup report is missing" },
    { check: "working_tree", status: dirty ? "warn" : "pass", detail: dirty ? "working tree has local changes" : "working tree clean" }
  ];
  const status: CliStatus = checks.some((check) => check.status === "warn") ? "warn" : "pass";
  const warnings = checks.filter((check) => check.status === "warn").map((check) => ({ code: "CONFIG_INVALID", message: check.detail }));
  setCliExitCode(status);
  if (flags.json) {
    printCliEnvelope("lmti.cleanup.check", status, warnings, [], { checks });
    return;
  }
  printSafeText([
    "LMTI Cleanup Check",
    "",
    "| Check | Status | Detail |",
    "|---|---|---|",
    ...checks.map((check) => `| ${check.check} | ${check.status.toUpperCase()} | ${check.detail} |`),
    "",
    `Result: ${status.toUpperCase()}`
  ].join("\n"));
}

export async function preflightCommand(
  cwd: string,
  task: string,
  options: {
    amfPath?: string;
    role?: AccessRole;
    modelTarget?: string;
    flags?: Record<string, FlagValue>;
    now?: Date;
  } = {}
): Promise<PreflightResult> {
  const flags = options.flags ?? {};
  const latency = createLatencyTracker();
  const now = options.now ?? new Date();
  const observerRole = options.role ?? "developer";

  await migrateLegacyIfLmtiMissing(cwd);
  const adapterManifest = await loadAdapterManifest(cwd, stringFlag(flags, "adapter-manifest"), stringFlag(flags, "adapter"));
  const modelTarget = options.modelTarget ?? adapterManifest.privacy.defaultModelTarget;
  const amf = await readCompiledAmf(cwd, options.amfPath);
  latency.mark("read_amf");
  const inferredIntent = inferIntent(task);
  const projectId = amf.project.name;
  const sinkRole = inferSinkRole(modelTarget);
  const effectiveContextRole = deriveEffectiveContextRole(observerRole, modelTarget);
  const request: ContextRequest = {
    id: randomUUID(),
    input: task,
    projectId,
    userId: stringFlag(flags, "user-id") ?? "local-user",
    agentId: stringFlag(flags, "agent-id") ?? "codex",
    observerRole,
    modelTarget,
    createdAt: now.toISOString(),
    tokenBudget: flags["token-budget"] === undefined ? undefined : parseNumberFlag(flags, "token-budget", 0)
  };
  const observerFrame: ObserverFrame = {
    observerRole,
    sinkRole,
    effectiveContextRole,
    projectId,
    userId: request.userId,
    agentId: request.agentId,
    modelTarget
  };
  const privacyContext = createPrivacyContext({
    role: effectiveContextRole,
    projectId,
    purpose: "LMTI preflight context package",
    includeSecret: false,
    includeRaw: false,
    command: "preflight",
    timestamp: now.toISOString()
  });
  latency.mark("observer_frame");

  const metadata = await retrieveMemoryMetadata({ cwd, now });
  latency.mark("retrieve_metadata");
  const gate = hardGateMemoryMetadata({
    metadata,
    observer: observerFrame,
    privacyContext,
    now
  });
  latency.mark("hard_gate");
  const safeMemory = await fetchAllowedMemoryContent({
    cwd,
    metadata: gate.allowed,
    privacyContext,
    taskIntent: inferredIntent,
    policyDecisions: gate.policyDecisions,
    limit: 16
  });
  latency.mark("safe_content_loader");
  const selectedMemories = rankPolicySafeMemoryForPreflight(safeMemory, inferredIntent, Boolean(flags["include-low-score"]));
  const contextPack = buildContextPack(amf, task, {
    memories: selectedMemories.map(policySafeMemoryToSearchResult),
    includeSecret: false,
    includeLowScore: Boolean(flags["include-low-score"]),
    inferredIntent,
    memoriesFilteredOut: gate.blocked.length
  });
  const riskSignals = detectPreflightRiskSignals(gate.blocked, selectedMemories);
  const candidates = generateMvpContextCandidates(request.id, selectedMemories, gate.blocked, riskSignals);
  const selectedCandidate = selectMvpCandidate(candidates);
  const executiveConstraints = createExecutiveConstraints(gate.blocked, riskSignals);
  const finalContextPackage = compilePreflightContextPackage({
    request,
    candidate: selectedCandidate,
    contextPack,
    selectedMemories,
    blockedMemories: gate.blocked,
    constraints: executiveConstraints
  });
  latency.mark("compile_context");
  const egress = runEgressSecretScan(finalContextPackage);
  latency.mark("egress_scan");
  const adapterSandbox = runAdapterSandbox({
    manifest: adapterManifest,
    contextPackage: finalContextPackage,
    egressBlocked: egress.blocked
  });
  latency.mark("adapter_sandbox");
  const predictedFailures = [
    ...selectedCandidate.predictedFailures,
    ...(egress.blocked ? ["egress scan blocked adapter call"] : []),
    ...adapterSandbox.deniedReasons.map((reason) => `adapter sandbox blocked: ${reason}`)
  ];
  const explanation = {
    selectedMemoryIds: selectedMemories.map((memory) => memory.metadata.id),
    blockedMemories: gate.blocked.map((memory) => ({
      memoryId: memory.memoryId,
      reason: memory.reason,
      safeSummary: memory.safeSummary
    })),
    selectedStrategy: selectedCandidate.strategy,
    why: selectedCandidate.predictedFailures.length > 0 ? selectedCandidate.predictedFailures : ["selected highest-scoring policy-safe MVP package"],
    redactions: [...gate.blocked.map((memory) => memory.reason), ...egress.findings, ...adapterSandbox.deniedReasons]
  };

  const adapterBlocked = !adapterSandbox.allowed;
  await appendAuditEvent(cwd, {
    action: egress.blocked ? "preflight.egress_blocked" : adapterBlocked ? "preflight.adapter_blocked" : "preflight.completed",
    recordId: request.id,
    sensitivity: "internal",
    role: effectiveContextRole,
    decision: egress.blocked || adapterBlocked ? "deny" : "allow",
    command: "preflight",
    reason: egress.blocked
      ? "Context package failed egress scan."
      : adapterBlocked
        ? `Adapter sandbox blocked: ${adapterSandbox.deniedReasons.join(", ")}`
        : "Preflight completed with policy-safe package."
  });
  latency.mark("audit");

  return {
    preflightId: request.id,
    request,
    observerFrame,
    inferredIntent,
    selectedMemories,
    blockedMemories: gate.blocked,
    candidates,
    riskSignals,
    predictedFailures,
    executiveConstraints,
    finalContextPackage,
    egress,
    adapterSandbox,
    explanation,
    metrics: {
      metadataCount: metadata.length,
      allowedMemoryCount: gate.allowed.length,
      blockedMemoryCount: gate.blocked.length,
      selectedMemoryCount: selectedMemories.length,
      tokenEstimate: finalContextPackage.tokenEstimate,
      latencyMs: latency.totalMs(),
      phaseLatencyMs: latency.phases()
    }
  };
}

export async function publishPreflightCommand(cwd: string, options: PublishPreflightOptions = {}): Promise<PublishPreflightResult> {
  const config = await loadPublishPreflightConfig(cwd, options);
  const checks: PublishPreflightCheck[] = [];
  const targetBranch = options.target ?? config.targetBranch;
  const targetRef = `origin/${targetBranch}`;

  checks.push(
    config.publicRepo
      ? {
          name: "publish_target",
          title: "Publish target",
          status: "pass",
          message: `Configured target is ${sanitizeRepoLocator(config.publicRepo)}.`
        }
      : {
          name: "publish_target",
          title: "Publish target",
          status: "error",
          message: "No public publish repository is configured.",
          fix: "Add publish.publicRepo to .lmti/config.json, publish_repository to .lmti/layer.json, or repository.url to package.json."
        }
  );

  const gitRootResult = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!gitRootResult.ok || !gitRootResult.stdout.trim()) {
    checks.push({
      name: "repository_identity",
      title: "Repository identity",
      status: "error",
      message: "Current directory is not inside a Git repository.",
      fix: "Run the publish preflight from the repository root before opening a PR or publishing."
    });
    return finalizePublishPreflight({
      checks,
      config,
      targetBranch,
      strict: Boolean(options.strict)
    });
  }

  const repoRoot = gitRootResult.stdout.trim();
  const identity = await readPublishIdentity(repoRoot);
  checks.push(createRepositoryIdentityCheck(identity, config.publicRepo));

  const originResult = runGit(repoRoot, ["remote", "get-url", "origin"]);
  const currentOrigin = originResult.ok ? originResult.stdout.trim() : undefined;
  checks.push(createRemoteOriginCheck(currentOrigin, config));

  const branchResult = runGit(repoRoot, ["branch", "--show-current"]);
  const currentBranch = branchResult.ok ? branchResult.stdout.trim() : undefined;
  checks.push(createBranchSafetyCheck(currentBranch, config.allowedPublishBranches));

  const targetExists = runGit(repoRoot, ["rev-parse", "--verify", "--quiet", targetRef]);
  let hasCommonHistory = false;
  if (!targetExists.ok) {
    checks.push({
      name: "git_history",
      title: "Git history",
      status: "error",
      message: `Target ref ${targetRef} was not found locally.`,
      fix: `Fetch the target branch first, then run lmti publish preflight --target ${targetBranch} again.`
    });
  } else {
    const mergeBase = runGit(repoRoot, ["merge-base", "HEAD", targetRef]);
    hasCommonHistory = mergeBase.ok && mergeBase.stdout.trim().length > 0;
    checks.push(
      hasCommonHistory
        ? {
            name: "git_history",
            title: "Git history",
            status: "pass",
            message: `Branch shares history with ${targetRef}.`
          }
        : {
            name: "git_history",
            title: "Git history",
            status: "error",
            message: `Current branch does not share Git history with ${targetRef}. This may create a PR with entirely different commit histories.`,
            fix: `Recreate the branch from ${targetRef}, then cherry-pick or re-apply only the intended publish commits.`
          }
    );
  }

  checks.push(createDivergenceCheck(repoRoot, targetRef, hasCommonHistory));

  const statusResult = runGit(repoRoot, ["status", "--porcelain=v1"]);
  const statusEntries = statusResult.ok ? parseGitStatus(statusResult.stdout) : [];
  checks.push(createWorkingTreeCheck(statusResult.ok, statusEntries));

  const trackedFilesResult = runGit(repoRoot, ["ls-files"]);
  const trackedFiles = trackedFilesResult.ok ? splitLines(trackedFilesResult.stdout) : [];
  checks.push(createProtectedFilesCheck(statusEntries, trackedFiles, config.protectedPaths));

  checks.push(await createPackageMetadataCheck(repoRoot));
  checks.push(await createOpenSourceDocsCheck(repoRoot));
  checks.push(await createLmtiIdentityCheck(repoRoot));

  return finalizePublishPreflight({
    checks,
    config,
    targetBranch,
    currentOrigin,
    currentBranch,
    strict: Boolean(options.strict)
  });
}

function finalizePublishPreflight(input: {
  checks: PublishPreflightCheck[];
  config: PublishPreflightConfig;
  targetBranch: string;
  currentOrigin?: string;
  currentBranch?: string;
  strict: boolean;
}): PublishPreflightResult {
  const checks = input.strict
    ? input.checks.map((check) => (check.status === "warn" ? { ...check, status: "error" as const, message: `Strict mode: ${check.message}` } : check))
    : input.checks;
  const hasError = checks.some((check) => check.status === "error");
  const hasWarn = checks.some((check) => check.status === "warn");
  const result: PublishPreflightResultState = hasError ? "blocked" : hasWarn ? "warning" : "pass";
  const exitCode: 0 | 1 | 2 = hasError ? 2 : hasWarn ? 1 : 0;
  return {
    command: "lmti publish preflight",
    result,
    exitCode,
    targetRepo: input.config.publicRepo ? sanitizeRepoLocator(input.config.publicRepo) : undefined,
    currentOrigin: input.currentOrigin ? sanitizeRepoLocator(input.currentOrigin) : undefined,
    currentBranch: input.currentBranch,
    targetBranch: input.targetBranch,
    checks,
    next: result === "blocked"
      ? "Stop. Do not push, publish, open a PR, or change remotes until the ERROR items are resolved."
      : result === "warning"
        ? "Review warning items before opening the PR or publishing."
        : "Safe to continue with the publish/PR flow.",
    configSources: input.config.sources
  };
}

function formatPublishPreflight(result: PublishPreflightResult, options: { fixSuggest?: boolean } = {}): string {
  const lines = [
    "LMTI Publish Preflight",
    "",
    `Target repo: ${result.targetRepo ?? "(missing)"}`,
    `Current origin: ${result.currentOrigin ?? "(missing)"}`,
    `Current branch: ${result.currentBranch ?? "(detached or unknown)"}`,
    `Target branch: ${result.targetBranch}`,
    "",
    "| Check | Status | Detail |",
    "|---|---|---|",
    ...result.checks.map((check) => `| ${check.title} | ${check.status.toUpperCase()} | ${check.message.replace(/\|/g, "\\|")} |`),
    "",
    `Result: ${result.result === "warning" ? "PASS WITH WARNINGS" : result.result.toUpperCase()}`,
    `Next: ${result.next}`
  ];

  const fixes = Array.from(new Set(result.checks.filter((check) => check.status !== "pass" && check.fix).map((check) => check.fix as string)));
  if ((options.fixSuggest || result.result === "blocked") && fixes.length > 0) {
    lines.push("", "Fix:");
    fixes.forEach((fix, index) => {
      lines.push(`${index + 1}. ${fix}`);
    });
  }
  return lines.join("\n");
}

function createPublishEnvelope(result: PublishPreflightResult): CliJsonEnvelope {
  return createCliEnvelope(
    "lmti.publish.preflight",
    publishResultToCliStatus(result.result),
    result.checks
      .filter((check) => check.status === "warn")
      .map((check) => ({ code: publishCheckCode(check), message: check.message, suggestion: check.fix })),
    result.checks
      .filter((check) => check.status === "error")
      .map((check) => ({ code: publishCheckCode(check), message: check.message, suggestion: check.fix })),
    result
  );
}

function publishCheckCode(check: PublishPreflightCheck): string {
  switch (check.name) {
    case "publish_target":
      return "PUBLISH_TARGET_MISSING";
    case "remote_origin":
      return "REMOTE_ORIGIN_MISMATCH";
    case "git_history":
      return "GIT_HISTORY_NO_COMMON_ANCESTOR";
    case "branch_safety":
      return "BRANCH_NOT_ALLOWED";
    case "dirty_working_tree":
      return "WORKING_TREE_DIRTY";
    case "protected_files":
      return "PROTECTED_FILE_DETECTED";
    case "open_source_docs":
      return "PUBLISH_TARGET_MISSING";
    case "package_metadata":
      return "CONFIG_INVALID";
    default:
      return check.status === "error" ? "UNKNOWN_ERROR" : "CONFIG_INVALID";
  }
}

async function loadPublishPreflightConfig(cwd: string, options: PublishPreflightOptions): Promise<PublishPreflightConfig> {
  const repoRoot = await bestEffortGitRoot(cwd);
  const sources: string[] = [];
  const configPublish = getPublishBlock(await readJsonFileIfExists(path.join(repoRoot, ".lmti", "config.json")));
  const layer = await readJsonFileIfExists(path.join(repoRoot, ".lmti", "layer.json"));
  const packageJson = await readJsonFileIfExists(path.join(repoRoot, "package.json"));
  const layerPublicRepo = stringRecordValue(layer, "publish_repository");
  const packageRepo = packageRepositoryUrl(packageJson);

  let publicRepo = options.publicRepo;
  if (publicRepo) {
    sources.push("option.publicRepo");
  }
  if (!publicRepo && configPublish.publicRepo) {
    publicRepo = configPublish.publicRepo;
    sources.push(".lmti/config.json:publish.publicRepo");
  }
  if (!publicRepo && layerPublicRepo) {
    publicRepo = layerPublicRepo;
    sources.push(".lmti/layer.json:publish_repository");
  }
  if (!publicRepo && packageRepo) {
    publicRepo = packageRepo;
    sources.push("package.json:repository.url");
  }

  return {
    publicRepo,
    privateRepoPatterns: uniqueStrings([...DEFAULT_PRIVATE_REPO_PATTERNS, ...configPublish.privateRepoPatterns]),
    targetBranch: configPublish.targetBranch ?? DEFAULT_PUBLISH_TARGET_BRANCH,
    allowedPublishBranches: configPublish.allowedPublishBranches.length > 0 ? configPublish.allowedPublishBranches : DEFAULT_PUBLISH_ALLOWED_BRANCHES,
    protectedPaths: configPublish.protectedPaths.length > 0 ? configPublish.protectedPaths : DEFAULT_PROTECTED_PUBLISH_PATHS,
    sources
  };
}

async function bestEffortGitRoot(cwd: string): Promise<string> {
  const gitRoot = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return gitRoot.ok && gitRoot.stdout.trim() ? gitRoot.stdout.trim() : cwd;
}

export async function routeSkillCommand(cwd: string, request: string): Promise<LmtiSkillRouteOutcome> {
  let registry: LmtiSkillDefinition[];
  try {
    registry = await readSkillRegistry(cwd);
  } catch (error) {
    return {
      status: "error",
      warnings: [],
      errors: [{ code: "THOTH_REGISTRY_MISSING", message: error instanceof Error ? error.message : String(error) }],
      result: {
        request,
        intent: "unknown",
        decision: "invalid_registry",
        candidates: [],
        secondarySkills: [],
        requiresPolicy: false,
        requiresMemory: false,
        requiredPolicyGates: [],
        recommendedCommands: [],
        reason: "Skill registry could not be loaded."
      }
    };
  }

  const scored = registry
    .map((skill) => scoreSkillForRequest(skill, request))
    .filter((skill) => skill.score > 0)
    .sort((left, right) => right.score - left.score || riskLevelRank(right.skill.riskLevel) - riskLevelRank(left.skill.riskLevel) || left.skill.id.localeCompare(right.skill.id));

  if (scored.length === 0) {
    return {
      status: "warn",
      warnings: [{ code: "THOTH_NO_SKILL_FOUND", message: "No suitable skill was found for this request." }],
      errors: [],
      result: {
        request,
        intent: "unknown",
        decision: "no_skill_found",
        candidates: [],
        secondarySkills: [],
        requiresPolicy: false,
        requiresMemory: false,
        requiredPolicyGates: [],
        recommendedCommands: [],
        reason: "No registered skill matched this request."
      }
    };
  }

  const selected = scored[0];
  const secondary = scored.slice(1);
  const status: CliStatus = secondary.length > 0 ? "warn" : "pass";
  const selectedSkill = selected.skill;
  return {
    status,
    warnings: secondary.length > 0 ? [{ code: "THOTH_MULTIPLE_SKILLS_MATCHED", message: "More than one skill matched the request. LMTI selected the highest-risk relevant skill first." }] : [],
    errors: [],
    result: {
      request,
      intent: selected.intent,
      decision: secondary.length > 0 ? "multiple_candidates" : "skill_selected",
      selectedSkill: {
        id: selectedSkill.id,
        name: selectedSkill.name,
        file: selectedSkill.file,
        riskLevel: selectedSkill.riskLevel
      },
      candidates: scored.map((item) => ({
        id: item.skill.id,
        score: Math.round(item.score) / 100,
        intent: item.intent,
        riskLevel: item.skill.riskLevel,
        reason: item.reason
      })),
      secondarySkills: secondary.map((item) => ({
        id: item.skill.id,
        reason: `${item.skill.id} matched too, but ${selectedSkill.id} has higher priority for this request.`
      })),
      requiresPolicy: selectedSkill.requiresPolicy,
      requiresMemory: selectedSkill.requiresMemory,
      requiredPolicyGates: policyGatesForSkill(selectedSkill),
      recommendedCommands: recommendedCommandsForSkill(selectedSkill, selected.intent),
      memoryRequest: selectedSkill.requiresMemory
        ? { intent: selected.intent, privacyMax: "internal", includeLessons: true, includeRelatedFiles: true }
        : undefined,
      reason: selected.reason
    }
  };
}

async function readSkillRegistry(cwd: string): Promise<LmtiSkillDefinition[]> {
  const registryPath = path.join(cwd, "skills", "registry.toml");
  const text = await fs.readFile(registryPath, "utf8");
  const skills = parseSkillRegistryToml(text);
  if (skills.length === 0) {
    throw new Error("skills/registry.toml contains no skills.");
  }
  return skills;
}

function parseSkillRegistryToml(text: string): LmtiSkillDefinition[] {
  const blocks = text.split(/\[\[skills\]\]/u).slice(1);
  return blocks.map((block) => {
    const raw: Record<string, string> = {};
    for (const line of block.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const match = trimmed.match(/^([a-z_]+)\s*=\s*(.+)$/u);
      if (match) {
        raw[match[1]] = match[2].trim();
      }
    }
    return {
      id: parseTomlString(raw.id),
      name: parseTomlString(raw.name),
      description: parseTomlString(raw.description),
      file: parseTomlString(raw.file),
      intents: parseTomlStringArray(raw.intents),
      requiresPolicy: parseTomlBoolean(raw.requires_policy),
      requiresMemory: parseTomlBoolean(raw.requires_memory),
      riskLevel: parseTomlString(raw.risk_level)
    };
  }).filter((skill) => skill.id && skill.file);
}

function parseTomlString(value?: string): string {
  return value?.trim().replace(/^"|"$/gu, "") ?? "";
}

function parseTomlStringArray(value?: string): string[] {
  if (!value) {
    return [];
  }
  const inner = value.trim().replace(/^\[/u, "").replace(/\]$/u, "");
  return inner.split(",").map((item) => parseTomlString(item.trim())).filter(Boolean);
}

function parseTomlBoolean(value?: string): boolean {
  return value?.trim().toLowerCase() === "true";
}

function scoreSkillForRequest(skill: LmtiSkillDefinition, request: string): { skill: LmtiSkillDefinition; score: number; intent: string; reason: string } {
  const normalizedRequest = normalizeCommandText(request);
  let score = 0;
  let bestIntent = "unknown";
  for (const intent of skill.intents) {
    const canonical = canonicalSkillIntent(intent);
    const normalizedIntent = normalizeCommandText(intent);
    if (normalizedIntent && normalizedRequest.includes(normalizedIntent)) {
      score += 40;
      bestIntent = canonical;
    }
    const aliases = skillIntentAliases(canonical);
    for (const alias of aliases) {
      if (normalizedRequest.includes(alias)) {
        score += 18;
        bestIntent = canonical;
      }
    }
  }
  const corpus = normalizeCommandText(`${skill.id} ${skill.name} ${skill.description}`);
  for (const token of normalizedRequest.split(" ").filter((part) => part.length > 2)) {
    if (corpus.includes(token)) {
      score += 3;
    }
  }
  if (score > 0) {
    score += riskLevelRank(skill.riskLevel) * 2;
  }
  return { skill, score, intent: bestIntent, reason: routeReasonForIntent(bestIntent) };
}

function normalizeCommandText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function canonicalSkillIntent(intent: string): string {
  const normalized = normalizeCommandText(intent).replace(/\s/gu, "_");
  if (["publish", "push", "pull_request", "open_source", "release"].includes(normalized)) return "publish";
  if (["cleanup", "refactor", "remove_unused", "organize_repo"].includes(normalized)) return "repo_cleanup";
  if (["security", "secret_scan", "privacy", "leak_check"].includes(normalized)) return "security";
  if (["memory", "context", "lesson", "retrieve"].includes(normalized)) return "memory";
  if (["migrate", "json_to_sqlite", "storage_upgrade"].includes(normalized)) return "migration";
  if (["readme", "docs", "documentation", "publish_docs"].includes(normalized)) return "documentation";
  if (["doctor", "health_check", "validate_setup"].includes(normalized)) return "doctor";
  if (["adapter", "agent_adapter", "plugin"].includes(normalized)) return "adapter";
  return normalized || "unknown";
}

function skillIntentAliases(intent: string): string[] {
  switch (intent) {
    case "publish":
      return ["publish", "push", "pull request", "pr", "open source", "release", "remote"];
    case "repo_cleanup":
      return ["cleanup", "clean up", "refactor", "unused", "organize", "stabilize"];
    case "security":
      return ["security", "secret", "privacy", "leak", "protected file"];
    case "memory":
      return ["memory", "context", "lesson", "retrieve"];
    case "migration":
      return ["migrate", "migration", "json", "sqlite", "storage"];
    case "documentation":
      return ["docs", "documentation", "readme", "commands"];
    case "doctor":
      return ["doctor", "health", "validate", "diagnose"];
    case "adapter":
      return ["adapter", "agent", "plugin", "connector"];
    default:
      return [];
  }
}

function routeReasonForIntent(intent: string): string {
  switch (intent) {
    case "publish":
      return "Publishing, pushing, PR, open-source, or release work requires publish checks first.";
    case "repo_cleanup":
      return "The request is about cleanup or refactoring while preserving behavior.";
    case "security":
      return "Security or secret-handling wording has priority because unsafe context can leak data.";
    case "memory":
      return "The request asks for memory or context retrieval through privacy gates.";
    case "migration":
      return "The request involves JSON, SQLite, storage, or migration behavior.";
    case "documentation":
      return "The request is documentation-oriented.";
    case "doctor":
      return "The request is a system health or validation check.";
    case "adapter":
      return "The request concerns adapter or agent integration boundaries.";
    default:
      return "The request matched registered skill metadata.";
  }
}

function riskLevelRank(risk: string): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  if (risk === "low") return 1;
  return 0;
}

function policyGatesForSkill(skill: LmtiSkillDefinition): string[] {
  if (!skill.requiresPolicy) {
    return [];
  }
  switch (skill.id) {
    case "publish-preflight":
      return ["GitRemotePolicy", "BranchHistoryPolicy", "ProtectedFilesPolicy", "SecretLeakPolicy"];
    case "security-check":
      return ["SecretLeakPolicy", "PrivacyBoundaryPolicy", "ProtectedFilesPolicy"];
    case "migration-from-json":
      return ["MigrationDryRunPolicy", "SecretImportPolicy", "StorageBackupPolicy"];
    case "repo-cleanup":
      return ["ProtectedFilesPolicy", "BehaviorPreservationPolicy"];
    case "adapter":
      return ["AdapterManifestPolicy", "SandboxScopePolicy"];
    default:
      return ["DefaultSafetyPolicy"];
  }
}

function recommendedCommandsForSkill(skill: LmtiSkillDefinition, intent: string): string[] {
  switch (skill.id) {
    case "publish-preflight":
      return ["lmti publish check"];
    case "repo-cleanup":
      return ["lmti skill show repo-cleanup", "lmti cleanup check"];
    case "security-check":
      return ["lmti doctor --security --json", "lmti publish check --json"];
    case "memory-retrieval":
      return [`lmti memory retrieve --intent ${intent} --json`];
    case "migration-from-json":
      return ["lmti migrate from-json --dry-run", "lmti migrate from-json"];
    case "documentation":
      return ["lmti skill show documentation"];
    case "doctor":
      return ["lmti doctor --json"];
    case "adapter":
      return ["lmti skill show adapter", "lmti agent inspect --json"];
    default:
      return [`lmti skill show ${skill.id}`];
  }
}

async function loadSkillContentCommand(cwd: string, id: string): Promise<{ status: CliStatus; warnings: CliBoundaryMessage[]; errors: CliBoundaryMessage[]; data: { skill?: LmtiSkillDefinition; content: string } }> {
  const registry = await readSkillRegistry(cwd);
  const skill = registry.find((item) => item.id === id);
  if (!skill) {
    return {
      status: "error",
      warnings: [],
      errors: [{ code: "THOTH_SKILL_NOT_FOUND", message: "Skill id was not found in skills/registry.toml." }],
      data: { content: "" }
    };
  }
  const skillPath = path.resolve(cwd, skill.file);
  assertPathInsideCwd(cwd, skillPath, "skill file");
  const statResult = await fs.stat(skillPath);
  if (statResult.size > 128 * 1024) {
    return {
      status: "error",
      warnings: [],
      errors: [{ code: "THOTH_SKILL_INVALID", message: `${skill.file} is unusually large for a skill.md file.` }],
      data: { skill, content: "" }
    };
  }
  const content = await fs.readFile(skillPath, "utf8");
  const scan = runEgressSecretScan(content);
  if (scan.blocked) {
    return {
      status: "blocked",
      warnings: [],
      errors: [{ code: "SECRET_DETECTED", message: `${skill.file} contains secret-like material and will not be printed.` }],
      data: { skill, content: "" }
    };
  }
  return { status: "pass", warnings: [], errors: [], data: { skill, content } };
}

async function validateSkillsCommand(cwd: string): Promise<{ status: CliStatus; warnings: CliBoundaryMessage[]; errors: CliBoundaryMessage[]; data: { skillsChecked: number; checks: Array<{ check: string; status: CliStatus; detail: string }> } }> {
  const checks: Array<{ check: string; status: CliStatus; detail: string }> = [];
  let registry: LmtiSkillDefinition[] = [];
  try {
    registry = await readSkillRegistry(cwd);
    checks.push({ check: "registry", status: "pass", detail: `${registry.length} skills registered` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      warnings: [],
      errors: [{ code: "THOTH_REGISTRY_MISSING", message }],
      data: { skillsChecked: 0, checks: [{ check: "registry", status: "error", detail: message }] }
    };
  }

  const duplicateIds = registry.map((skill) => skill.id).filter((id, index, ids) => ids.indexOf(id) !== index);
  checks.push({
    check: "duplicate_ids",
    status: duplicateIds.length > 0 ? "error" : "pass",
    detail: duplicateIds.length > 0 ? `duplicate ids: ${Array.from(new Set(duplicateIds)).join(", ")}` : "no duplicate skill ids"
  });

  const requiredSections = ["Purpose", "When to use", "Inputs needed", "Required commands", "Safety rules", "Block conditions", "Output expected"];
  for (const skill of registry) {
    const result = await loadSkillContentCommand(cwd, skill.id);
    if (result.errors.length > 0) {
      checks.push({ check: `skill:${skill.id}`, status: result.status, detail: result.errors.map((error) => error.message).join("; ") });
      continue;
    }
    const missing = requiredSections.filter((section) => !new RegExp(`^##\\s+${escapeRegExp(section)}\\b`, "imu").test(result.data.content));
    checks.push({
      check: `skill:${skill.id}`,
      status: missing.length > 0 ? "warn" : "pass",
      detail: missing.length > 0 ? `missing sections: ${missing.join(", ")}` : "required sections present"
    });
  }

  const errors = checks.filter((check) => check.status === "error").map((check) => ({ code: "THOTH_SKILL_INVALID", message: check.detail }));
  const warnings = checks.filter((check) => check.status === "warn").map((check) => ({ code: "THOTH_SKILL_INVALID", message: check.detail }));
  return {
    status: errors.length > 0 ? "error" : warnings.length > 0 ? "warn" : "pass",
    warnings,
    errors,
    data: { skillsChecked: registry.length, checks }
  };
}

function printSkillRoute(outcome: LmtiSkillRouteOutcome): void {
  const selected = outcome.result.selectedSkill;
  const lines = [
    "LMTI Skill Route",
    "",
    `Intent: ${outcome.result.intent}`,
    `Selected skill: ${selected ? selected.id : "none"}`,
    `Reason: ${outcome.result.reason}`,
    `Result: ${outcome.status.toUpperCase()}`
  ];
  if (outcome.result.recommendedCommands.length > 0) {
    lines.push("", "Recommended commands:", ...outcome.result.recommendedCommands.map((command) => `- ${command}`));
  }
  printSafeText(lines.join("\n"));
}

function printSkillHelp(): void {
  printSafeText(`Usage:
  lmti skill list [--json]
  lmti skill route "<task>" [--json]
  lmti skill show <skill-id> [--json]
  lmti skill validate [--json]

Description:
  Selects and loads skill.md instructions. These commands do not modify files.`);
}

function printThothHelp(): void {
  printSafeText(`Usage:
  lmti thoth <list|route|explain|show|inspect|validate|doctor> [--json]

Description:
  Advanced skill-routing commands. Thoth routes skills only; it does not execute tasks.`);
}

function evaluatePolicyAction(action: string, paths: string[], cwd: string): { status: CliStatus; warnings: CliBoundaryMessage[]; errors: CliBoundaryMessage[]; data: { action: string; decision: string; paths: string[] } } {
  const normalized = action.trim().toLowerCase();
  const protectedPaths = paths.filter((entry) => isProtectedCommandPath(path.relative(cwd, path.resolve(cwd, entry))));
  if (protectedPaths.length > 0) {
    return {
      status: "blocked",
      warnings: [],
      errors: [{ code: "PROTECTED_FILE_DETECTED", message: "Protected file path is not allowed through the safety gate." }],
      data: { action: normalized, decision: "block", paths: protectedPaths }
    };
  }
  const highRisk = new Set(["publish", "push", "pull_request", "deploy", "migration", "memory_export", "database_migration", "destructive_cleanup"]);
  if (highRisk.has(normalized)) {
    return {
      status: "warn",
      warnings: [{ code: "POLICY_APPROVAL_REQUIRED", message: "High-risk action requires explicit safety gate approval." }],
      errors: [],
      data: { action: normalized, decision: "require_user_approval", paths }
    };
  }
  return { status: "pass", warnings: [], errors: [], data: { action: normalized, decision: "allow", paths } };
}

function isProtectedCommandPath(filePath: string): boolean {
  return /(^|[/\\])\.env(?:$|[./\\_-])|(^|[/\\])secrets([/\\]|$)|\.(?:pem|key|p12|pfx|token)$/iu.test(filePath);
}

async function inspectConfigCommand(cwd: string, customPath?: string): Promise<{ warnings: CliBoundaryMessage[]; errors: CliBoundaryMessage[]; data: { exists: boolean; path?: string; format?: "toml" | "json"; sections: string[]; keys: string[] } }> {
  const candidates = customPath
    ? [path.resolve(cwd, customPath)]
    : [path.join(cwd, ".lmti", "config.toml"), path.join(cwd, ".lmti", "config.json")];
  let foundPath: string | undefined;
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      foundPath = candidate;
      break;
    }
  }
  if (!foundPath) {
    return {
      warnings: [],
      errors: [{ code: "CONFIG_INVALID", message: "No LMTI config file was found." }],
      data: { exists: false, sections: [], keys: [] }
    };
  }
  assertPathInsideCwd(cwd, foundPath, "config");
  const content = await fs.readFile(foundPath, "utf8");
  const format = foundPath.endsWith(".toml") ? "toml" : "json";
  const warnings: CliBoundaryMessage[] = [];
  const errors: CliBoundaryMessage[] = [];
  const scan = runEgressSecretScan(content);
  if (scan.blocked) {
    warnings.push({ code: "SECRET_DETECTED", message: "Config contains secret-like material; raw values were not printed." });
  }
  let sections: string[] = [];
  let keys: string[] = [];
  if (format === "json") {
    try {
      const parsed = JSON.parse(content) as unknown;
      keys = isRecord(parsed) ? Object.keys(parsed).sort() : [];
      warnings.push({ code: "CONFIG_INVALID", message: "JSON config is supported for the current TypeScript CLI, but TOML is the target human config format." });
    } catch {
      errors.push({ code: "CONFIG_INVALID", message: "Config JSON is invalid." });
    }
  } else {
    sections = Array.from(content.matchAll(/^\s*\[([^\]]+)\]\s*$/gmu)).map((match) => match[1]).sort();
    keys = Array.from(content.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=/gmu)).map((match) => match[1]).sort();
  }
  return {
    warnings,
    errors,
    data: {
      exists: true,
      path: normalizeGitPath(path.relative(cwd, foundPath)),
      format,
      sections,
      keys
    }
  };
}

async function readPublishIdentity(cwd: string): Promise<{ declaredRepos: string[]; sources: string[] }> {
  const layer = await readJsonFileIfExists(path.join(cwd, ".lmti", "layer.json"));
  const packageJson = await readJsonFileIfExists(path.join(cwd, "package.json"));
  const declaredRepos: string[] = [];
  const sources: string[] = [];
  const layerRepo = stringRecordValue(layer, "publish_repository");
  const packageRepo = packageRepositoryUrl(packageJson);
  if (layerRepo) {
    declaredRepos.push(layerRepo);
    sources.push(".lmti/layer.json:publish_repository");
  }
  if (packageRepo) {
    declaredRepos.push(packageRepo);
    sources.push("package.json:repository.url");
  }
  return { declaredRepos, sources };
}

function createRepositoryIdentityCheck(identity: { declaredRepos: string[]; sources: string[] }, publicRepo?: string): PublishPreflightCheck {
  if (!publicRepo) {
    return {
      name: "repository_identity",
      title: "Repository identity",
      status: "error",
      message: "Repository identity cannot be verified without a publish target.",
      fix: "Declare the public LMTI publish repository before creating a public PR or release."
    };
  }
  if (identity.declaredRepos.length === 0) {
    return {
      name: "repository_identity",
      title: "Repository identity",
      status: "warn",
      message: "No repository identity metadata was found in .lmti/layer.json or package.json.",
      fix: "Add publish_repository to .lmti/layer.json or repository.url to package.json."
    };
  }
  const target = normalizeRepoLocator(publicRepo);
  const matches = identity.declaredRepos.some((repo) => normalizeRepoLocator(repo) === target);
  return matches
    ? {
        name: "repository_identity",
        title: "Repository identity",
        status: "pass",
        message: `Repository metadata matches publish target via ${identity.sources.join(", ")}.`
      }
    : {
        name: "repository_identity",
        title: "Repository identity",
        status: "error",
        message: "Repository metadata does not match the configured publish target.",
        fix: "Fix repository metadata before publishing so agents do not confuse private/internal and public repository identity."
      };
}

function createRemoteOriginCheck(currentOrigin: string | undefined, config: PublishPreflightConfig): PublishPreflightCheck {
  if (!currentOrigin) {
    return {
      name: "remote_origin",
      title: "Remote origin",
      status: "error",
      message: "Git remote origin is missing.",
      fix: "Add the correct public origin remote or run from a clone that has origin configured."
    };
  }
  if (!config.publicRepo) {
    return {
      name: "remote_origin",
      title: "Remote origin",
      status: "error",
      message: "Origin cannot be verified because no publish target is configured.",
      fix: "Declare publish.publicRepo before pushing or opening a public PR."
    };
  }
  const normalizedOrigin = normalizeRepoLocator(currentOrigin);
  const normalizedTarget = normalizeRepoLocator(config.publicRepo);
  if (normalizedOrigin === normalizedTarget) {
    return {
      name: "remote_origin",
      title: "Remote origin",
      status: "pass",
      message: "Origin matches configured public repo."
    };
  }
  const matchedPrivatePattern = config.privateRepoPatterns.find((pattern) => normalizedOrigin.includes(pattern.toLowerCase()));
  return {
    name: "remote_origin",
    title: "Remote origin",
    status: "error",
    message: matchedPrivatePattern
      ? `Origin appears to point at a private/internal or legacy repo pattern (${matchedPrivatePattern}) instead of the publish target.`
      : "Origin does not match the configured public publish repo.",
    fix: "Confirm the intended public repo remote. Do not change remotes automatically; ask the owner to approve the safe recovery path."
  };
}

function createBranchSafetyCheck(currentBranch: string | undefined, allowedBranches: string[]): PublishPreflightCheck {
  if (!currentBranch) {
    return {
      name: "branch_safety",
      title: "Branch safety",
      status: "error",
      message: "Current checkout is detached or branch name could not be resolved.",
      fix: "Checkout a named publish branch created from the target branch before publishing."
    };
  }
  if (allowedBranches.some((pattern) => matchesBranchPattern(currentBranch, pattern))) {
    return {
      name: "branch_safety",
      title: "Branch safety",
      status: "pass",
      message: `Branch ${currentBranch} matches allowed publish patterns.`
    };
  }
  return {
    name: "branch_safety",
    title: "Branch safety",
    status: "warn",
    message: `Branch ${currentBranch} does not match allowed publish patterns: ${allowedBranches.join(", ")}.`,
    fix: "Use main, release/*, publish/*, or a configured publish branch pattern for public PR/release work."
  };
}

function createDivergenceCheck(cwd: string, targetRef: string, hasCommonHistory: boolean): PublishPreflightCheck {
  if (!hasCommonHistory) {
    return {
      name: "commit_divergence",
      title: "Branch divergence",
      status: "error",
      message: `Cannot compute ahead/behind because HEAD has no common ancestor with ${targetRef}.`,
      fix: `Recreate the branch from ${targetRef} before opening a PR.`
    };
  }
  const divergence = runGit(cwd, ["rev-list", "--left-right", "--count", `HEAD...${targetRef}`]);
  if (!divergence.ok) {
    return {
      name: "commit_divergence",
      title: "Branch divergence",
      status: "error",
      message: `Could not compute ahead/behind against ${targetRef}.`,
      fix: "Fetch the target branch and rerun publish preflight."
    };
  }
  const [aheadText, behindText] = divergence.stdout.trim().split(/\s+/u);
  const ahead = Number(aheadText ?? "0");
  const behind = Number(behindText ?? "0");
  if (ahead === 0 && behind === 0) {
    return {
      name: "commit_divergence",
      title: "Branch divergence",
      status: "pass",
      message: `Ahead 0 commits, behind 0 commits against ${targetRef}.`
    };
  }
  return {
    name: "commit_divergence",
    title: "Branch divergence",
    status: "warn",
    message: `Ahead ${Number.isFinite(ahead) ? ahead : 0} commits, behind ${Number.isFinite(behind) ? behind : 0} commits against ${targetRef}.`,
    fix: "Review divergence before publishing. Rebase/merge only after owner-approved branch hygiene for the release or PR flow."
  };
}

function createWorkingTreeCheck(statusOk: boolean, statusEntries: GitStatusEntry[]): PublishPreflightCheck {
  if (!statusOk) {
    return {
      name: "dirty_working_tree",
      title: "Working tree",
      status: "error",
      message: "Could not inspect Git working tree status.",
      fix: "Run git status locally, resolve Git errors, and rerun publish preflight."
    };
  }
  if (statusEntries.length === 0) {
    return {
      name: "dirty_working_tree",
      title: "Working tree",
      status: "pass",
      message: "No uncommitted changes."
    };
  }
  const states = summarizeFileStates(statusEntries);
  return {
    name: "dirty_working_tree",
    title: "Working tree",
    status: "warn",
    message: `${statusEntries.length} changed path(s): ${states}.`,
    fix: "Commit, stash, or intentionally remove local changes before publishing."
  };
}

function createProtectedFilesCheck(statusEntries: GitStatusEntry[], trackedFiles: string[], protectedPaths: string[]): PublishPreflightCheck {
  const stateByPath = new Map<string, string>();
  for (const entry of statusEntries) {
    stateByPath.set(normalizeGitPath(entry.path), entry.state);
  }
  for (const file of trackedFiles) {
    const normalized = normalizeGitPath(file);
    if (!stateByPath.has(normalized)) {
      stateByPath.set(normalized, "tracked");
    }
  }

  const protectedMatches = Array.from(stateByPath.entries())
    .filter(([file]) => protectedPaths.some((pattern) => matchesProtectedPath(file, pattern)))
    .map(([file, state]) => `${file} (${state})`);

  if (protectedMatches.length === 0) {
    return {
      name: "protected_files",
      title: "Protected files",
      status: "pass",
      message: "No protected files detected in tracked, staged, unstaged, or untracked paths."
    };
  }
  return {
    name: "protected_files",
    title: "Protected files",
    status: "error",
    message: `Protected path(s) detected: ${protectedMatches.join(", ")}.`,
    fix: "Remove protected files from the publish branch and keep secrets/private memory out of Git before publishing."
  };
}

async function createLmtiIdentityCheck(cwd: string): Promise<PublishPreflightCheck> {
  const layerPath = path.join(cwd, ".lmti", "layer.json");
  const layer = await readJsonFileIfExists(layerPath);
  if (isRecord(layer) && layer.type === "independent_agent_layer") {
    return {
      name: "lmti_layer_identity",
      title: "LMTI layer identity",
      status: "pass",
      message: "LMTI detected as an independent agent memory/context layer."
    };
  }
  if (await pathExists(path.join(cwd, ".lmti"))) {
    return {
      name: "lmti_layer_identity",
      title: "LMTI layer identity",
      status: "warn",
      message: ".lmti exists but layer identity metadata is missing or incomplete.",
      fix: "Add .lmti/layer.json metadata that states LMTI is an independent layer, not application runtime."
    };
  }
  return {
    name: "lmti_layer_identity",
    title: "LMTI layer identity",
    status: "warn",
    message: "No .lmti layer metadata was found; independent LMTI boundary could not be verified.",
    fix: "Initialize or attach LMTI metadata before publishing the LMTI repository."
  };
}

async function createPackageMetadataCheck(cwd: string): Promise<PublishPreflightCheck> {
  const packageJson = await readJsonFileIfExists(path.join(cwd, "package.json"));
  if (!isRecord(packageJson)) {
    return {
      name: "package_metadata",
      title: "Package metadata",
      status: "warn",
      message: "package.json was not found; package metadata could not be checked.",
      fix: "Add package metadata or document why this repository is not package-distributed."
    };
  }
  const missing: string[] = [];
  if (!stringRecordValue(packageJson, "description")) {
    missing.push("description");
  }
  if (!packageRepositoryUrl(packageJson)) {
    missing.push("repository");
  }
  if (!stringRecordValue(packageJson, "author")) {
    missing.push("author");
  }
  if (!stringRecordValue(packageJson, "license")) {
    missing.push("license");
  }
  return missing.length === 0
    ? {
        name: "package_metadata",
        title: "Package metadata",
        status: "pass",
        message: "Package metadata includes description, repository, author, and license."
      }
    : {
        name: "package_metadata",
        title: "Package metadata",
        status: "warn",
        message: `Package metadata is missing: ${missing.join(", ")}.`,
        fix: "Complete package metadata before public release; license may remain pending only before final public publish."
      };
}

async function createOpenSourceDocsCheck(cwd: string): Promise<PublishPreflightCheck> {
  const required = ["README.md", "LICENSE", "SECURITY.md"];
  const missing: string[] = [];
  for (const fileName of required) {
    if (!(await pathExists(path.join(cwd, fileName)))) {
      missing.push(fileName);
    }
  }
  return missing.length === 0
    ? {
        name: "open_source_docs",
        title: "Open-source docs",
        status: "pass",
        message: "README, LICENSE, and SECURITY files are present."
      }
    : {
        name: "open_source_docs",
        title: "Open-source docs",
        status: "error",
        message: `Missing required public release document(s): ${missing.join(", ")}.`,
        fix: "Add README, LICENSE, and SECURITY before public release or PR publication."
      };
}

interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface GitStatusEntry {
  path: string;
  state: string;
}

function runGit(cwd: string, args: string[]): GitCommandResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  return {
    ok: exitCode === 0 && !result.error,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? result.error?.message ?? ""),
    exitCode
  };
}

function parseGitStatus(output: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];
  for (const line of output.split(/\r?\n/u).filter((entry) => entry.length > 0)) {
    if (line.startsWith("?? ")) {
      entries.push({ path: line.slice(3), state: "untracked" });
      continue;
    }
    const indexStatus = line[0] ?? " ";
    const workTreeStatus = line[1] ?? " ";
    const rawPath = line.slice(3);
    const state = indexStatus !== " " && workTreeStatus !== " " ? "staged+unstaged" : indexStatus !== " " ? "staged" : "unstaged";
    for (const filePath of rawPath.split(" -> ")) {
      if (filePath.trim()) {
        entries.push({ path: filePath.trim(), state });
      }
    }
  }
  return entries;
}

function summarizeFileStates(entries: GitStatusEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.state, (counts.get(entry.state) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([state, count]) => `${state}=${count}`)
    .join(", ");
}

function matchesBranchPattern(branch: string, pattern: string): boolean {
  if (pattern === branch) {
    return true;
  }
  if (!pattern.includes("*")) {
    return false;
  }
  return globPatternToRegExp(pattern).test(branch);
}

function matchesProtectedPath(filePath: string, pattern: string): boolean {
  return globPatternToRegExp(normalizeGitPath(pattern)).test(normalizeGitPath(filePath));
}

function globPatternToRegExp(pattern: string): RegExp {
  const normalized = normalizeGitPath(pattern);
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 2;
      continue;
    }
    if (normalized.startsWith("**", index)) {
      source += ".*";
      index += 1;
      continue;
    }
    const char = normalized[index];
    source += char === "*" ? "[^/]*" : escapeRegExp(char);
  }
  return new RegExp(`^${source}$`, "iu");
}

function normalizeGitPath(filePath: string): string {
  return filePath.replace(/^"|"$/gu, "").replace(/\\/g, "/").replace(/^\.\//u, "");
}

function normalizeRepoLocator(locator: string): string {
  let normalized = locator.trim().replace(/^git\+/iu, "");
  normalized = normalized.replace(/^(https?:\/\/)[^/@\s]+@/iu, "$1");
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/iu);
  if (sshMatch) {
    normalized = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  normalized = normalized.replace(/\\/g, "/").replace(/\.git$/iu, "").replace(/\/+$/u, "");
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(normalized)) {
    normalized = path.resolve(normalized).replace(/\\/g, "/").replace(/\.git$/iu, "").replace(/\/+$/u, "");
  }
  return normalized.toLowerCase();
}

function sanitizeRepoLocator(locator: string): string {
  return locator.trim().replace(/^(https?:\/\/)[^/@\s]+@/iu, "$1[redacted]@").replace(/\.git$/iu, "");
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function getPublishBlock(value: unknown): {
  publicRepo?: string;
  privateRepoPatterns: string[];
  targetBranch?: string;
  allowedPublishBranches: string[];
  protectedPaths: string[];
} {
  const publish = isRecord(value) && isRecord(value.publish) ? value.publish : undefined;
  return {
    publicRepo: stringRecordValue(publish, "publicRepo"),
    privateRepoPatterns: stringArrayRecordValue(publish, "privateRepoPatterns"),
    targetBranch: stringRecordValue(publish, "targetBranch"),
    allowedPublishBranches: stringArrayRecordValue(publish, "allowedPublishBranches"),
    protectedPaths: stringArrayRecordValue(publish, "protectedPaths")
  };
}

function packageRepositoryUrl(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.repository === "string") {
    return value.repository;
  }
  if (isRecord(value.repository)) {
    return stringRecordValue(value.repository, "url");
  }
  return undefined;
}

async function readJsonFileIfExists(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringRecordValue(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === "string" && value[key].trim() ? value[key].trim() : undefined;
}

function stringArrayRecordValue(value: unknown, key: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return [];
  }
  return value[key].filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function createLatencyTracker(): { mark: (phase: string) => void; phases: () => Record<string, number>; totalMs: () => number } {
  const startedAt = Date.now();
  let lastMark = startedAt;
  const phaseLatencyMs: Record<string, number> = {};

  return {
    mark(phase: string) {
      const now = Date.now();
      phaseLatencyMs[phase] = now - lastMark;
      lastMark = now;
    },
    phases() {
      return { ...phaseLatencyMs };
    },
    totalMs() {
      return Date.now() - startedAt;
    }
  };
}

async function loadAdapterManifest(cwd: string, manifestPath?: string, adapterId?: string): Promise<AdapterManifest> {
  if (adapterId) {
    return createKnownAdapterManifest(adapterId);
  }
  if (!manifestPath) {
    return DEFAULT_PREFLIGHT_ADAPTER_MANIFEST;
  }

  const resolved = path.resolve(cwd, manifestPath);
  assertPathInsideCwd(cwd, resolved, "adapter manifest");
  const parsed = JSON.parse(await fs.readFile(resolved, "utf8")) as Partial<AdapterManifest>;
  return normalizeAdapterManifest(parsed);
}

function createKnownAdapterManifest(adapterId: string): AdapterManifest {
  const normalized = adapterId.trim().toLowerCase();
  if (!KNOWN_ADAPTERS.has(normalized)) {
    throw new Error(`Unknown adapter: ${adapterId}`);
  }
  return {
    ...DEFAULT_PREFLIGHT_ADAPTER_MANIFEST,
    id: normalized,
    name: `${normalized} adapter`,
    privacy: { ...DEFAULT_ADAPTER_PRIVACY_PROFILE }
  };
}

function normalizeAdapterManifest(input: Partial<AdapterManifest>): AdapterManifest {
  if (!input.id || !input.name || !input.version || !input.kind || !Array.isArray(input.scopes) || !input.sandbox) {
    throw new Error("Invalid adapter manifest: id, name, version, kind, scopes and sandbox are required.");
  }
  if (!["model", "tool", "plugin"].includes(input.kind)) {
    throw new Error(`Invalid adapter manifest kind: ${input.kind}`);
  }
  if (!["none", "read", "write"].includes(input.sandbox.filesystem)) {
    throw new Error(`Invalid adapter sandbox filesystem mode: ${input.sandbox.filesystem}`);
  }

  return {
    id: input.id,
    name: input.name,
    version: input.version,
    kind: input.kind,
    scopes: Array.from(new Set(input.scopes)),
    privacy: normalizeAdapterPrivacyProfile(input.privacy),
    sandbox: {
      network: Boolean(input.sandbox.network),
      filesystem: input.sandbox.filesystem,
      allowMemoryStore: Boolean(input.sandbox.allowMemoryStore),
      timeoutMs: Number(input.sandbox.timeoutMs)
    }
  };
}

function normalizeAdapterPrivacyProfile(input?: Partial<AdapterPrivacyProfile>): AdapterPrivacyProfile {
  const defaultModelTarget = input?.defaultModelTarget === "local" ? "local" : "external_model";
  return {
    allowRawSecret: Boolean(input?.allowRawSecret),
    allowRawConfidential: Boolean(input?.allowRawConfidential),
    requiresEgressScan: input?.requiresEgressScan !== false,
    defaultModelTarget
  };
}

function runAdapterSandbox(input: {
  manifest: AdapterManifest;
  contextPackage: ContextPackage;
  egressBlocked: boolean;
}): AdapterSandboxResult {
  const deniedReasons = validateAdapterManifestScope(input.manifest);
  if (input.egressBlocked) {
    deniedReasons.push("egress_scan_blocked");
  }

  const allowed = deniedReasons.length === 0;
  return {
    allowed,
    adapterId: input.manifest.id,
    manifest: input.manifest,
    deniedReasons,
    deliveredContextPackageId: allowed ? input.contextPackage.id : undefined,
    deliveredPolicyDecisionIds: allowed ? input.contextPackage.policyDecisionIds : []
  };
}

function validateAdapterManifestScope(manifest: AdapterManifest): string[] {
  const deniedReasons: string[] = [];
  const scopes = new Set(manifest.scopes);

  if (!scopes.has("context:read")) {
    deniedReasons.push("missing_context_read_scope");
  }
  if (!manifest.privacy.requiresEgressScan) {
    deniedReasons.push("egress_scan_required");
  }
  if (manifest.privacy.allowRawSecret) {
    deniedReasons.push("raw_secret_adapter_output_forbidden");
  }
  if (manifest.privacy.allowRawConfidential) {
    deniedReasons.push("raw_confidential_adapter_output_forbidden");
  }

  for (const forbidden of ["memory:read", "memory:write", "secret:read", "audit:read"] as const) {
    if (scopes.has(forbidden)) {
      deniedReasons.push(`forbidden_scope_${forbidden}`);
    }
  }

  const unsupportedScopes = manifest.scopes.filter((scope) => scope !== "context:read");
  for (const scope of unsupportedScopes) {
    if (!scope.startsWith("memory:") && scope !== "secret:read" && scope !== "audit:read") {
      deniedReasons.push(`unsupported_mvp_scope_${scope}`);
    }
  }

  if (manifest.sandbox.allowMemoryStore) {
    deniedReasons.push("direct_memory_store_access_forbidden");
  }
  if (manifest.sandbox.network) {
    deniedReasons.push("network_sandbox_disabled_for_mvp");
  }
  if (manifest.sandbox.filesystem !== "none") {
    deniedReasons.push("filesystem_sandbox_disabled_for_mvp");
  }
  if (!Number.isFinite(manifest.sandbox.timeoutMs) || manifest.sandbox.timeoutMs < 1 || manifest.sandbox.timeoutMs > 30_000) {
    deniedReasons.push("invalid_or_excessive_timeout");
  }

  return Array.from(new Set(deniedReasons));
}

function rankPolicySafeMemoryForPreflight(memory: PolicySafeMemoryResult[], intent: InferredIntent, includeLowScore: boolean): PolicySafeMemoryResult[] {
  const minScore = includeLowScore ? 1 : 3;
  return memory
    .map((entry) => {
      const scored = scorePolicySafeMemory(entry, intent);
      return {
        ...entry,
        score: scored.score,
        why: [...entry.why, ...scored.why]
      };
    })
    .filter((entry) => entry.score >= minScore)
    .sort((left, right) => right.score - left.score || right.metadata.importance - left.metadata.importance)
    .slice(0, 16);
}

function scorePolicySafeMemory(memory: PolicySafeMemoryResult, intent: InferredIntent): { score: number; why: string[] } {
  const corpus = normalizeForPreflight(memory.scoreInputs.join(" "));
  let score = 0;
  const why: string[] = [];

  if (intent.primaryIntent !== "unknown" && corpus.includes(normalizeForPreflight(intent.primaryIntent))) {
    score += 4;
    why.push(`matched primary intent ${intent.primaryIntent}`);
  }

  for (const secondary of intent.secondaryIntents) {
    if (corpus.includes(normalizeForPreflight(secondary))) {
      score += 2;
      why.push(`matched secondary intent ${secondary}`);
    }
  }

  let keywordWeight = 0;
  for (const keyword of intent.keywords) {
    const normalized = normalizeForPreflight(keyword);
    if (normalized && corpus.includes(normalized)) {
      keywordWeight += normalized.length > 3 ? 2 : 1;
    }
  }
  if (keywordWeight > 0) {
    score += keywordWeight;
    why.push(`matched ${keywordWeight} keyword weight`);
  }

  let penalty = 0;
  for (const keyword of intent.negativeKeywords) {
    const normalized = normalizeForPreflight(keyword);
    if (normalized && corpus.includes(normalized)) {
      penalty += 5;
    }
  }
  if (penalty > 0) {
    score -= penalty;
    why.push(`penalized ${penalty} negative keyword weight`);
  }

  score += Math.round(memory.metadata.importance * 2);
  score += Math.round((memory.metadata.priorityScore ?? 0) * 3);
  score += Math.round((memory.metadata.baseActivation ?? 0) * 0.5);
  return { score: Math.max(0, score), why };
}

function policySafeMemoryToSearchResult(memory: PolicySafeMemoryResult): MemorySearchResult {
  return {
    record: {
      id: memory.metadata.id,
      scope: memory.metadata.scope,
      kind: memory.metadata.kind,
      title: memory.metadata.title,
      content: memory.safeContent ?? memory.safeSummary ?? "",
      projectId: memory.metadata.projectId,
      sourceRefs: memory.metadata.sourceRefs,
      tags: memory.metadata.tags,
      importance: memory.metadata.importance,
      confidence: memory.metadata.confidence,
      sensitivity: memory.metadata.sensitivity,
      promptPolicy: memory.metadata.promptPolicy,
      createdAt: memory.metadata.createdAt,
      updatedAt: memory.metadata.updatedAt,
      expiresAt: memory.metadata.expiresAt,
      memoryStrength: memory.metadata.memoryStrength,
      baseActivation: memory.metadata.baseActivation,
      retrievalCount: memory.metadata.retrievalCount,
      lastRetrievedAt: memory.metadata.lastRetrievedAt,
      lastReinforcedAt: memory.metadata.lastReinforcedAt,
      decayRate: memory.metadata.decayRate,
      stability: memory.metadata.stability,
      priorityScore: memory.metadata.priorityScore,
      contextCues: memory.metadata.contextCues,
      supersededBy: memory.metadata.supersededBy,
      status:
        memory.metadata.status === "active" ||
        memory.metadata.status === "weak" ||
        memory.metadata.status === "archived" ||
        memory.metadata.status === "superseded"
          ? memory.metadata.status
          : "active",
      nextReviewAt: memory.metadata.nextReviewAt,
      reviewIntervalDays: memory.metadata.reviewIntervalDays,
      easinessFactor: memory.metadata.easinessFactor,
      reviewCount: memory.metadata.reviewCount,
      version: memory.metadata.version
    },
    score: memory.score,
    activation: memory.metadata.baseActivation,
    baseActivation: memory.metadata.baseActivation,
    priorityScore: memory.metadata.priorityScore,
    mode: memory.mode,
    promptPolicy: memory.metadata.promptPolicy,
    why: memory.why
  };
}

function detectPreflightRiskSignals(blockedMemories: BlockedMemory[], selectedMemories: PolicySafeMemoryResult[]): string[] {
  const signals = new Set<string>();
  for (const blocked of blockedMemories) {
    signals.add(`blocked_${blocked.reason}`);
  }
  if (selectedMemories.some((memory) => memory.mode === "summary" || memory.mode === "metadata_only")) {
    signals.add("raw_memory_withheld");
  }
  if (selectedMemories.length === 0) {
    signals.add("no_policy_safe_memory_selected");
  }
  return Array.from(signals);
}

function generateMvpContextCandidates(
  requestId: string,
  selectedMemories: PolicySafeMemoryResult[],
  blockedMemories: BlockedMemory[],
  riskSignals: string[]
): ContextCandidate[] {
  const policyDecisionIds = selectedMemories.map((memory) => memory.policyDecisionId);
  const missingPolicyDecision = policyDecisionIds.some((id) => id.startsWith("missing-policy-decision:"));
  const minimal: ContextCandidate = {
    id: `${requestId}:minimal_safe`,
    strategy: "minimal_safe",
    memoryIds: [],
    policyDecisionIds: [],
    tokenEstimate: estimateTokens([...riskSignals, ...blockedMemories.map((memory) => memory.safeSummary)].join("\n")),
    score: selectedMemories.length === 0 ? 2 : 1,
    predictedFailures: blockedMemories.length > 0 ? ["blocked memory present; minimal package remains available"] : [],
    blocked: false
  };
  const hybrid: ContextCandidate = {
    id: `${requestId}:hybrid`,
    strategy: "hybrid",
    memoryIds: selectedMemories.map((memory) => memory.metadata.id),
    policyDecisionIds,
    tokenEstimate: estimateTokens(selectedMemories.flatMap((memory) => [memory.metadata.title, memory.safeContent ?? memory.safeSummary ?? ""]).join("\n")),
    score: selectedMemories.reduce((sum, memory) => sum + memory.score, 0),
    predictedFailures: riskSignals.includes("raw_memory_withheld") ? ["some memory was summarized or metadata-only by policy"] : [],
    blocked: missingPolicyDecision,
    blockReason: missingPolicyDecision ? "missing_policy_decision_id" : undefined
  };
  return [minimal, hybrid];
}

function selectMvpCandidate(candidates: ContextCandidate[]): ContextCandidate {
  return candidates
    .filter((candidate) => !candidate.blocked)
    .sort((left, right) => right.score - left.score || right.memoryIds.length - left.memoryIds.length)[0] ?? candidates[0];
}

function createExecutiveConstraints(blockedMemories: BlockedMemory[], riskSignals: string[]): string[] {
  const constraints = [
    "Do not inject or print raw secret memory.",
    "Do not use blocked or deprecated memory as truth.",
    "Respect the effective context role before adapter output."
  ];
  if (blockedMemories.some((memory) => memory.reason === "unauthorized_role")) {
    constraints.push("Do not widen role access to make memory retrieval succeed.");
  }
  if (riskSignals.includes("raw_memory_withheld")) {
    constraints.push("Use summaries only where raw memory was withheld by policy.");
  }
  return constraints;
}

function compilePreflightContextPackage(input: {
  request: ContextRequest;
  candidate: ContextCandidate;
  contextPack: ReturnType<typeof buildContextPack>;
  selectedMemories: PolicySafeMemoryResult[];
  blockedMemories: BlockedMemory[];
  constraints: string[];
}): ContextPackage {
  const contextSummary = JSON.stringify(
    {
      project: input.contextPack.project,
      inferredIntent: input.contextPack.inferredIntent,
      relatedModules: input.contextPack.relatedModules,
      relatedFiles: input.contextPack.relatedFiles,
      relatedApi: input.contextPack.relatedApi,
      relatedDatabase: input.contextPack.relatedDatabase,
      knownRules: input.contextPack.knownRules,
      risks: input.contextPack.risks,
      relatedShortTermMemories: input.contextPack.relatedShortTermMemories,
      relatedLongTermMemories: input.contextPack.relatedLongTermMemories,
      recommendedSteps: input.contextPack.recommendedSteps
    },
    null,
    2
  );
  const memoryPolicySummary = input.selectedMemories
    .map((memory) => `${memory.metadata.id}: ${memory.mode}; decision=${memory.policyDecisionId}; score=${memory.score}`)
    .join("\n");
  const blockedMemorySummary = input.blockedMemories.map((memory) => memory.safeSummary);
  const system = [
    "You are receiving a policy-safe LMTI context package.",
    "Use only included context and constraints.",
    "Blocked memory summaries are warnings, not source truth."
  ].join(" ");
  const content = redactText(
    [
      `Task: ${input.request.input}`,
      `Strategy: ${input.candidate.strategy}`,
      "Executive constraints:",
      ...input.constraints.map((constraint) => `- ${constraint}`),
      "Selected memory policy:",
      memoryPolicySummary || "No policy-safe memory selected.",
      "Blocked memory summary:",
      ...blockedMemorySummary.map((summary) => `- ${summary}`),
      "Compiled context:",
      contextSummary
    ].join("\n")
  );

  return {
    id: randomUUID(),
    requestId: input.request.id,
    strategy: input.candidate.strategy,
    system,
    messages: [
      { role: "system", content: system },
      { role: "user", content }
    ],
    constraints: input.constraints,
    blockedMemorySummary,
    tokenEstimate: estimateTokens(content),
    policyDecisionIds: input.candidate.policyDecisionIds
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function normalizeForPreflight(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

async function runAttach(args: string[]): Promise<void> {
  const target = args[0];
  if (target !== "codex") {
    throw new Error("Usage: lmti attach codex");
  }

  const agentsPath = await attachCodex(process.cwd());

  console.log("LMTI attached to Codex.");
  console.log(`Updated: ${agentsPath}`);
}

export async function attachCodex(cwd: string): Promise<string> {
  await migrateLegacyIfLmtiMissing(cwd);
  const storage = await initAtlasStorage(cwd);
  const agentsPath = path.resolve(cwd, "AGENTS.md");
  const existing = await readTextIfExists(agentsPath);
  const next = upsertLmtiAgentsSection(existing);
  await fs.writeFile(agentsPath, next, "utf8");
  await writeLmtiConfig(storage.configPath, {
    ...createDefaultLmtiConfig(),
    ...(await readLmtiConfig(storage.configPath)),
    codex: {
      attached: true,
      agentsFile: "AGENTS.md"
    }
  });
  return agentsPath;
}

async function runExperiment(args: string[]): Promise<void> {
  const [kind, ...rest] = args;
  if (kind !== "thinking" || rest.length === 0) {
    throw new Error('Usage: lmti experiment thinking "<task>"');
  }

  const task = rest.join(" ");
  const result = await thinkingExperimentCommand(process.cwd(), task);
  printSafeJson(result, "experiment");
}

export interface ThinkingExperimentResult {
  task: string;
  baseline: {
    estimatedFilesToInspect: number;
  };
  lmti: {
    selectedFiles: string[];
    selectedModules: string[];
    estimatedFilesToInspect: number;
  };
  reduction: {
    filesReduced: number;
    percent: number;
  };
}

export async function thinkingExperimentCommand(cwd: string, task: string): Promise<ThinkingExperimentResult> {
  await migrateLegacyIfLmtiMissing(cwd);
  const storage = await initAtlasStorage(cwd);
  const amf = await readCompiledAmf(cwd);
  const contextPack = buildContextPack(amf, task);
  const selectedFiles = contextPack.relatedFiles.map((file) => file.path);
  const selectedModules = contextPack.relatedModules.map((module) => module.name);
  const baselineFiles = estimateBaselineFiles(amf, task);
  const lmtiEstimatedFiles = selectedFiles.length;
  const filesReduced = Math.max(0, baselineFiles.length - lmtiEstimatedFiles);
  const percent = baselineFiles.length === 0 ? 0 : Math.round((filesReduced / baselineFiles.length) * 100);
  const result: ThinkingExperimentResult = {
    task,
    baseline: {
      estimatedFilesToInspect: baselineFiles.length
    },
    lmti: {
      selectedFiles,
      selectedModules,
      estimatedFilesToInspect: lmtiEstimatedFiles
    },
    reduction: {
      filesReduced,
      percent
    }
  };

  await fs.mkdir(path.join(storage.atlasDir, EXPERIMENTS_DIR), { recursive: true });
  await fs.writeFile(path.join(storage.atlasDir, EXPERIMENTS_DIR, "EXP-0001-thinking.json"), JSON.stringify(result, null, 2), "utf8");
  return result;
}

async function readCompiledAmf(cwd: string, amfPath?: string): Promise<AmfDocument> {
  try {
    const amf = await readAmfDocument(amfPath, cwd);
    if (!amf.project.compiledAt || amf.project.checksum === "uncompiled") {
      throw new Error("Project mind has not been compiled yet. Run `lmti compile` first.");
    }
    return amf;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Project mind not found. Run `lmti compile` first.");
    }
    throw error;
  }
}

function estimateBaselineFiles(amf: AmfDocument, task: string): FileEntry[] {
  const keywords = tokenizeExperiment(task);
  if (keywords.length === 0) {
    return amf.files.slice(0, Math.min(amf.files.length, 20));
  }

  const moduleByName = new Map(amf.modules.map((module) => [module.name, module]));
  const matchedPaths = new Set<string>();

  for (const file of amf.files) {
    if (scoreFileForExperiment(file, keywords) > 0) {
      matchedPaths.add(file.path);
      addModuleFiles(moduleByName.get(file.module), matchedPaths);
    }
  }

  for (const rule of amf.rules) {
    if (scoreTextForExperiment(keywords, [rule.text, rule.source]) > 0) {
      matchedPaths.add(rule.source.split(":")[0]);
    }
  }

  for (const risk of amf.risks) {
    if (risk.file && scoreTextForExperiment(keywords, [risk.type, risk.message, risk.recommendation, risk.file]) > 0) {
      matchedPaths.add(risk.file);
    }
  }

  for (const entry of [...amf.api, ...amf.database]) {
    if (scoreTextForExperiment(keywords, [entry.name, entry.kind, entry.source, entry.summary]) > 0) {
      matchedPaths.add(entry.source.split(":")[0]);
    }
  }

  const files = amf.files.filter((file) => matchedPaths.has(file.path));
  if (files.length > 0) {
    return files;
  }

  return amf.files.slice(0, Math.min(amf.files.length, 20));
}

function addModuleFiles(module: ModuleEntry | undefined, paths: Set<string>): void {
  if (!module) {
    return;
  }
  for (const file of module.files) {
    paths.add(file);
  }
}

function scoreFileForExperiment(file: FileEntry, keywords: string[]): number {
  return scoreTextForExperiment(keywords, [file.path, file.module, file.kind, file.summary, ...file.riskFlags]);
}

function scoreTextForExperiment(keywords: string[], values: string[]): number {
  const corpus = normalizeExperimentText(values.join(" "));
  return keywords.reduce((score, keyword) => score + (corpus.includes(keyword) ? 1 : 0), 0);
}

function tokenizeExperiment(task: string): string[] {
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "fix", "bug"]);
  return Array.from(
    new Set(
      normalizeExperimentText(task)
        .split(/[^a-z0-9_]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !stopWords.has(part))
    )
  );
}

function normalizeExperimentText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

async function runMemory(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "init":
      await runProjectMemoryInit(rest);
      return;
    case "add":
      await runMemoryAdd(rest);
      return;
    case "list":
      await runMemoryList(rest);
      return;
    case "search":
      await runMemorySearch(rest);
      return;
    case "retrieve":
      await runProjectMemoryRetrieve(rest);
      return;
    case "context":
      await runMemoryContext(rest);
      return;
    case "short:add":
      await runShortMemoryAdd(rest);
      return;
    case "short:search":
    case "short:retrieve":
      await runShortMemoryRetrieve(rest);
      return;
    case "short:expire":
      await runShortMemoryExpire(rest);
      return;
    case "short:cleanup":
      await runShortMemoryCleanup(rest);
      return;
    case "short:evaluate":
      await runShortMemoryEvaluate(rest);
      return;
    case "short:promote":
      await runShortMemoryPromote(rest);
      return;
    case "lesson":
      await runProjectMemoryLesson(rest);
      return;
    case "stats":
      await runProjectMemoryStats();
      return;
    case "privacy-check":
      await runProjectMemoryPrivacyCheck();
      return;
    case "migrate-json":
      await runProjectMemoryMigrateJson();
      return;
    case "consolidate":
      await runMemoryConsolidate(rest);
      return;
    case "decay":
      await runMemoryDecay(rest);
      return;
    case "reinforce":
      await runMemoryReinforce(rest);
      return;
    case "review":
      await runMemoryReview(rest);
      return;
    case "associations":
      await runMemoryAssociations(rest);
      return;
    case "explain":
      await runMemoryExplain(rest);
      return;
    case "promote":
      await runMemoryPromote(rest);
      return;
    case "delete":
      await runMemoryDelete(rest);
      return;
    default:
      throw new Error("Usage: lmti memory <init|add|list|search|retrieve|context|short:add|short:retrieve|short:expire|short:cleanup|short:evaluate|short:promote|lesson|stats|privacy-check|migrate-json|consolidate|decay|reinforce|review|associations|explain|promote|delete>");
  }
}

async function runMemoryAdd(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  if (!flags.legacy && !flags.scope) {
    await runProjectMemoryAdd(args);
    return;
  }

  const title = stringFlag(flags, "title");
  const content = stringFlag(flags, "content");

  if (!title || !content) {
    throw new Error('Usage: lmti memory add --scope <short_term|long_term> --kind <kind> --title "..." --content "..."');
  }

  const record: NewMemoryRecord = {
    scope: parseScope(stringFlag(flags, "scope") ?? "short_term"),
    kind: parseKind(stringFlag(flags, "kind") ?? "system_note"),
    title,
    content,
    projectId: stringFlag(flags, "project-id") ?? (await detectProjectId()),
    sourceRefs: parseCsv(stringFlag(flags, "source-refs")),
    tags: parseCsv(stringFlag(flags, "tags")),
    importance: parseNumberFlag(flags, "importance", 0.5),
    confidence: parseConfidence(stringFlag(flags, "confidence") ?? "medium"),
    sensitivity: parseSensitivity(stringFlag(flags, "sensitivity") ?? "internal"),
    expiresAt: stringFlag(flags, "expires-at")
  };

  const memory = await createMemory(record, { cwd: process.cwd() });
  warnIfSensitive(memory);
  printSafeJson(safeMemoryForCli(memory), "memory add");
}

async function runMemoryList(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const scope = stringFlag(flags, "scope");
  const role = parseRole(stringFlag(flags, "role") ?? "developer");
  const memories = await listMemory(scope ? parseScope(scope) : undefined, {
    cwd: process.cwd(),
    privacyContext: createCliPrivacyContext(role, flags, "memory list", "list memory")
  });
  if (role !== "developer" || flags["include-secret"]) {
    console.warn(`[LMTI] Sensitive memory access requested as role=${role}. Policy enforcement applied.`);
  }
  printSafeJson(memories, "memory list");
}

async function runMemorySearch(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const query = positional[0];
  if (!query) {
    throw new Error('Usage: lmti memory search "<query>" [--legacy] [--zone deployment,security]');
  }

  if (!flags.legacy) {
    const results = await searchProjectMemory(query, {
      cwd: process.cwd(),
      zones: parseLibraryZones(stringFlag(flags, "zone") ?? stringFlag(flags, "zones")),
      privacyMode: parsePrivacyMode(stringFlag(flags, "privacy-mode")),
      limit: parseNumberFlag(flags, "limit", 10)
    });
    if (flags.json) {
      printCliEnvelope("lmti.memory.search", "pass", [], [], { query, results });
      return;
    }
    printSafeJson(results, "memory search");
    return;
  }

  const results = await searchMemory(query, {
    cwd: process.cwd(),
    scope: optionalScope(stringFlag(flags, "scope")),
    kind: optionalKind(stringFlag(flags, "kind")),
    includeSecret: Boolean(flags["include-secret"]),
    privacyContext: createCliPrivacyContext(parseRole(stringFlag(flags, "role") ?? "developer"), flags, "memory search", "search memory"),
    limit: parseNumberFlag(flags, "limit", 20)
  });
  if (flags["include-secret"] || stringFlag(flags, "role")) {
    console.warn("[LMTI] Sensitive memory search requested. Policy enforcement applied.");
  }
  if (flags.json) {
    printCliEnvelope("lmti.memory.search", "pass", [], [], { query, results });
    return;
  }
  printSafeJson(results, "memory search");
}

async function runProjectMemoryInit(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const storage = await initProjectMemoryStorage(process.cwd());
  const migration = flags["migrate-json"] ? await migrateJsonMemoryToProjectMemory({ cwd: process.cwd() }) : undefined;
  printSafeJson({ ...storage, migration }, "memory init");
}

async function runProjectMemoryAdd(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const title = stringFlag(flags, "title");
  const content = stringFlag(flags, "content");
  if (!content) {
    throw new Error('Usage: lmti memory add --title "..." --content "..." [--zone lesson] [--privacy-level internal]');
  }

  const memory = await (async () => {
    const classification = classifyLibraryMemory({
      title,
      content,
      source: stringFlag(flags, "source"),
      sourceType: stringFlag(flags, "source-type"),
      tags: parseCsv(stringFlag(flags, "tags"))
    });
    return {
      classification,
      item: await addProjectMemory(
        {
          title,
          content,
          source: stringFlag(flags, "source"),
          sourceType: stringFlag(flags, "source-type"),
          tags: parseCsv(stringFlag(flags, "tags")),
          zone: optionalLibraryZone(stringFlag(flags, "zone")),
          privacyLevel: optionalLibraryPrivacyLevel(stringFlag(flags, "privacy-level")),
          confidence: flags.confidence === undefined ? undefined : parseNumberFlag(flags, "confidence", classification.confidence),
          importance: flags.importance === undefined ? undefined : parseNumberFlag(flags, "importance", classification.importance),
          expiresAt: stringFlag(flags, "expires-at")
        },
        { cwd: process.cwd() }
      )
    };
  })();
  printSafeJson(memory, "memory add");
}

async function runProjectMemoryRetrieve(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const task = stringFlag(flags, "intent") ?? positional[0];
  if (!task) {
    throw new Error('Usage: lmti memory retrieve "<task>" or lmti memory retrieve --intent <intent> [--zone deployment,security] [--limit 8]');
  }

  const results = await retrieveMemoryForTask(task, {
    cwd: process.cwd(),
    zones: parseLibraryZones(stringFlag(flags, "zone") ?? stringFlag(flags, "zones")),
    privacyMode: parsePrivacyMode(stringFlag(flags, "privacy-mode")),
    limit: parseNumberFlag(flags, "limit", 8)
  });
  if (flags.json) {
    printCliEnvelope("lmti.memory.retrieve", "pass", [], [], {
      intent: task,
      results,
      privacy: { secret: "blocked", doNotPrompt: "blocked" }
    });
    return;
  }
  printSafeJson(results, "memory retrieve");
}

async function runProjectMemoryLesson(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "propose":
      await runProjectMemoryLessonPropose(rest);
      return;
    case "candidates":
    case "list":
      await runProjectMemoryLessonCandidates(rest);
      return;
    case "show":
      await runProjectMemoryLessonShow(rest);
      return;
    case "approve":
      await runProjectMemoryLessonApprove(rest);
      return;
    case "reject":
      await runProjectMemoryLessonReject(rest);
      return;
    default:
      throw new Error("Usage: lmti memory lesson <propose|candidates|show|approve|reject>");
  }
}

async function runProjectMemoryLessonPropose(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const taskTitle = stringFlag(flags, "task") ?? stringFlag(flags, "title") ?? positional[0];
  if (!taskTitle) {
    throw new Error('Usage: lmti memory lesson propose --task "..." [--lesson "..."] [--files-touched src/a.ts] [--commands "npm test:0"] [--tests "npm test:pass"]');
  }

  const result = await proposeLessonCandidate(
    {
      observation: {
        taskId: stringFlag(flags, "task-id"),
        taskTitle,
        taskSummary: stringFlag(flags, "summary") ?? stringFlag(flags, "task-summary"),
        agent: stringFlag(flags, "agent") ?? "codex",
        filesTouched: parseFileTouchSummaries(stringFlag(flags, "files-touched") ?? stringFlag(flags, "files")),
        commandsRun: parseCommandRunSummaries(stringFlag(flags, "commands") ?? stringFlag(flags, "commands-run")),
        tests: parseTestRunSummaries(stringFlag(flags, "tests")),
        errors: parseErrorSummaries(stringFlag(flags, "errors")),
        decisions: parseDecisionSummaries(stringFlag(flags, "decisions")),
        outcome: parseTaskOutcome(stringFlag(flags, "outcome") ?? inferOutcomeFlag(flags)),
        sourceRefs: parseSourceRefs(stringFlag(flags, "source-refs"))
      },
      agentProposedLesson: stringFlag(flags, "agent-lesson") ?? stringFlag(flags, "lesson"),
      lessonType: parseLessonType(stringFlag(flags, "type") ?? stringFlag(flags, "lesson-type")),
      title: stringFlag(flags, "candidate-title") ?? stringFlag(flags, "title") ?? taskTitle,
      appliesTo: parseCsv(stringFlag(flags, "applies-to")),
      suggestedVerification: parseCsv(stringFlag(flags, "suggested-verification"))
    },
    { cwd: process.cwd(), now: parseNowFlag(flags) }
  );
  printSafeJson(result, "memory lesson propose");
}

async function runProjectMemoryLessonCandidates(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const candidates = await listLessonCandidates({
    cwd: process.cwd(),
    approvalStatus: parseLessonApprovalStatus(stringFlag(flags, "approval-status") ?? stringFlag(flags, "status")),
    privacyStatus: parseLessonPrivacyStatus(stringFlag(flags, "privacy-status")),
    limit: parseNumberFlag(flags, "limit", 20)
  });
  printSafeJson(candidates, "memory lesson candidates");
}

async function runProjectMemoryLessonShow(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const id = stringFlag(flags, "id") ?? positional[0];
  if (!id) {
    throw new Error("Usage: lmti memory lesson show <candidate-id>");
  }
  const candidate = await getLessonCandidate(id, { cwd: process.cwd() });
  if (!candidate) {
    throw new Error(`Lesson candidate not found: ${id}`);
  }
  printSafeJson(candidate, "memory lesson show");
}

async function runProjectMemoryLessonApprove(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const id = stringFlag(flags, "id") ?? positional[0];
  if (!id) {
    throw new Error("Usage: lmti memory lesson approve <candidate-id>");
  }
  const result = await approveLessonCandidate(id, {
    cwd: process.cwd(),
    now: parseNowFlag(flags)
  });
  printSafeJson(result, "memory lesson approve");
}

async function runProjectMemoryLessonReject(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const id = stringFlag(flags, "id") ?? positional[0];
  if (!id) {
    throw new Error("Usage: lmti memory lesson reject <candidate-id>");
  }
  const candidate = await rejectLessonCandidate(id, {
    cwd: process.cwd(),
    now: parseNowFlag(flags)
  });
  printSafeJson(candidate, "memory lesson reject");
}

async function runProjectMemoryStats(): Promise<void> {
  printSafeJson(await getProjectMemoryStats({ cwd: process.cwd() }), "memory stats");
}

async function runProjectMemoryPrivacyCheck(): Promise<void> {
  printSafeJson(await checkProjectMemoryPrivacy({ cwd: process.cwd() }), "memory privacy-check");
}

async function runProjectMemoryMigrateJson(): Promise<void> {
  printSafeJson(await migrateJsonMemoryToProjectMemory({ cwd: process.cwd() }), "memory migrate-json");
}

async function runShortMemoryAdd(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const title = stringFlag(flags, "title");
  const content = stringFlag(flags, "content");
  if (!title || !content) {
    throw new Error('Usage: lmti memory short:add --title "..." --content "..." [--priority high] [--ttl-hours 72]');
  }

  const note = await createShortMemoryNote(
    {
      title,
      content,
      source: stringFlag(flags, "source"),
      sourceType: stringFlag(flags, "source-type"),
      tags: parseCsv(stringFlag(flags, "tags")),
      priority: parseShortMemoryPriority(stringFlag(flags, "priority") ?? "medium"),
      ttl: parseShortMemoryTtl(flags)
    },
    { cwd: process.cwd() }
  );
  printSafeJson(note, "memory short:add");
}

async function runShortMemoryRetrieve(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  if (!task) {
    throw new Error('Usage: lmti memory short:retrieve "<task>" [--limit 8] [--tags a,b]');
  }

  const result = await retrieveShortMemoryForTask(task, {
    cwd: process.cwd(),
    limit: parseNumberFlag(flags, "limit", 8),
    tags: parseCsv(stringFlag(flags, "tags")),
    includeExpired: Boolean(flags["include-expired"]),
    privacyMode: parsePrivacyMode(stringFlag(flags, "privacy-mode"))
  });
  printSafeJson(result, "memory short:retrieve");
}

async function runShortMemoryExpire(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const result = await expireShortMemoryNotes({
    cwd: process.cwd(),
    now: parseNowFlag(flags)
  });
  printSafeJson(result, "memory short:expire");
}

async function runShortMemoryCleanup(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const result = await cleanupShortMemoryNotes({
    cwd: process.cwd(),
    now: parseNowFlag(flags),
    deleteExpiredOlderThanHours: parseNumberFlag(flags, "delete-expired-older-than-hours", 24),
    dryRun: Boolean(flags["dry-run"])
  });
  printSafeJson(result, "memory short:cleanup");
}

async function runShortMemoryEvaluate(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const noteId = stringFlag(flags, "note-id") ?? positional[0];
  if (!noteId) {
    throw new Error('Usage: lmti memory short:evaluate --note-id "..."');
  }
  printSafeJson(await evaluateShortMemoryForPromotion(noteId, { cwd: process.cwd() }), "memory short:evaluate");
}

async function runShortMemoryPromote(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const noteId = stringFlag(flags, "note-id") ?? positional[0];
  if (!noteId) {
    throw new Error('Usage: lmti memory short:promote --note-id "..." [--reason "..."] [--force]');
  }
  const result = await promoteShortMemoryToLongMemory(
    {
      noteId,
      reason: stringFlag(flags, "reason"),
      force: Boolean(flags.force)
    },
    { cwd: process.cwd() }
  );
  printSafeJson(result, "memory short:promote");
}

async function runMemoryContext(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  if (!task) {
    throw new Error('Usage: lmti memory context "<task>" [--short-limit 8] [--long-limit 8]');
  }
  const result = await retrieveMemoryContextForTask(task, {
    cwd: process.cwd(),
    shortLimit: parseNumberFlag(flags, "short-limit", 8),
    longLimit: parseNumberFlag(flags, "long-limit", 8),
    privacyMode: parsePrivacyMode(stringFlag(flags, "privacy-mode")),
    now: parseNowFlag(flags)
  });
  printSafeJson(result, "memory context");
}

async function runMemoryConsolidate(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const result = await consolidateMemory({
    cwd: process.cwd(),
    privacyContext: createCliPrivacyContext(parseRole(stringFlag(flags, "role") ?? "developer"), flags, "memory consolidate", "consolidate memory")
  });
  printSafeJson(result, "memory consolidate");
}

async function runMemoryDecay(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const result = await decayMemoryLifecycle({
    cwd: process.cwd(),
    privacyContext: createCliPrivacyContext(parseRole(stringFlag(flags, "role") ?? "developer"), flags, "memory decay", "decay memory")
  });
  printSafeJson(result, "memory decay");
}

async function runMemoryReinforce(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    throw new Error("Usage: lmti memory reinforce <id> --success true|false");
  }
  const success = parseBooleanFlag(flags, "success");
  const result = await reinforceMemory(id, {
    cwd: process.cwd(),
    success,
    intensity: parseNumberFlag(flags, "intensity", success ? 1 : 1.2),
    privacyContext: createCliPrivacyContext(parseRole(stringFlag(flags, "role") ?? "developer"), flags, "memory reinforce", "reinforce memory")
  });
  printSafeJson({ success: result.success, memory: safeMemoryForCli(result.memory) }, "memory reinforce");
}

async function runMemoryReview(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const result = await reviewMemory({
    cwd: process.cwd(),
    privacyContext: createCliPrivacyContext(parseRole(stringFlag(flags, "role") ?? "developer"), flags, "memory review", "review memory")
  });
  printSafeJson(result, "memory review");
}

async function runMemoryAssociations(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    throw new Error("Usage: lmti memory associations <id>");
  }
  const result = await getMemoryAssociations(id, {
    cwd: process.cwd(),
    privacyContext: createCliPrivacyContext(parseRole(stringFlag(flags, "role") ?? "developer"), flags, "memory associations", "inspect memory associations")
  });
  printSafeJson(result, "memory associations");
}

async function runMemoryExplain(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const query = positional[0];
  if (!query) {
    throw new Error('Usage: lmti memory explain "<query>" [--role developer]');
  }
  const taskIntent = inferIntent(query);
  const result = await explainMemory(query, {
    cwd: process.cwd(),
    scope: optionalScope(stringFlag(flags, "scope")),
    kind: optionalKind(stringFlag(flags, "kind")),
    includeSecret: Boolean(flags["include-secret"]),
    includeRaw: Boolean(flags["include-raw"]),
    includeLowScore: Boolean(flags["include-low-score"]),
    limit: parseNumberFlag(flags, "limit", 16),
    taskIntent,
    privacyContext: createCliPrivacyContext(parseRole(stringFlag(flags, "role") ?? "developer"), flags, "memory explain", "explain memory retrieval")
  });
  printSafeJson(result, "memory explain");
}

async function runMemoryPromote(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    throw new Error("Usage: lmti memory promote <id>");
  }
  printSafeJson(await promoteMemory(id, { cwd: process.cwd() }), "memory promote");
}

async function runMemoryDelete(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    throw new Error("Usage: lmti memory delete <id>");
  }
  const deleted = await deleteMemory(id, { cwd: process.cwd() });
  printSafeJson({ id, deleted }, "memory delete");
}

async function runMind(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "context":
      printSafeJson(await mindContextCommand(process.cwd(), rest, false), "mind context");
      return;
    case "explain":
    case "debug":
      printSafeJson(await mindContextCommand(process.cwd(), rest, true), `mind ${subcommand}`);
      return;
    case "reflect":
      printSafeJson(await mindReflectCommand(process.cwd(), rest), "mind reflect");
      return;
    default:
      throw new Error('Usage: lmti mind <context|explain|reflect|debug> "<task>"');
  }
}

export async function mindContextCommand(cwd: string, args: string[], includeReasoning = false) {
  const { positional, flags } = parseArgs(args);
  const task = positional[0] ?? stringFlag(flags, "task");
  if (!task) {
    throw new Error('Usage: lmti mind context "<task>" [--max-context-chars 6000]');
  }
  return prepareCodexContext({
    task,
    cwd,
    userIntent: stringFlag(flags, "intent"),
    repoState: {
      branch: stringFlag(flags, "branch"),
      dirtyFiles: parseCsv(stringFlag(flags, "dirty-files")),
      recentFiles: parseCsv(stringFlag(flags, "recent-files")),
      packageManager: stringFlag(flags, "package-manager"),
      framework: stringFlag(flags, "framework")
    },
    options: {
      maxShortNotes: parseNumberFlag(flags, "max-short-notes", 5),
      maxLongMemories: parseNumberFlag(flags, "max-long-memories", 7),
      maxContextChars: parseNumberFlag(flags, "max-context-chars", 6000),
      privacyMode: parsePrivacyMode(stringFlag(flags, "privacy-mode")),
      includeReasoning: includeReasoning || Boolean(flags["include-reasoning"])
    }
  });
}

export async function mindReflectCommand(cwd: string, args: string[]) {
  const { flags } = parseArgs(args);
  const task = stringFlag(flags, "task");
  if (!task) {
    throw new Error('Usage: lmti mind reflect --task "..." [--summary "..."]');
  }
  return reflectAfterTask({
    task,
    cwd,
    filesChanged: parseCsv(stringFlag(flags, "files-changed")),
    summary: stringFlag(flags, "summary"),
    bugsFound: parseCsv(stringFlag(flags, "bugs-found")),
    decisionsMade: parseCsv(stringFlag(flags, "decisions-made")),
    testsRun: parseCsv(stringFlag(flags, "tests-run")),
    risks: parseCsv(stringFlag(flags, "risks"))
  });
}

async function runFramework(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "detect":
      await runFrameworkDetect(rest);
      return;
    case "list":
      printSafeJson(listFrameworkAdapters().map((adapter) => ({ name: adapter.name, language: adapter.language })), "framework list");
      return;
    case "info":
      await runFrameworkInfo(rest);
      return;
    case "commands":
      await runFrameworkCommands(rest);
      return;
    case "risk-zones":
      await runFrameworkRiskZones(rest);
      return;
    case "verify-plan":
      await runFrameworkVerifyPlan(rest);
      return;
    case "monorepo-map":
      await runFrameworkMonorepoMap(rest);
      return;
    default:
      throw new Error('Usage: lmti framework <detect|list|info|commands|risk-zones|verify-plan|monorepo-map>');
  }
}

export async function frameworkDetectCommand(cwd: string) {
  await ensureFrameworkConfig(cwd);
  return detectFramework({ repoRoot: cwd });
}

async function runFrameworkDetect(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const result = await frameworkDetectCommand(process.cwd());
  if (flags.html) {
    printSafeText(renderFrameworkDetectionHtml(result));
    return;
  }
  if (flags.json) {
    printSafeJson(result, "framework detect");
    return;
  }
  printSafeText(formatFrameworkDetection(result));
}

async function runFrameworkInfo(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const detection = await detectFramework({ repoRoot: process.cwd() });
  const name = positional[0] ?? stringFlag(flags, "framework") ?? detection.primaryFramework;
  const adapter = getFrameworkAdapter(name);
  if (!adapter) {
    throw new Error(`Unknown framework adapter: ${name}`);
  }
  printSafeJson({
    name: adapter.name,
    language: adapter.language,
    active: adapter.name === detection.primaryFramework,
    detected: detection.primaryFramework,
    confidence: detection.confidence
  }, "framework info");
}

async function runFrameworkCommands(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const detection = await detectFramework({ repoRoot: process.cwd() });
  const name = positional[0] ?? stringFlag(flags, "framework") ?? detection.primaryFramework;
  const adapter = getFrameworkAdapter(name) ?? getFrameworkAdapter("generic");
  if (!adapter) {
    throw new Error(`Unknown framework adapter: ${name}`);
  }
  const commands = await adapter.getDefaultCommands(process.cwd());
  if (flags.html) {
    printSafeText(renderFrameworkCommandsHtml({ framework: adapter.name, commands }));
    return;
  }
  printSafeJson({ framework: adapter.name, commands }, "framework commands");
}

async function runFrameworkRiskZones(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const detection = await detectFramework({ repoRoot: process.cwd() });
  const name = positional[0] ?? stringFlag(flags, "framework") ?? detection.primaryFramework;
  const adapter = getFrameworkAdapter(name) ?? getFrameworkAdapter("generic");
  if (!adapter) {
    throw new Error(`Unknown framework adapter: ${name}`);
  }
  const zones = await adapter.getRiskZones(process.cwd());
  if (flags.html) {
    printSafeText(renderFrameworkRiskZonesHtml({ framework: adapter.name, zones }));
    return;
  }
  printSafeJson({ framework: adapter.name, zones }, "framework risk-zones");
}

async function runFrameworkVerifyPlan(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const task = stringFlag(flags, "task");
  if (!task) {
    throw new Error('Usage: lmti framework verify-plan --task "..." [--files "a,b"]');
  }
  const detection = await detectFramework({ repoRoot: process.cwd() });
  const plan = await createFrameworkVerificationPlan({
    framework: stringFlag(flags, "framework") ?? detection.primaryFramework,
    task,
    filesChanged: parseCsv(stringFlag(flags, "files")),
    riskLevel: stringFlag(flags, "risk-level") ?? "medium",
    repoRoot: process.cwd()
  });
  if (flags.html) {
    printSafeText(renderFrameworkVerificationHtml(plan));
    return;
  }
  printSafeJson(plan, "framework verify-plan");
}

async function runFrameworkMonorepoMap(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const map = await createMonorepoMap({ repoRoot: process.cwd() });
  if (flags.html) {
    printSafeText(renderMonorepoMapHtml(map));
    return;
  }
  printSafeJson(map, "framework monorepo-map");
}

async function runActions(args: string[], cwd: string): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "start":
      await runActionsStart(rest, cwd);
      return;
    case "log":
      await runActionsLog(rest, cwd);
      return;
    case "command":
      await runActionsCommand(rest, cwd);
      return;
    case "decision":
      await runActionsDecision(rest, cwd);
      return;
    case "memory":
      await runActionsMemory(rest, cwd);
      return;
    case "reflection":
      await runActionsReflection(rest, cwd);
      return;
    case "end":
      await runActionsEnd(rest, cwd);
      return;
    case "list":
      await runActionsList(rest, cwd);
      return;
    case "show":
      await runActionsShow(rest, cwd);
      return;
    case "risks":
      await runActionsRisks(rest, cwd);
      return;
    case "replay":
      await runActionsReplay(rest, cwd);
      return;
    case "stats":
      printSafeJson(await getCodexActionStats({ cwd }), "actions stats");
      return;
    default:
      throw new Error('Usage: lmti actions <start|log|command|decision|memory|reflection|end|list|show|risks|replay|stats>');
  }
}

async function runActionsStart(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  const task = stringFlag(flags, "task");
  if (!task) {
    throw new Error('Usage: lmti actions start --task "..."');
  }
  printSafeJson(
    await startCodexSession({
      cwd,
      task,
      branch: stringFlag(flags, "branch"),
      intent: stringFlag(flags, "intent")
    }),
    "actions start"
  );
}

async function runActionsLog(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  const sessionId = requiredStringFlag(flags, "session-id", "Usage: lmti actions log --session-id <id> --type file_read --file <path>");
  const type = parseCodexActionType(stringFlag(flags, "type") ?? "decision_made");
  const file = stringFlag(flags, "file");
  const title = stringFlag(flags, "title") ?? type;

  if (file && type.startsWith("file_")) {
    const eventType = actionTypeToFileEvent(type);
    printSafeJson(
      await logCodexFileEvent({
        cwd,
        sessionId,
        filePath: file,
        eventType,
        diffSummary: stringFlag(flags, "diff-summary"),
        linesAdded: parseNumberFlag(flags, "lines-added", 0),
        linesRemoved: parseNumberFlag(flags, "lines-removed", 0)
      }),
      "actions log"
    );
    return;
  }

  printSafeJson(
    await logCodexAction({
      cwd,
      sessionId,
      actionType: type,
      title,
      detail: stringFlag(flags, "detail"),
      filePath: file,
      command: stringFlag(flags, "command")
    }),
    "actions log"
  );
}

async function runActionsCommand(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  const sessionId = requiredStringFlag(flags, "session-id", "Usage: lmti actions command --session-id <id> --command \"npm test\" --exit-code 0");
  const command = requiredStringFlag(flags, "command", "Usage: lmti actions command --session-id <id> --command \"npm test\" --exit-code 0");
  printSafeJson(
    await logCodexCommandEvent({
      cwd,
      sessionId,
      command,
      commandCwd: stringFlag(flags, "cwd"),
      exitCode: flags["exit-code"] === undefined ? undefined : parseNumberFlag(flags, "exit-code", 0),
      durationMs: flags["duration-ms"] === undefined ? undefined : parseNumberFlag(flags, "duration-ms", 0),
      outputSummary: stringFlag(flags, "output-summary"),
      errorSummary: stringFlag(flags, "error-summary")
    }),
    "actions command"
  );
}

async function runActionsDecision(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  const sessionId = requiredStringFlag(flags, "session-id", "Usage: lmti actions decision --session-id <id> --decision \"...\" --reason \"...\"");
  const decision = requiredStringFlag(flags, "decision", "Usage: lmti actions decision --session-id <id> --decision \"...\" --reason \"...\"");
  printSafeJson(
    await logCodexDecision({
      cwd,
      sessionId,
      decision,
      reason: stringFlag(flags, "reason"),
      alternatives: parseCsv(stringFlag(flags, "alternatives")),
      relatedFiles: parseCsv(stringFlag(flags, "related-files")),
      relatedMemoryIds: parseCsv(stringFlag(flags, "related-memory-ids")),
      confidence: parseNumberFlag(flags, "confidence", 0.5)
    }),
    "actions decision"
  );
}

async function runActionsMemory(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  const sessionId = requiredStringFlag(flags, "session-id", "Usage: lmti actions memory --session-id <id> --memory-id <id> --memory-type long");
  const memoryId = requiredStringFlag(flags, "memory-id", "Usage: lmti actions memory --session-id <id> --memory-id <id> --memory-type long");
  printSafeJson(
    await logCodexMemoryUsage({
      cwd,
      sessionId,
      memoryId,
      memoryType: parseCodexMemoryType(stringFlag(flags, "memory-type") ?? "long"),
      role: stringFlag(flags, "role"),
      reason: stringFlag(flags, "reason"),
      usedInDecision: Boolean(flags["used-in-decision"])
    }),
    "actions memory"
  );
}

async function runActionsReflection(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  const sessionId = requiredStringFlag(flags, "session-id", "Usage: lmti actions reflection --session-id <id> --summary \"...\"");
  printSafeJson(
    await logCodexReflection({
      cwd,
      sessionId,
      taskSummary: stringFlag(flags, "summary"),
      filesChanged: parseCsv(stringFlag(flags, "files-changed")),
      testsRun: parseCsv(stringFlag(flags, "tests-run")),
      bugsFound: parseCsv(stringFlag(flags, "bugs-found")),
      lessonsCreated: parseCsv(stringFlag(flags, "lessons-created")),
      shortNotesCreated: parseCsv(stringFlag(flags, "short-notes-created")),
      longMemoriesCreated: parseCsv(stringFlag(flags, "long-memories-created")),
      risksRemaining: parseCsv(stringFlag(flags, "risks-remaining"))
    }),
    "actions reflection"
  );
}

async function runActionsEnd(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  const sessionId = requiredStringFlag(flags, "session-id", "Usage: lmti actions end --session-id <id> --status completed");
  printSafeJson(
    await endCodexSession({
      cwd,
      sessionId,
      status: parseCodexSessionStatus(stringFlag(flags, "status") ?? "completed"),
      summary: stringFlag(flags, "summary")
    }),
    "actions end"
  );
}

async function runActionsList(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  printSafeJson(
    await listCodexSessions({
      cwd,
      status: stringFlag(flags, "status") ? parseCodexSessionStatus(stringFlag(flags, "status") ?? "running") : undefined,
      limit: parseNumberFlag(flags, "limit", 50)
    }),
    "actions list"
  );
}

async function runActionsShow(args: string[], cwd: string): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const sessionId = positional[0] ?? stringFlag(flags, "session-id");
  if (!sessionId) {
    throw new Error("Usage: lmti actions show <session-id>");
  }
  const detail = await getCodexSessionDetail(sessionId, { cwd });
  if (flags.html) {
    printSafeText(renderCodexSessionDetailHtml(detail));
    return;
  }
  printSafeJson(detail, "actions show");
}

async function runActionsRisks(args: string[], cwd: string): Promise<void> {
  const { flags } = parseArgs(args);
  printSafeJson(await listCodexRiskItems({ cwd, limit: parseNumberFlag(flags, "limit", 50) }), "actions risks");
}

async function runActionsReplay(args: string[], cwd: string): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const sessionId = positional[0] ?? stringFlag(flags, "session-id");
  if (!sessionId) {
    throw new Error("Usage: lmti actions replay <session-id>");
  }
  const replay = await getCodexReplay(sessionId, { cwd });
  if (flags.html) {
    const session = await getCodexSession(sessionId, { cwd });
    if (!session) {
      throw new Error(`Codex session not found: ${sessionId}`);
    }
    printSafeText(renderCodexReplayHtml({ session, replay }));
    return;
  }
  printSafeJson(replay, "actions replay");
}

async function runCognition(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "run":
      await runCognitionCycleCommand(rest, false);
      return;
    case "explain":
      await runCognitionCycleCommand(rest, true);
      return;
    case "state":
      await runCognitionState(rest);
      return;
    default:
      throw new Error('Usage: lmti cognition <run|explain|state> "<task>"');
  }
}

async function runCognitionCycleCommand(args: string[], explainOnly: boolean): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  if (!task) {
    throw new Error(`Usage: lmti cognition ${explainOnly ? "explain" : "run"} "<task>"`);
  }

  const role = parseRole(stringFlag(flags, "role") ?? "developer");
  const context = await contextCommand(process.cwd(), task, {
    amfPath: positional[1],
    includeSecret: false,
    role,
    flags: { ...flags, "include-secret": false }
  });
  const items = contextPackToCognitiveItems(context);
  const result = runCognitiveCycle({
    projectId: context.project,
    task,
    inferredIntent: context.inferredIntent,
    contextItems: items,
    privacyBlocks: context.filteredOut.memories > 0 ? [`${context.filteredOut.memories} memories filtered by privacy or relevance`] : [],
    subscribers: [
      { id: "context_builder", role: "local" },
      { id: "runtime_session", role: "local" },
      { id: "agent_response_planner", role: stringFlag(flags, "model-target") === "external_model" ? "external_model" : "local" },
      { id: "memory_consolidation", role: "local" },
      { id: "insight_engine", role: "local" },
      { id: "privacy_audit", role: "local" }
    ]
  });

  if (explainOnly) {
    printSafeJson(
        {
          task,
          selectedFocus: result.focus.selectedFocus,
          phiEstimate: result.state.integratedInformation.normalizedPhi,
          freeEnergyEstimate: result.state.predictionState.freeEnergyEstimate,
          fragmentationRisk: result.state.integratedInformation.fragmentationRisk,
          predictionError: result.predictionError,
          broadcasts: result.broadcasts,
          recommendedActions: result.recommendedActions,
          explanation: result.state.explanation
        },
        "cognition explain"
    );
    return;
  }

  printSafeJson(result, "cognition");
}

async function runCognitionState(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  if (!task) {
    console.log(
      JSON.stringify(
        {
          status: "ephemeral",
          message: "Cognitive state is computed per task and not persisted yet.",
          next: 'Run `lmti cognition run "<task>"` or `lmti cognition explain "<task>"`.'
        },
        null,
        2
      )
    );
    return;
  }
  await runCognitionCycleCommand([task, ...Object.entries(flags).flatMap(([key, value]) => (value === true ? [`--${key}`] : [`--${key}`, String(value)]))], false);
}

async function runWorld(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case "check":
      await runWorldCheck(rest, "check");
      return;
    case "align":
      await runWorldCheck(rest, "align");
      return;
    case "cost":
      await runWorldCost(rest);
      return;
    case "observe":
      await runWorldObserve(rest);
      return;
    default:
      throw new Error('Usage: lmti world <check|cost|align|observe> "<task or input>"');
  }
}

async function runWorldCheck(args: string[], mode: "check" | "align"): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  if (!task) {
    throw new Error(`Usage: lmti world ${mode} "<task>"`);
  }
  const context = await contextCommand(process.cwd(), task, {
    amfPath: positional[1],
    includeSecret: false,
    role: parseRole(stringFlag(flags, "role") ?? "developer"),
    flags: { ...flags, "include-secret": false }
  });
  const inputs = contextPackToSensoryInputs(context);
  const beliefs = contextPackToBeliefs(context);
  const result = runWorldModelCycle({
    projectId: context.project,
    task,
    inputs,
    beliefs,
    budget: {
      maxTokens: parseNumberFlag(flags, "max-tokens", 1800),
      maxFiles: parseNumberFlag(flags, "max-files", 12),
      maxMemoryItems: parseNumberFlag(flags, "max-memory-items", 12),
      maxComputeCost: parseNumberFlag(flags, "max-compute-cost", 80)
    }
  });

  if (mode === "align") {
    printSafeJson(result.alignment, "world align");
    return;
  }

  printSafeJson(
      {
        task,
        blanket: {
          observations: result.blanket.observations.length,
          noiseFiltered: result.blanket.noiseFiltered,
          privacyFiltered: result.blanket.privacyFiltered
        },
        cost: result.cost,
        alignment: {
          predictionError: result.alignment.predictionError,
          uncertainty: result.alignment.uncertainty
        },
        realityCheck: result.realityCheck,
        proposedActions: result.proposedActions.map((action) => ({
          kind: action.kind,
          title: action.title,
          riskLevel: action.riskLevel,
          requiresPermission: action.requiresPermission
        })),
        explanation: result.explanation
      },
      "world check"
  );
}

async function runWorldCost(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  if (!task) {
    throw new Error('Usage: lmti world cost "<task>"');
  }
  const cost = estimateComputeCost(
    { text: task, sourceRefs: parseCsv(stringFlag(flags, "source-refs")) },
    {
      maxTokens: parseNumberFlag(flags, "max-tokens", 1800),
      maxFiles: parseNumberFlag(flags, "max-files", 12),
      maxMemoryItems: parseNumberFlag(flags, "max-memory-items", 12),
      maxComputeCost: parseNumberFlag(flags, "max-compute-cost", 80)
    }
  );
  printSafeJson(cost, "world cost");
}

async function runWorldObserve(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const input = positional[0];
  if (!input) {
    throw new Error('Usage: lmti world observe "<input>"');
  }
  const result = runWorldModelCycle({
    projectId: stringFlag(flags, "project-id") ?? (await detectProjectId()),
    task: input,
    inputs: [{
      id: "cli-input",
      source: "user",
      content: input,
      sourceRefs: parseCsv(stringFlag(flags, "source-refs")),
      timestamp: new Date().toISOString(),
      confidence: parseNumberFlag(flags, "confidence", 0.8),
      sensitivity: parseSensitivity(stringFlag(flags, "sensitivity") ?? "internal"),
      promptPolicy: parsePromptPolicy(stringFlag(flags, "prompt-policy") ?? "summarize_only")
    }]
  });
  printSafeJson(result.blanket, "world observe");
}

async function runRemember(args: string[]): Promise<void> {
  const memory = await rememberCommand(process.cwd(), args);
  warnIfSensitive(memory);
  printSafeJson(safeMemoryForCli(memory), "remember");
}

export async function rememberCommand(cwd: string, args: string[]): Promise<MemoryRecord> {
  const { flags } = parseArgs(args);
  const title = stringFlag(flags, "title");
  const content = stringFlag(flags, "content");
  if (!title || !content) {
    throw new Error('Usage: lmti remember --kind rule --title "..." --content "..." --tags a,b --sensitivity internal --prompt-policy summarize_only');
  }

  const inferred = inferIntent(`${title} ${content}`);
  const tags = Array.from(new Set([...parseCsv(stringFlag(flags, "tags")), inferred.primaryIntent, ...inferred.secondaryIntents].filter((tag) => tag && tag !== "unknown")));
  const kind = parseKind(stringFlag(flags, "kind") ?? "rule");

  if (kind === "lesson") {
    throw new Error("Use `lmti memory lesson propose` for lessons so they pass privacy/evidence/confidence review before approval.");
  }

  return createMemory(
    {
      scope: "long_term",
      kind,
      title,
      content,
      projectId: stringFlag(flags, "project-id") ?? (await detectProjectId()),
      sourceRefs: parseCsv(stringFlag(flags, "source-refs")),
      tags,
      importance: parseNumberFlag(flags, "importance", 0.8),
      confidence: parseConfidence(stringFlag(flags, "confidence") ?? "medium"),
      sensitivity: parseSensitivity(stringFlag(flags, "sensitivity") ?? "internal"),
      promptPolicy: parsePromptPolicy(stringFlag(flags, "prompt-policy") ?? "summarize_only")
    },
    { cwd }
  );
}

async function runTask(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "done") {
    throw new Error('Usage: lmti task done --title "<task title>" --summary "<what changed>" [--lesson "<lesson learned>"]');
  }
  const result = await taskDoneCommand(process.cwd(), rest);
  printSafeJson(result.event, "task done");
  if (result.lessonMemory) {
    printSafeJson(safeMemoryForCli(result.lessonMemory), "task lesson");
  }
  if (result.lessonCandidate) {
    printSafeJson(result.lessonCandidate, "task lesson candidate");
  }
  if (result.suggestion) {
    console.log(result.suggestion);
  }
}

export async function taskDoneCommand(cwd: string, args: string[]) {
  const { flags } = parseArgs(args);
  const title = stringFlag(flags, "title");
  const summary = stringFlag(flags, "summary");
  if (!title || !summary) {
    throw new Error('Usage: lmti task done --title "<task title>" --summary "<what changed>" [--lesson "<lesson learned>"]');
  }

  const taskIntent = inferIntent(`${title} ${summary} ${stringFlag(flags, "lesson") ?? ""}`);
  const proposedLesson = stringFlag(flags, "lesson") ?? stringFlag(flags, "agent-lesson");
  const result = await recordTaskDone(
    {
      title,
      summary,
      lesson: undefined,
      tags: parseCsv(stringFlag(flags, "tags")),
      sensitivity: parseSensitivity(stringFlag(flags, "sensitivity") ?? "internal"),
      promptPolicy: parsePromptPolicy(stringFlag(flags, "prompt-policy") ?? "summarize_only"),
      projectId: stringFlag(flags, "project-id") ?? (await detectProjectId()),
      taskIntent
    },
    { cwd }
  );

  if (!proposedLesson && !flags["propose-lesson"]) {
    return { ...result, lessonCandidate: undefined };
  }

  const proposal = await proposeLessonCandidate(
    {
      observation: {
        taskId: stringFlag(flags, "task-id"),
        taskTitle: title,
        taskSummary: summary,
        agent: stringFlag(flags, "agent") ?? "codex",
        filesTouched: parseFileTouchSummaries(stringFlag(flags, "files-touched") ?? stringFlag(flags, "files")),
        commandsRun: parseCommandRunSummaries(stringFlag(flags, "commands") ?? stringFlag(flags, "commands-run")),
        tests: parseTestRunSummaries(stringFlag(flags, "tests")),
        errors: parseErrorSummaries(stringFlag(flags, "errors")),
        decisions: parseDecisionSummaries(stringFlag(flags, "decisions")),
        outcome: parseTaskOutcome(stringFlag(flags, "outcome") ?? inferOutcomeFlag(flags)),
        sourceRefs: parseSourceRefs(stringFlag(flags, "source-refs"))
      },
      agentProposedLesson: proposedLesson,
      lessonType: parseLessonType(stringFlag(flags, "type") ?? stringFlag(flags, "lesson-type")),
      appliesTo: parseCsv(stringFlag(flags, "applies-to")),
      suggestedVerification: parseCsv(stringFlag(flags, "suggested-verification"))
    },
    { cwd }
  );

  return {
    ...result,
    suggestion: undefined,
    lessonCandidate: proposal.candidate
  };
}

async function runPrivacy(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  const { flags } = parseArgs(rest);

  switch (subcommand) {
    case "audit":
      if (flags.verify) {
        printSafeJson(await verifyAuditIntegrity(process.cwd()), "privacy audit verify");
        return;
      }
      if (flags.retain !== undefined) {
        printSafeJson(await retainAuditEvents(process.cwd(), parseNumberFlag(flags, "retain", 1000)), "privacy audit retain");
        return;
      }
      printSafeJson(await readAuditEvents(process.cwd(), parseNumberFlag(flags, "limit", 50)), "privacy audit");
      return;
    case "check":
      printSafeJson(await checkMemoryPrivacy({ cwd: process.cwd() }), "privacy check");
      return;
    default:
      throw new Error("Usage: lmti privacy <audit|check>");
  }
}

async function runBenchmark(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "preflight") {
    throw new Error('Usage: lmti benchmark preflight "<task>" [--runs 5]');
  }

  const result = await benchmarkPreflightCommand(process.cwd(), rest);
  printSafeJson(result, "benchmark preflight");
}

export async function benchmarkPreflightCommand(cwd: string, args: string[]) {
  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  if (!task) {
    throw new Error('Usage: lmti benchmark preflight "<task>" [--runs 5]');
  }

  const runs = Math.max(1, Math.min(50, Math.floor(parseNumberFlag(flags, "runs", 5))));
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const result = await preflightCommand(cwd, task, {
      amfPath: positional[1],
      role: parseRole(stringFlag(flags, "role") ?? "developer"),
      modelTarget: stringFlag(flags, "model-target") ?? "external_model",
      flags
    });
    samples.push({
      run: index + 1,
      latencyMs: result.metrics.latencyMs,
      phaseLatencyMs: result.metrics.phaseLatencyMs,
      adapterAllowed: result.adapterSandbox.allowed,
      egressBlocked: result.egress.blocked
    });
  }

  const latencies = samples.map((sample) => sample.latencyMs).sort((left, right) => left - right);
  return {
    task,
    runs,
    minLatencyMs: latencies[0],
    maxLatencyMs: latencies[latencies.length - 1],
    averageLatencyMs: Math.round((latencies.reduce((sum, value) => sum + value, 0) / latencies.length) * 100) / 100,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    samples
  };
}

const LMTI_SECTION_START = "<!-- LMTI:START -->";
const LMTI_SECTION_END = "<!-- LMTI:END -->";

const LMTI_AGENTS_SECTION = `${LMTI_SECTION_START}
## LMTI - Atlas Integration

Codex must treat LMTI as the project memory/context layer.

When this repository is installed inside another project, LMTI must be treated
as an external intelligence layer, not as a module of the host project.

Connected by context, not by runtime ownership.

Before making changes, Codex should:

1. Read .lmti/project.amf.json if available.
2. Use LMTI context when the task is unclear or touches multiple modules.
3. Prefer compiled understanding and Project Atlas metadata over repeatedly scanning the entire repository.
4. Respect .lmti privacy rules.
5. Never expose secret memory or confidential project knowledge in raw form.
6. After completing a task, summarize what changed and propose safe lesson candidates instead of storing raw chat.
7. If a task reveals a reusable rule, bug, route, deploy note, permission rule or architecture constraint, prefer \`lmti task done --lesson "..."\` or \`lmti memory lesson propose\`; approve only after privacy/evidence review.
8. Treat memory as prior belief, not reality. Source code, tests, command output and explicit user instruction remain the source of truth.
9. Use framework detection before planning build/test/risk steps on unfamiliar projects.
10. Do not bypass LMTI privacy gates, do not widen permissions to make a task pass, and never print secrets.
11. Do not store raw chat, raw secrets, raw customer data, or unverified hallucinations as memory.
12. Before publishing, pushing to a public repo, opening a PR, creating a release, or changing a Git remote, always run \`lmti publish check\`. If it returns ERROR/BLOCKED, stop immediately and ask the user to resolve or approve a safe recovery path.

Suggested local command:

lmti context "<task>"
lmti mind context "<task>"
lmti framework detect
lmti preflight "<task>" --role developer --model-target external_model
lmti publish check
lmti memory lesson candidates
lmti doctor --security
${LMTI_SECTION_END}`;

function upsertLmtiAgentsSection(existing: string): string {
  const normalized = existing.replace(/\s+$/u, "");
  const markedPattern = new RegExp(`${escapeRegExp(LMTI_SECTION_START)}[\\s\\S]*?${escapeRegExp(LMTI_SECTION_END)}`, "u");

  if (markedPattern.test(normalized)) {
    return `${normalized.replace(markedPattern, LMTI_AGENTS_SECTION)}\n`;
  }

  const headingPattern = /(?:^|\n)## LMTI - Atlas Integration\n[\s\S]*?(?=\n## |\n# |\s*$)/u;
  if (headingPattern.test(normalized)) {
    return `${normalized.replace(headingPattern, `\n${LMTI_AGENTS_SECTION}`)}\n`;
  }

  return normalized ? `${normalized}\n\n${LMTI_AGENTS_SECTION}\n` : `${LMTI_AGENTS_SECTION}\n`;
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function readLmtiConfig(configPath: string): Promise<Partial<LmtiConfig>> {
  try {
    return JSON.parse(await fs.readFile(configPath, "utf8")) as Partial<LmtiConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeLmtiConfig(configPath: string, config: LmtiConfig): Promise<void> {
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertPathInsideCwd(cwd: string, targetPath: string, label: string): void {
  const root = path.resolve(cwd);
  const relative = path.relative(root, path.resolve(targetPath));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`${label} must stay inside the project directory.`);
}

function printSafeJson(value: unknown, label: string): void {
  const serialized = JSON.stringify(redactJsonValue(value), null, 2);
  const scan = runEgressSecretScan(serialized);
  if (scan.blocked) {
    console.warn(`[LMTI] ${label} output matched secret patterns and was redacted before printing.`);
  }
  console.log(serialized);
}

function printCliEnvelope(command: string, status: CliStatus | string, warnings: CliBoundaryMessage[], errors: CliBoundaryMessage[], data: unknown): void {
  printSafeJson(createCliEnvelope(command, status, warnings, errors, data), command);
}

function createCliEnvelope(command: string, status: CliStatus | string, warnings: CliBoundaryMessage[] = [], errors: CliBoundaryMessage[] = [], data: unknown = {}): CliJsonEnvelope {
  return {
    schemaVersion: "lmti.cli.v1",
    command,
    status: toCliStatus(status),
    warnings: warnings.map(cleanBoundaryMessage),
    errors: errors.map(cleanBoundaryMessage),
    data: isRecord(data) ? data : { value: data }
  };
}

function cleanBoundaryMessage(message: CliBoundaryMessage): CliBoundaryMessage {
  return {
    code: message.code,
    message: message.message,
    ...(message.suggestion ? { suggestion: message.suggestion } : {})
  };
}

function toCliStatus(status: CliStatus | string): CliStatus {
  if (status === "warning" || status === "warn") {
    return "warn";
  }
  if (status === "blocked" || status === "error" || status === "pass") {
    return status;
  }
  return "error";
}

function publishResultToCliStatus(status: PublishPreflightResultState): CliStatus {
  return status === "warning" ? "warn" : status;
}

function setCliExitCode(status: CliStatus | string): void {
  process.exitCode = exitCodeForCliStatus(toCliStatus(status));
}

function exitCodeForCliStatus(status: CliStatus): CliExitCode {
  switch (status) {
    case "pass":
      return 0;
    case "warn":
      return 1;
    case "blocked":
      return 2;
    case "error":
      return 3;
  }
}

function writeCliUsage(command: string, usage: string, json: boolean): void {
  process.exitCode = 4;
  if (json) {
    printCliEnvelope(command, "error", [], [{ code: "INVALID_USAGE", message: usage }], {});
    return;
  }
  throw new CliUsageError(usage);
}

function doctorStatusToCliStatus(status: DoctorReport["status"]): CliStatus {
  if (status === "ok") {
    return "pass";
  }
  if (status === "warning") {
    return "warn";
  }
  return "blocked";
}

function doctorProblemMessages(report: DoctorReport, severity: DoctorSeverity): CliBoundaryMessage[] {
  return report.problems
    .filter((problem) => problem.severity === severity)
    .map((problem) => ({
      code: problem.id.toUpperCase().replace(/[^A-Z0-9]+/gu, "_"),
      message: problem.message,
      suggestion: problem.recommendedFix
    }));
}

function securityDoctorMessages(report: SecurityDoctorReport, status: SecurityDoctorCheck["status"]): CliBoundaryMessage[] {
  return report.checks
    .filter((check) => check.status === status)
    .map((check) => ({
      code: check.id.toUpperCase().replace(/[^A-Z0-9]+/gu, "_"),
      message: check.message
    }));
}

function printSafeText(value: string): void {
  const scan = runEgressSecretScan(value);
  if (scan.blocked) {
    console.warn("[LMTI] text output matched secret patterns and was redacted before printing.");
  }
  console.log(redactText(value));
}

function redactJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [redactText(key), redactJsonValue(entry)]));
  }
  return value;
}

function printHelp(): void {
  console.log(`LMTI - Atlas

Usage:
  lmti init [--yes]
  lmti check [--json]
  lmti route "<task>" [--json]
  lmti compile [projectPath]
  lmti migrate [--yes]
  lmti doctor [--fix|--security]
  lmti doctor --json
  lmti inspect [amfPath]
  lmti context "<task>" [amfPath] [--include-secret]
  lmti preflight "<task>" [amfPath] [--role developer] [--model-target external_model]
  lmti skill list [--json]
  lmti skill route "<task>" [--json]
  lmti skill show <skill-id> [--json]
  lmti skill validate [--json]
  lmti thoth <list|route|explain|show|inspect|validate|doctor> [--json]
  lmti publish check [--target main] [--json] [--strict] [--fix-suggest]
  lmti publish preflight [--target main] [--json] [--strict] [--fix-suggest]
  lmti preflight publish [--target main] [--json] [--strict] [--fix-suggest]
  lmti policy check --action <action> [--json]
  lmti policy list [--json]
  lmti config <show|inspect|validate> [--json]
  lmti agent inspect [--json]
  lmti agent context --intent <intent> [--json]
  lmti cleanup check [--json]
  lmti experiment thinking "<task>"
  lmti attach codex
  lmti memory init [--migrate-json]
  lmti memory add --title "..." --content "..." [--zone lesson]
  lmti memory add --scope short_term --kind task --title "..." --content "..." --legacy
  lmti memory list [--scope short_term|long_term] [--role developer]
  lmti memory search "<query>" [--zone security,lesson]
  lmti memory search "<query>" --legacy [--role agent] [--include-secret]
  lmti memory retrieve "<task>"
  lmti memory context "<task>" [--short-limit 8] [--long-limit 8]
  lmti memory short:add --title "..." --content "..." [--priority medium] [--ttl-hours 24]
  lmti memory short:retrieve "<task>" [--tags tag-a,tag-b]
  lmti memory short:expire
  lmti memory short:cleanup [--dry-run]
  lmti memory short:evaluate <noteId>
  lmti memory short:promote <noteId> [--reason "..."]
  lmti memory lesson propose --task "..." --lesson "..."
  lmti memory lesson candidates [--approval-status pending]
  lmti memory lesson show <candidate-id>
  lmti memory lesson approve <candidate-id>
  lmti memory lesson reject <candidate-id>
  lmti memory stats
  lmti memory privacy-check
  lmti memory consolidate
  lmti memory decay
  lmti memory reinforce <id> --success true|false
  lmti memory review
  lmti memory associations <id>
  lmti memory explain "<query>"
  lmti memory promote <id>
  lmti memory delete <id>
  lmti mind context "<task>"
  lmti mind explain "<task>"
  lmti mind reflect --task "..." [--summary "..."]
  lmti mind debug "<task>"
  lmti framework detect [--json|--html]
  lmti framework list
  lmti framework info [framework]
  lmti framework commands [framework]
  lmti framework risk-zones [framework]
  lmti framework verify-plan --task "..." [--files a,b]
  lmti framework monorepo-map
  lmti actions start --task "..."
  lmti actions log --session-id "..." --type file_read --file "..."
  lmti actions command --session-id "..." --command "npm test" --exit-code 0
  lmti actions decision --session-id "..." --decision "..." --reason "..."
  lmti actions end --session-id "..." --status completed
  lmti actions list
  lmti actions show <session-id>
  lmti actions risks
  lmti actions replay <session-id>
  lmti cognition run "<task>"
  lmti cognition explain "<task>"
  lmti cognition state ["<task>"]
  lmti world check "<task>"
  lmti world cost "<task>"
  lmti world align "<task>"
  lmti world observe "<input>"
  lmti remember --kind rule --title "..." --content "..." --tags a,b --prompt-policy summarize_only
  lmti task done --title "..." --summary "..." [--lesson "..."]
  lmti privacy audit [--verify|--retain 1000]
  lmti privacy check
  lmti benchmark preflight "<task>" [--runs 5]

Commands:
  init      Create local .lmti storage.
  check     Alias for doctor.
  route     Alias for skill route.
  compile   Compile a project into .lmti/project.amf.json.
  migrate   Copy legacy Atlas state into canonical .lmti storage.
  doctor    Diagnose storage, AMF noise, ignore rules and security posture.
  inspect   Print Project Mind stats from AMF.
  context   Build a Context Pack JSON from AMF and a task.
  preflight Build a policy-safe MVP context package with hard memory gates.
  publish   Run publish/PR/release safety gates before public workflows.
  skill     Route tasks to skill.md instructions.
  thoth     Advanced skill routing and diagnostics.
  policy    Evaluate risky actions without executing them.
  config    Inspect LMTI config shape without printing raw values.
  agent     Provide safe machine-readable agent context.
  cleanup   Check cleanup readiness without modifying files.
  experiment Run local LMTI experiments.
  attach    Attach local LMTI guidance to Codex.
  memory    Manage local structured ATLAS memory.
  mind      Prepare intent-aware, privacy-safe Codex context from memory.
  framework Detect project frameworks, commands, risk zones and verification.
  actions   Track, audit and replay Codex/AI Agent actions.
  cognition Run the deterministic Cognitive Orchestrator.
  world     Run Reality Boundary and resource-bounded active inference checks.
  remember  Store a deliberate project rule or decision.
  task      Record completed task events and optional lesson candidates.
  privacy   Inspect Cognitive Privacy audit and memory safety.
  benchmark Measure local LMTI hot-path latency.
`);
}

type FlagValue = string | boolean;

function parseArgs(args: string[]): { positional: string[]; flags: Record<string, FlagValue> } {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }

  return { positional, flags };
}

function stringFlag(flags: Record<string, FlagValue>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function requiredStringFlag(flags: Record<string, FlagValue>, key: string, usage: string): string {
  const value = stringFlag(flags, key);
  if (!value) {
    throw new Error(usage);
  }
  return value;
}

function parseScope(value: string): MemoryScope {
  if (value === "short_term" || value === "long_term") {
    return value;
  }
  throw new Error(`Invalid memory scope: ${value}`);
}

function optionalScope(value?: string): MemoryScope | undefined {
  return value ? parseScope(value) : undefined;
}

function parseKind(value: string): MemoryKind {
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
  if (allowed.has(value as MemoryKind)) {
    return value as MemoryKind;
  }
  throw new Error(`Invalid memory kind: ${value}`);
}

function optionalKind(value?: string): MemoryKind | undefined {
  return value ? parseKind(value) : undefined;
}

function parseSensitivity(value: string): MemorySensitivity {
  const allowed = new Set<MemorySensitivity>(["public", "internal", "confidential", "secret"]);
  if (allowed.has(value as MemorySensitivity)) {
    return value as MemorySensitivity;
  }
  throw new Error(`Invalid memory sensitivity: ${value}`);
}

function parseRole(value: string): AccessRole {
  const allowed = new Set<AccessRole>(["owner", "maintainer", "developer", "agent", "readonly", "external_model"]);
  if (allowed.has(value as AccessRole)) {
    return value as AccessRole;
  }
  throw new Error(`Invalid access role: ${value}`);
}

function parsePromptPolicy(value: string): PromptPolicy {
  const allowed = new Set<PromptPolicy>(["allow_raw", "summarize_only", "do_not_prompt"]);
  if (allowed.has(value as PromptPolicy)) {
    return value as PromptPolicy;
  }
  throw new Error(`Invalid prompt policy: ${value}`);
}

function optionalLibraryZone(value?: string): LibraryZone | undefined {
  if (!value) {
    return undefined;
  }
  const allowed = new Set<LibraryZone>([
    "architecture",
    "codebase",
    "workflow",
    "deployment",
    "security",
    "decision",
    "lesson",
    "incident",
    "customer",
    "business",
    "prompting",
    "unknown"
  ]);
  if (allowed.has(value as LibraryZone)) {
    return value as LibraryZone;
  }
  throw new Error(`Invalid library memory zone: ${value}`);
}

function parseLibraryZones(value?: string): LibraryZone[] | undefined {
  const zones = parseCsv(value).map((zone) => optionalLibraryZone(zone)).filter((zone): zone is LibraryZone => Boolean(zone));
  return zones.length > 0 ? zones : undefined;
}

function optionalLibraryPrivacyLevel(value?: string): LibraryPrivacyLevel | undefined {
  if (!value) {
    return undefined;
  }
  const allowed = new Set<LibraryPrivacyLevel>(["public", "internal", "private", "secret", "do_not_prompt"]);
  if (allowed.has(value as LibraryPrivacyLevel)) {
    return value as LibraryPrivacyLevel;
  }
  throw new Error(`Invalid library privacy level: ${value}`);
}

function parsePrivacyMode(value?: string): "safe" | "internal" {
  if (!value || value === "safe") {
    return "safe";
  }
  if (value === "internal") {
    return "internal";
  }
  throw new Error(`Invalid privacy mode: ${value}`);
}

function parseTaskOutcome(value?: string): TaskOutcome {
  if (!value) {
    return "unknown";
  }
  if (value === "pass" || value === "fail" || value === "partial" || value === "unknown") {
    return value;
  }
  throw new Error(`Invalid task outcome: ${value}`);
}

function inferOutcomeFlag(flags: Record<string, FlagValue>): string | undefined {
  if (flags.pass) {
    return "pass";
  }
  if (flags.fail) {
    return "fail";
  }
  if (flags.partial) {
    return "partial";
  }
  return undefined;
}

function parseLessonType(value?: string): LessonCandidateType | undefined {
  if (!value) {
    return undefined;
  }
  const allowed = new Set<LessonCandidateType>([
    "bug_fix",
    "architecture",
    "security",
    "testing",
    "deployment",
    "workflow",
    "permission",
    "data_model",
    "cli",
    "other"
  ]);
  if (allowed.has(value as LessonCandidateType)) {
    return value as LessonCandidateType;
  }
  throw new Error(`Invalid lesson type: ${value}`);
}

function parseLessonApprovalStatus(value?: string): LessonApprovalStatus | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "pending" || value === "approved" || value === "rejected" || value === "needs_review") {
    return value;
  }
  throw new Error(`Invalid lesson approval status: ${value}`);
}

function parseLessonPrivacyStatus(value?: string): TaskObservationPrivacyStatus | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "pass" || value === "warning" || value === "blocked") {
    return value;
  }
  throw new Error(`Invalid lesson privacy status: ${value}`);
}

function parseFileTouchSummaries(value?: string): FileTouchSummary[] {
  return parseCsv(value).map((entry) => {
    const parsed = parseTrailingToken(entry, ["created", "modified", "deleted", "renamed"]);
    return {
      path: parsed.head,
      changeType: (parsed.tail ?? "modified") as FileTouchSummary["changeType"]
    };
  });
}

function parseCommandRunSummaries(value?: string): CommandRunSummary[] {
  return parseCsv(value).map((entry) => {
    const parsed = parseTrailingNumber(entry);
    const exitCode = parsed.tail;
    return {
      command: parsed.head,
      exitCode,
      status: exitCode === null ? "unknown" : exitCode === 0 ? "pass" : "fail",
      outputRedacted: true
    };
  });
}

function parseTestRunSummaries(value?: string): TestRunSummary[] {
  return parseCsv(value).map((entry) => {
    const parsed = parseTrailingToken(entry, ["pass", "fail", "unknown"]);
    const status = (parsed.tail ?? "unknown") as TestRunSummary["status"];
    return {
      name: parsed.head,
      status,
      command: parsed.head
    };
  });
}

function parseErrorSummaries(value?: string): ErrorSummary[] {
  return parseCsv(value).map((entry) => ({
    message: entry,
    severity: "medium"
  }));
}

function parseDecisionSummaries(value?: string): DecisionSummary[] {
  return parseCsv(value).map((entry) => ({
    decision: entry,
    source: "user"
  }));
}

function parseSourceRefs(value?: string): SourceRef[] {
  return parseCsv(value).map((entry) => {
    const parsed = parseTrailingToken(entry, ["file", "test", "command", "task", "user", "memory", "other"]);
    return {
      ref: parsed.head,
      kind: (parsed.tail ?? "other") as SourceRef["kind"]
    };
  });
}

function parseTrailingToken<T extends string>(value: string, allowed: readonly T[]): { head: string; tail?: T } {
  const index = value.lastIndexOf(":");
  if (index <= 0) {
    return { head: value };
  }
  const tail = value.slice(index + 1).trim();
  if (!allowed.includes(tail as T)) {
    return { head: value };
  }
  return { head: value.slice(0, index).trim(), tail: tail as T };
}

function parseTrailingNumber(value: string): { head: string; tail: number | null } {
  const index = value.lastIndexOf(":");
  if (index <= 0) {
    return { head: value, tail: null };
  }
  const tail = Number(value.slice(index + 1).trim());
  if (!Number.isFinite(tail)) {
    return { head: value, tail: null };
  }
  return { head: value.slice(0, index).trim(), tail };
}

function parseCodexActionType(value: string): CodexActionType {
  const allowed = new Set<CodexActionType>([
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
  ]);
  if (allowed.has(value as CodexActionType)) {
    return value as CodexActionType;
  }
  throw new Error(`Invalid codex action type: ${value}`);
}

function actionTypeToFileEvent(type: CodexActionType): CodexFileEventType {
  switch (type) {
    case "file_read":
      return "read";
    case "file_created":
      return "created";
    case "file_deleted":
      return "deleted";
    case "file_renamed":
      return "renamed";
    case "file_modified":
    default:
      return "modified";
  }
}

function parseCodexSessionStatus(value: string): CodexSessionStatus {
  const allowed = new Set<CodexSessionStatus>(["running", "completed", "failed", "blocked", "rolled_back", "needs_review"]);
  if (allowed.has(value as CodexSessionStatus)) {
    return value as CodexSessionStatus;
  }
  throw new Error(`Invalid codex session status: ${value}`);
}

function parseCodexMemoryType(value: string): CodexMemoryUsageType {
  const allowed = new Set<CodexMemoryUsageType>(["short", "long", "guardrail", "task_hint"]);
  if (allowed.has(value as CodexMemoryUsageType)) {
    return value as CodexMemoryUsageType;
  }
  throw new Error(`Invalid codex memory type: ${value}`);
}

function parseShortMemoryPriority(value: string): ShortMemoryPriority {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  throw new Error(`Invalid short memory priority: ${value}`);
}

function parseShortMemoryTtl(flags: Record<string, FlagValue>): { minutes?: number; hours?: number; days?: number } | undefined {
  const minutes = optionalNumberFlag(flags, "ttl-minutes");
  const hours = optionalNumberFlag(flags, "ttl-hours");
  const days = optionalNumberFlag(flags, "ttl-days");
  return minutes === undefined && hours === undefined && days === undefined ? undefined : { minutes, hours, days };
}

function parseNowFlag(flags: Record<string, FlagValue>): Date | undefined {
  const value = stringFlag(flags, "now");
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO date for --now: ${value}`);
  }
  return parsed;
}

function parseConfidence(value: string): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  throw new Error(`Invalid memory confidence: ${value}`);
}

function parseCsv(value?: string): string[] {
  return value
    ? value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

function parseNumberFlag(flags: Record<string, FlagValue>, key: string, fallback: number): number {
  const value = stringFlag(flags, key);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumberFlag(flags: Record<string, FlagValue>, key: string): number | undefined {
  const value = stringFlag(flags, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for --${key}: ${value}`);
  }
  return parsed;
}

function parseBooleanFlag(flags: Record<string, FlagValue>, key: string, fallback = true): boolean {
  const value = flags[key];
  if (value === undefined) {
    return fallback;
  }
  if (value === true) {
    return true;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1" || value.toLowerCase() === "yes";
  }
  return false;
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1));
  return sortedValues[index];
}

async function detectProjectId(): Promise<string> {
  try {
    const amf = await readAmfDocument(undefined, process.cwd());
    return amf.project.name;
  } catch {
    return "default";
  }
}

function createCliPrivacyContext(role: AccessRole, flags: Record<string, FlagValue>, command: string, purpose: string) {
  return createPrivacyContext({
    role,
    projectId: "local",
    purpose,
    includeSecret: Boolean(flags["include-secret"]),
    includeRaw: Boolean(flags["include-raw"]),
    command
  });
}

function warnIfSensitive(memory: MemoryRecord): void {
  if (memory.sensitivity === "confidential" || memory.sensitivity === "secret") {
    console.warn(`[LMTI] Stored ${memory.sensitivity} memory. Raw content is withheld from CLI output.`);
  }
}

function safeMemoryForCli(memory: MemoryRecord): MemoryRecord {
  if (memory.sensitivity === "secret") {
    return { ...memory, content: "[REDACTED]" };
  }
  if (memory.sensitivity === "confidential") {
    return { ...memory, content: "Confidential memory stored; content withheld." };
  }
  return { ...memory, title: redactText(memory.title), content: redactText(memory.content) };
}

if (process.argv[1] && path.basename(process.argv[1]) === "index.js") {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[LMTI] ${message}`);
    process.exitCode = error instanceof CliUsageError ? error.exitCode : 3;
  });
}
