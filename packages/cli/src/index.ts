#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { compileProject } from "@atlas/compiler";
import { contextPackToCognitiveItems, runCognitiveCycle } from "@atlas/cognition";
import { contextPackToBeliefs, contextPackToSensoryInputs, estimateComputeCost, runWorldModelCycle } from "@atlas/world-model";
import {
  checkMemoryPrivacy,
  consolidateMemory,
  createMemory,
  createDefaultLmtiConfig,
  deleteMemory,
  decayMemoryLifecycle,
  explainMemory,
  getMemoryAssociations,
  initAtlasStorage,
  listMemory,
  EXPERIMENTS_DIR,
  type InitResult,
  type LmtiConfig,
  promoteMemory,
  recordTaskDone,
  reinforceMemory,
  reviewMemory,
  readAmfDocument,
  fetchAllowedMemoryContent,
  retrieveMemoryMetadata,
  searchMemory,
  searchMemoryForContext,
  writeAmfDocument
} from "@atlas/memory";
import { buildContextPack, formatInspection, inferIntent, inspectAmf } from "@atlas/kernel";
import {
  canonicalStoragePaths,
  detectLegacyAtlasStorage,
  doctorLmti,
  formatDoctorReport,
  formatMigrationResult,
  migrateAtlasToLmti,
  type DoctorReport,
  type MigrationResult
} from "@atlas/migration";
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
  ContextCandidate,
  ContextPackage,
  ContextRequest,
  FileEntry,
  InferredIntent,
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
  PromptPolicy
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

export async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;

  switch (command) {
    case "init":
      await runInit(args);
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
      await runPreflight(args);
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
      throw new Error(`Unknown command: ${command}`);
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
    printSafeJson(await doctorSecurityCommand(process.cwd()), "doctor security");
    return;
  }
  const report = await doctorCommand(process.cwd(), { fix: Boolean(flags.fix) });
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

async function runPreflight(args: string[]): Promise<void> {
  if (args.length === 0) {
    throw new Error('Usage: lmti preflight "<task>" [amfPath] [--role developer] [--model-target external_model]');
  }

  const { positional, flags } = parseArgs(args);
  const task = positional[0];
  const amfPath = positional[1];
  const role = parseRole(stringFlag(flags, "role") ?? "developer");
  const modelTarget = stringFlag(flags, "model-target");
  const result = await preflightCommand(process.cwd(), task, { amfPath, role, modelTarget, flags });
  printSafeJson(result, "preflight");
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
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/Ä‘/g, "d")
    .replace(/Ä/g, "d")
    .toLowerCase();
}

async function runMemory(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "add":
      await runMemoryAdd(rest);
      return;
    case "list":
      await runMemoryList(rest);
      return;
    case "search":
      await runMemorySearch(rest);
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
      throw new Error("Usage: lmti memory <add|list|search|consolidate|decay|reinforce|review|associations|explain|promote|delete>");
  }
}

async function runMemoryAdd(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
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
    throw new Error('Usage: lmti memory search "<query>" [--include-secret]');
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
  printSafeJson(results, "memory search");
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
    throw new Error('Usage: lmti remember --kind lesson --title "..." --content "..." --tags a,b --sensitivity internal --prompt-policy summarize_only');
  }

  const inferred = inferIntent(`${title} ${content}`);
  const tags = Array.from(new Set([...parseCsv(stringFlag(flags, "tags")), inferred.primaryIntent, ...inferred.secondaryIntents].filter((tag) => tag && tag !== "unknown")));

  return createMemory(
    {
      scope: "long_term",
      kind: parseKind(stringFlag(flags, "kind") ?? "lesson"),
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
  return recordTaskDone(
    {
      title,
      summary,
      lesson: stringFlag(flags, "lesson"),
      tags: parseCsv(stringFlag(flags, "tags")),
      sensitivity: parseSensitivity(stringFlag(flags, "sensitivity") ?? "internal"),
      promptPolicy: parsePromptPolicy(stringFlag(flags, "prompt-policy") ?? "summarize_only"),
      projectId: stringFlag(flags, "project-id") ?? (await detectProjectId()),
      taskIntent
    },
    { cwd }
  );
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

Codex must treat LMTI as the project mind layer.

Before making changes, Codex should:

1. Read .lmti/project.amf.json if available.
2. Use LMTI context when the task is unclear or touches multiple modules.
3. Prefer compiled understanding over repeatedly scanning the entire repository.
4. Respect .lmti privacy rules.
5. Never expose secret memory or confidential project knowledge in raw form.
6. After completing a task, summarize what changed and suggest what should be stored as long-term memory.
7. If a task reveals a reusable rule, bug, route, deploy note, permission rule or architecture constraint, prefer \`lmti task done --lesson "..."\` or \`lmti memory consolidate\` over storing raw chat.

Suggested local command:

lmti context "<task>"
lmti preflight "<task>" --role developer --model-target external_model
lmti memory explain "<task>"
lmti memory review
lmti benchmark preflight "<task>" --runs 5
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
  const serialized = JSON.stringify(value, null, 2);
  const scan = runEgressSecretScan(serialized);
  if (scan.blocked) {
    console.warn(`[LMTI] ${label} output matched secret patterns and was redacted before printing.`);
  }
  console.log(redactText(serialized));
}

function printHelp(): void {
  console.log(`LMTI - Atlas

Usage:
  lmti init [--yes]
  lmti compile [projectPath]
  lmti migrate [--yes]
  lmti doctor [--fix|--security]
  lmti inspect [amfPath]
  lmti context "<task>" [amfPath] [--include-secret]
  lmti preflight "<task>" [amfPath] [--role developer] [--model-target external_model]
  lmti experiment thinking "<task>"
  lmti attach codex
  lmti memory add --scope short_term --kind task --title "..." --content "..."
  lmti memory list [--scope short_term|long_term] [--role developer]
  lmti memory search "<query>" [--role agent] [--include-secret]
  lmti memory consolidate
  lmti memory decay
  lmti memory reinforce <id> --success true|false
  lmti memory review
  lmti memory associations <id>
  lmti memory explain "<query>"
  lmti memory promote <id>
  lmti memory delete <id>
  lmti cognition run "<task>"
  lmti cognition explain "<task>"
  lmti cognition state ["<task>"]
  lmti world check "<task>"
  lmti world cost "<task>"
  lmti world align "<task>"
  lmti world observe "<input>"
  lmti remember --kind lesson --title "..." --content "..." --tags a,b --prompt-policy summarize_only
  lmti task done --title "..." --summary "..." [--lesson "..."]
  lmti privacy audit [--verify|--retain 1000]
  lmti privacy check
  lmti benchmark preflight "<task>" [--runs 5]

Commands:
  init      Create local .lmti storage.
  compile   Compile a project into .lmti/project.amf.json.
  migrate   Copy legacy Atlas state into canonical .lmti storage.
  doctor    Diagnose duplicate/incomplete storage or security posture.
  inspect   Print Project Mind stats from AMF.
  context   Build a Context Pack JSON from AMF and a task.
  preflight Build a policy-safe MVP context package with hard memory gates.
  experiment Run local LMTI experiments.
  attach    Attach local LMTI guidance to Codex.
  memory    Manage local structured ATLAS memory.
  cognition Run the deterministic Cognitive Orchestrator.
  world     Run Reality Boundary and resource-bounded active inference checks.
  remember  Store a deliberate project lesson, rule or decision.
  task      Record completed task events and optional lessons.
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
    process.exitCode = 1;
  });
}
