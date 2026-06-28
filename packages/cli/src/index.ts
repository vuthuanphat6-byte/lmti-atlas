#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { compileProject } from "@atlas/compiler";
import {
  checkMemoryPrivacy,
  createMemory,
  createDefaultLmtiConfig,
  deleteMemory,
  initAtlasStorage,
  listMemory,
  EXPERIMENTS_DIR,
  type LmtiConfig,
  promoteMemory,
  readAmfDocument,
  searchMemory,
  writeAmfDocument
} from "@atlas/memory";
import { buildContextPack, formatInspection, inspectAmf } from "@atlas/kernel";
import { createPrivacyContext, readAuditEvents, redactText } from "@atlas/privacy";
import type { AccessRole, AmfDocument, FileEntry, MemoryKind, MemoryRecord, MemoryScope, MemorySensitivity, ModuleEntry, NewMemoryRecord } from "@atlas/types";

export async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;

  switch (command) {
    case "init":
      await runInit();
      return;
    case "compile":
      await runCompile(args);
      return;
    case "inspect":
      await runInspect(args);
      return;
    case "context":
      await runContext(args);
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
    case "privacy":
      await runPrivacy(args);
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

async function runInit(): Promise<void> {
  const storage = await initCommand(process.cwd());
  console.log("LMTI initialized.");
  console.log(`Storage: ${storage.atlasDir}`);
  console.log(`Config: ${storage.configPath}`);
  console.log(`AMF: ${storage.amfPath}`);
  console.log(`Index: ${storage.indexPath}`);
}

export async function initCommand(cwd: string) {
  return initAtlasStorage(cwd);
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

  const { amf, storage } = await compileCommand(process.cwd(), projectPath);

  console.log("Done.");
  console.log("");
  console.log(`${amf.project.name} compiled.`);
  console.log(`${storage.amfPath} generated.`);
}

export async function compileCommand(cwd: string, projectPath = ".") {
  const amf = await compileProject(projectPath, { cwd });
  const storage = await writeAmfDocument(amf, cwd);
  return { amf, storage };
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
  console.log(JSON.stringify(contextPack, null, 2));
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
  const includeSecret = Boolean(options.includeSecret);
  const role = options.role ?? "developer";
  const amf = await readCompiledAmf(cwd, options.amfPath);
  const memories = await searchMemory(task, {
    cwd,
    includeSecret,
    privacyContext: createCliPrivacyContext(role, flags, "context", "context generation"),
    limit: 16
  });
  return buildContextPack(amf, task, { memories, includeSecret });
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
  console.log(JSON.stringify(result, null, 2));
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
    case "promote":
      await runMemoryPromote(rest);
      return;
    case "delete":
      await runMemoryDelete(rest);
      return;
    default:
      throw new Error("Usage: lmti memory <add|list|search|promote|delete>");
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
  console.log(JSON.stringify(safeMemoryForCli(memory), null, 2));
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
  console.log(JSON.stringify(memories, null, 2));
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
  console.log(JSON.stringify(results, null, 2));
}

async function runMemoryPromote(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    throw new Error("Usage: lmti memory promote <id>");
  }
  console.log(JSON.stringify(await promoteMemory(id, { cwd: process.cwd() }), null, 2));
}

async function runMemoryDelete(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    throw new Error("Usage: lmti memory delete <id>");
  }
  const deleted = await deleteMemory(id, { cwd: process.cwd() });
  console.log(JSON.stringify({ id, deleted }, null, 2));
}

async function runPrivacy(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  const { flags } = parseArgs(rest);

  switch (subcommand) {
    case "audit":
      console.log(JSON.stringify(await readAuditEvents(process.cwd(), parseNumberFlag(flags, "limit", 50)), null, 2));
      return;
    case "check":
      console.log(JSON.stringify(await checkMemoryPrivacy({ cwd: process.cwd() }), null, 2));
      return;
    default:
      throw new Error("Usage: lmti privacy <audit|check>");
  }
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

Suggested local command:

lmti context "<task>"
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

function printHelp(): void {
  console.log(`LMTI - Atlas

Usage:
  lmti init
  lmti compile [projectPath]
  lmti inspect [amfPath]
  lmti context "<task>" [amfPath] [--include-secret]
  lmti experiment thinking "<task>"
  lmti attach codex
  lmti memory add --scope short_term --kind task --title "..." --content "..."
  lmti memory list [--scope short_term|long_term] [--role developer]
  lmti memory search "<query>" [--role agent] [--include-secret]
  lmti memory promote <id>
  lmti memory delete <id>
  lmti privacy audit
  lmti privacy check

Commands:
  init      Create local .lmti storage.
  compile   Compile a project into .lmti/project.amf.json.
  inspect   Print Project Mind stats from AMF.
  context   Build a Context Pack JSON from AMF and a task.
  experiment Run local LMTI experiments.
  attach    Attach local LMTI guidance to Codex.
  memory    Manage local structured ATLAS memory.
  privacy   Inspect Cognitive Privacy audit and memory safety.
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
  const allowed = new Set<MemoryKind>(["task", "decision", "rule", "bug", "risk", "summary", "preference", "experience", "system_note"]);
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
    includeRaw: Boolean(flags["include-raw"]) || Boolean(flags["include-secret"]),
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
