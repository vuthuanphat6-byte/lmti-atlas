import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  AMF_VERSION,
  type ApiEntry,
  type ArchitectureEntry,
  type AmfDocument,
  type Confidence,
  type DatabaseEntry,
  type DependencyEntry,
  type FileEntry,
  type HistoryEntry,
  type ModuleEntry,
  type PrivacyLevel,
  type RiskEntry,
  type RuleEntry,
  type SummaryEntry,
  type SymbolEntry,
  type UnresolvedQuestionEntry
} from "@atlas/types";
import { attachModuleDependencies } from "@atlas/graph";

const COMPILER_VERSION = "0.1.0";
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

const IGNORED_DIRECTORIES = [
  ".lmti",
  ".atlas",
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "cache",
  "logs",
  "tmp",
  "temp",
  "vendor"
];

const IGNORED_FILE_PATTERNS = [
  /^\.env(?:\..*)?$/i,
  /^\.npmrc$/i,
  /^\.yarnrc$/i,
  /^id_rsa(?:\.pub)?$/i,
  /^id_ed25519(?:\.pub)?$/i,
  /\.tsbuildinfo$/i,
  /\.(?:pem|key|p12|pfx|crt|cer|token)$/i
];

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".prisma",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const DATABASE_EXTENSIONS = new Set([".sql", ".prisma"]);

export interface CompileOptions {
  cwd?: string;
  maxFileBytes?: number;
}

interface ObservedFile {
  absolutePath: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  text: string | null;
  skippedReason?: string;
}

interface ParsedFile {
  api: ApiEntry[];
  database: DatabaseEntry[];
  dependencies: DependencyEntry[];
  symbols: SymbolEntry[];
  risks: RiskEntry[];
  rules: RuleEntry[];
  summary: string;
  privacy: PrivacyLevel;
  riskFlags: string[];
}

export async function compileProject(projectPath: string, options: CompileOptions = {}): Promise<AmfDocument> {
  const cwd = options.cwd ?? process.cwd();
  const root = path.resolve(cwd, projectPath);
  const rootStat = await fs.stat(root);

  if (!rootStat.isDirectory()) {
    throw new Error(`Project path is not a directory: ${root}`);
  }

  const realRoot = await fs.realpath(root);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const observedFiles = await scanProject(realRoot, maxFileBytes);
  const projectName = await detectProjectName(realRoot);
  const fileSet = new Set(observedFiles.map((file) => file.relativePath));
  const fileToModule = new Map<string, string>();

  const files: FileEntry[] = [];
  const api: ApiEntry[] = [];
  const database: DatabaseEntry[] = [];
  const dependencies: DependencyEntry[] = [];
  const symbols: SymbolEntry[] = [];
  const risks: RiskEntry[] = [];
  const rules: RuleEntry[] = [];
  const summaries: SummaryEntry[] = [];
  const modulesByName = new Map<string, ModuleEntry>();

  let riskCounter = 1;
  let ruleCounter = 1;

  for (const observed of observedFiles) {
    const moduleName = detectModuleName(observed.relativePath);
    fileToModule.set(observed.relativePath, moduleName);

    const moduleEntry = getOrCreateModule(modulesByName, moduleName, observed.relativePath);
    moduleEntry.files.push(observed.relativePath);

    const parsed = parseObservedFile(observed, moduleName, fileSet, riskCounter, ruleCounter);
    riskCounter += parsed.risks.length;
    ruleCounter += parsed.rules.length;

    files.push({
      path: observed.relativePath,
      extension: observed.extension,
      kind: detectFileKind(observed.relativePath),
      module: moduleName,
      sizeBytes: observed.sizeBytes,
      lines: observed.text ? countLines(observed.text) : 0,
      hash: hashText(observed.text ?? `${observed.relativePath}:${observed.sizeBytes}`),
      summary: parsed.summary,
      privacy: parsed.privacy,
      riskFlags: parsed.riskFlags
    });

    dependencies.push(...parsed.dependencies);
    symbols.push(...parsed.symbols);
    api.push(...parsed.api);
    database.push(...parsed.database);
    risks.push(...parsed.risks);
    rules.push(...parsed.rules);
    summaries.push({
      target: observed.relativePath,
      targetType: "file",
      text: parsed.summary,
      confidence: observed.text ? "medium" : "low"
    });
  }

  for (const symbol of symbols) {
    modulesByName.get(symbol.module)?.symbols.push(symbol.name);
  }

  dependencies.push(...extractPackageDependencies(observedFiles, riskCounter));

  const modules = attachModuleDependencies(
    Array.from(modulesByName.values()).map((module) => ({
      ...module,
      files: module.files.sort(),
      symbols: Array.from(new Set(module.symbols)).sort(),
      summary: summarizeModule(module)
    })),
    dependencies,
    fileToModule
  ).sort((a, b) => a.name.localeCompare(b.name));

  for (const module of modules) {
    summaries.push({
      target: module.name,
      targetType: "module",
      text: module.summary,
      confidence: module.confidence
    });
  }

  summaries.unshift({
    target: projectName,
    targetType: "project",
    text: summarizeProject(projectName, files, modules, dependencies, risks),
    confidence: "medium"
  });

  const architecture = createArchitectureEntries(modules, dependencies, risks);
  const history = createHistoryEntries(projectName, observedFiles, maxFileBytes);
  const unresolvedQuestions = createUnresolvedQuestions(projectName, api, database, rules, risks);

  const checksum = hashText(
    JSON.stringify({
      files: files.map((file) => [file.path, file.hash]),
      api: api.map((entry) => [entry.source, entry.method, entry.route, entry.kind]),
      database: database.map((entry) => [entry.source, entry.name, entry.kind]),
      dependencies: dependencies.map((dependency) => [dependency.from, dependency.to, dependency.kind]),
      symbols: symbols.map((symbol) => [symbol.file, symbol.name, symbol.kind])
    })
  );

  const generatedAt = new Date().toISOString();

  return {
    version: AMF_VERSION,
    generatedAt,
    project: {
      name: projectName,
      root: normalizePath(realRoot),
      compiledAt: generatedAt,
      atlasVersion: "0.0.0",
      amfVersion: AMF_VERSION,
      compiler: {
        name: "Knowledge Compiler v0",
        version: COMPILER_VERSION
      },
      sourceBoundary: {
        root: normalizePath(realRoot),
        ignoredDirectories: IGNORED_DIRECTORIES,
        ignoredFiles: IGNORED_FILE_PATTERNS.map((pattern) => pattern.source),
        maxFileBytes
      },
      checksum
    },
    modules,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    symbols: symbols.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name)),
    dependencies: dedupeDependencies(dependencies).sort((a, b) => {
      return a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind);
    }),
    api: api.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name)),
    database: database.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name)),
    rules,
    risks,
    history,
    architecture,
    summaries,
    unresolvedQuestions
  };
}

async function scanProject(root: string, maxFileBytes: number): Promise<ObservedFile[]> {
  const observed: ObservedFile[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (isIgnoredDirectory(entry.name)) {
          continue;
        }
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = normalizePath(path.relative(root, absolutePath));
      if (isIgnoredFile(entry.name, relativePath)) {
        continue;
      }

      const stats = await fs.stat(absolutePath);
      const extension = path.extname(entry.name).toLowerCase();

      if (stats.size > maxFileBytes) {
        observed.push({
          absolutePath,
          relativePath,
          extension,
          sizeBytes: stats.size,
          text: null,
          skippedReason: "file-too-large"
        });
        continue;
      }

      if (!isTextCandidate(entry.name, extension)) {
        observed.push({
          absolutePath,
          relativePath,
          extension,
          sizeBytes: stats.size,
          text: null,
          skippedReason: "non-text"
        });
        continue;
      }

      const text = await fs.readFile(absolutePath, "utf8");
      observed.push({
        absolutePath,
        relativePath,
        extension,
        sizeBytes: stats.size,
        text: text.includes("\u0000") ? null : text,
        skippedReason: text.includes("\u0000") ? "binary-like-text" : undefined
      });
    }
  }

  await walk(root);
  return observed;
}

function parseObservedFile(
  file: ObservedFile,
  moduleName: string,
  fileSet: Set<string>,
  riskStart: number,
  ruleStart: number
): ParsedFile {
  if (!file.text) {
    return {
      api: [],
      database: [],
      dependencies: [],
      symbols: [],
      risks: [],
      rules: [],
      summary: `Skipped ${file.relativePath} (${file.skippedReason ?? "unreadable"}).`,
      privacy: "internal",
      riskFlags: file.skippedReason === "file-too-large" ? ["large_file_skipped"] : []
    };
  }

  const dependencies = SOURCE_EXTENSIONS.has(file.extension)
    ? extractCodeDependencies(file.relativePath, file.text, fileSet)
    : [];
  const symbols = SOURCE_EXTENSIONS.has(file.extension)
    ? extractSymbols(file.relativePath, file.text, moduleName)
    : [];
  const api = SOURCE_EXTENSIONS.has(file.extension) ? extractApiEntries(file.relativePath, file.text, symbols) : [];
  const database = DATABASE_EXTENSIONS.has(file.extension)
    ? extractDatabaseEntries(file.relativePath, file.text)
    : [];
  const risks = extractRisks(file.relativePath, file.text, riskStart);
  const rules = extractRules(file.relativePath, file.text, ruleStart);
  const riskFlags = risks.map((risk) => risk.type);
  const privacy: PrivacyLevel = risks.some((risk) => risk.type === "secret") ? "protected" : "internal";

  return {
    api,
    database,
    dependencies,
    symbols,
    risks,
    rules,
    summary: summarizeFile(file, dependencies, symbols),
    privacy,
    riskFlags
  };
}

function extractCodeDependencies(filePath: string, text: string, fileSet: Set<string>): DependencyEntry[] {
  const dependencies: DependencyEntry[] = [];
  const patterns: Array<{ regex: RegExp; kind: DependencyEntry["kind"] }> = [
    { regex: /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g, kind: "import" },
    { regex: /\bexport\s+[^'"]+\s+from\s+["']([^"']+)["']/g, kind: "export" },
    { regex: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, kind: "require" },
    { regex: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, kind: "dynamic-import" }
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const specifier = match[1];
      const external = isExternalSpecifier(specifier);
      dependencies.push({
        from: filePath,
        to: external ? specifier : resolveRelativeSpecifier(filePath, specifier, fileSet),
        specifier,
        kind: pattern.kind,
        external
      });
    }
  }

  return dedupeDependencies(dependencies);
}

function extractPackageDependencies(observedFiles: ObservedFile[], riskStart: number): DependencyEntry[] {
  const dependencies: DependencyEntry[] = [];
  let riskOffset = riskStart;
  void riskOffset;

  for (const file of observedFiles) {
    if (path.basename(file.relativePath) !== "package.json" || !file.text) {
      continue;
    }

    try {
      const manifest = JSON.parse(file.text) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const groups = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies];
      for (const group of groups) {
        for (const name of Object.keys(group ?? {})) {
          dependencies.push({
            from: file.relativePath,
            to: name,
            specifier: name,
            kind: "package",
            external: true
          });
        }
      }
    } catch {
      // Invalid manifests are handled as low-confidence project understanding.
    }
  }

  return dedupeDependencies(dependencies);
}

function extractSymbols(filePath: string, text: string, moduleName: string): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const patterns: Array<{ regex: RegExp; kind: SymbolEntry["kind"]; exported: boolean }> = [
    { regex: /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, kind: "function", exported: true },
    { regex: /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, kind: "class", exported: true },
    { regex: /\bexport\s+interface\s+([A-Za-z_$][\w$]*)/g, kind: "interface", exported: true },
    { regex: /\bexport\s+type\s+([A-Za-z_$][\w$]*)/g, kind: "type", exported: true },
    { regex: /\bexport\s+const\s+([A-Za-z_$][\w$]*)/g, kind: "constant", exported: true },
    { regex: /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, kind: "function", exported: false },
    { regex: /(?:^|\n)\s*class\s+([A-Za-z_$][\w$]*)/g, kind: "class", exported: false },
    { regex: /(?:^|\n)\s*const\s+([A-Za-z_$][\w$]*)/g, kind: "constant", exported: false }
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const name = match[1];
      if (symbols.some((symbol) => symbol.name === name && symbol.file === filePath)) {
        continue;
      }
      symbols.push({
        name,
        kind: pattern.kind,
        file: filePath,
        line: lineNumberAt(text, match.index),
        module: moduleName,
        exported: pattern.exported
      });
    }
  }

  return symbols;
}

function extractApiEntries(filePath: string, text: string, symbols: SymbolEntry[]): ApiEntry[] {
  const entries: ApiEntry[] = [];
  const routePatterns: Array<{ regex: RegExp; methodIndex: number; routeIndex: number }> = [
    { regex: /\b(?:app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/gi, methodIndex: 1, routeIndex: 2 },
    { regex: /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*["'`]?([^"'`)]*)["'`]?\s*\)/g, methodIndex: 1, routeIndex: 2 },
    {
      regex: /\bmethod\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)["'`][\s\S]{0,160}?\bpath\s*:\s*["'`]([^"'`]+)["'`]/gi,
      methodIndex: 1,
      routeIndex: 2
    }
  ];

  for (const pattern of routePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const method = normalizeHttpMethod(match[pattern.methodIndex]);
      const route = sanitizeRoute(match[pattern.routeIndex] ?? "");
      const line = lineNumberAt(text, match.index);
      if (!route) {
        continue;
      }
      entries.push({
        id: stableId("API", `${filePath}:${line}:${method}:${route}`),
        name: `${method ?? "UNKNOWN"} ${route}`,
        kind: "http-route",
        source: `${filePath}:${line}`,
        method,
        route,
        summary: `HTTP ${method ?? "UNKNOWN"} route declared in ${filePath}.`,
        confidence: "medium",
        privacy: "internal"
      });
    }
  }

  const apiLikePath = /(^|\/)(api|routes|controllers?|handlers?)(\/|$)/i.test(filePath);
  if (apiLikePath && entries.length === 0) {
    const exportedHandler = symbols.find((symbol) => symbol.exported && ["function", "class", "constant"].includes(symbol.kind));
    entries.push({
      id: stableId("API", `${filePath}:handler`),
      name: exportedHandler?.name ?? path.posix.basename(filePath),
      kind: exportedHandler?.kind === "class" ? "controller" : "handler",
      source: exportedHandler ? `${filePath}:${exportedHandler.line}` : filePath,
      summary: `API-like boundary inferred from ${filePath}.`,
      confidence: "low",
      privacy: "internal"
    });
  }

  return dedupeById(entries);
}

function extractDatabaseEntries(filePath: string, text: string): DatabaseEntry[] {
  const entries: DatabaseEntry[] = [];
  const patterns: Array<{ regex: RegExp; kind: DatabaseEntry["kind"] }> = [
    { regex: /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([A-Za-z_][\w.]*)["'`]?/gi, kind: "table" },
    { regex: /^\s*model\s+([A-Za-z_][\w]*)\s*\{/gm, kind: "model" },
    { regex: /^\s*(?:CREATE|ALTER|DROP)\s+(?:INDEX|VIEW|SCHEMA)\s+["'`]?([A-Za-z_][\w.]*)["'`]?/gim, kind: "schema" }
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const name = sanitizeIdentifier(match[1]);
      if (!name) {
        continue;
      }
      const line = lineNumberAt(text, match.index);
      entries.push({
        id: stableId("DB", `${filePath}:${line}:${pattern.kind}:${name}`),
        name,
        kind: pattern.kind,
        source: `${filePath}:${line}`,
        summary: `Database ${pattern.kind} "${name}" declared in ${filePath}.`,
        confidence: "medium",
        privacy: "internal"
      });
    }
  }

  if (entries.length === 0) {
    entries.push({
      id: stableId("DB", `${filePath}:database-file`),
      name: path.posix.basename(filePath),
      kind: filePath.endsWith(".prisma") ? "schema" : "migration",
      source: filePath,
      summary: `Database-related file observed at ${filePath}.`,
      confidence: "low",
      privacy: "internal"
    });
  }

  return dedupeById(entries);
}

function extractRisks(filePath: string, text: string, riskStart: number): RiskEntry[] {
  const risks: RiskEntry[] = [];
  const secretPatterns = [
    /\b(api[_-]?key|secret|token|password|passwd|private[_-]?key)\b\s*[:=]\s*["']?[^"'\s]{8,}/i,
    /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/i
  ];
  const unsafePatterns = [
    { regex: /\beval\s*\(/, message: "Dynamic eval usage can lead to code execution risk." },
    { regex: /\bnew\s+Function\s*\(/, message: "Dynamic Function constructor can lead to code execution risk." },
    { regex: /\bchild_process\b|\bexec\s*\(|\bspawn\s*\(/, message: "Process execution surface detected." }
  ];

  let offset = 0;

  for (const regex of secretPatterns) {
    if (regex.test(text)) {
      risks.push({
        id: `RISK-${String(riskStart + offset).padStart(4, "0")}`,
        type: "secret",
        severity: "high",
        message: "Secret-like material detected and excluded from AMF content.",
        file: filePath,
        evidence: "secret-like pattern matched; value redacted",
        recommendation: "Move secrets to environment variables or a secret manager and keep them out of source control.",
        privacy: "protected"
      });
      offset += 1;
      break;
    }
  }

  for (const unsafe of unsafePatterns) {
    if (unsafe.regex.test(text)) {
      risks.push({
        id: `RISK-${String(riskStart + offset).padStart(4, "0")}`,
        type: "unsafe-code",
        severity: "medium",
        message: unsafe.message,
        file: filePath,
        evidence: "unsafe-code pattern matched; source text not copied",
        recommendation: "Review this execution surface and validate all inputs before use.",
        privacy: "internal"
      });
      offset += 1;
    }
  }

  return risks;
}

function extractRules(filePath: string, text: string, ruleStart: number): RuleEntry[] {
  const rules: RuleEntry[] = [];
  const lines = text.split(/\r?\n/);
  const ruleRegex = /\b(must|should|required|business rule|policy|invariant|never|always)\b/i;

  for (const [index, line] of lines.entries()) {
    if (!ruleRegex.test(line)) {
      continue;
    }
    const sanitized = sanitizeEvidence(line.trim());
    if (!sanitized) {
      continue;
    }
    rules.push({
      id: `RULE-${String(ruleStart + rules.length).padStart(4, "0")}`,
      text: sanitized,
      source: `${filePath}:${index + 1}`,
      confidence: "low"
    });
    if (rules.length >= 5) {
      break;
    }
  }

  return rules;
}

function summarizeFile(file: ObservedFile, dependencies: DependencyEntry[], symbols: SymbolEntry[]): string {
  if (file.extension === ".md" && file.text) {
    const heading = file.text.split(/\r?\n/).find((line) => line.trim().startsWith("#"));
    if (heading) {
      return `Documentation file headed "${sanitizeEvidence(heading.replace(/^#+\s*/, ""))}".`;
    }
  }

  if (path.basename(file.relativePath) === "package.json") {
    return `Package manifest with dependency metadata.`;
  }

  if (DATABASE_EXTENSIONS.has(file.extension)) {
    return `Database-related file in ${detectModuleName(file.relativePath)}.`;
  }

  if (SOURCE_EXTENSIONS.has(file.extension)) {
    return `Source file with ${symbols.length} detected symbols and ${dependencies.length} detected dependencies.`;
  }

  return `${detectFileKind(file.relativePath)} file observed by compiler.`;
}

function summarizeModule(module: ModuleEntry): string {
  const fileCount = module.files.length;
  const symbolCount = module.symbols.length;
  const fileWord = fileCount === 1 ? "file" : "files";
  return `Module ${module.name} contains ${fileCount} ${fileWord} and ${symbolCount} detected symbols.`;
}

function summarizeProject(
  projectName: string,
  files: FileEntry[],
  modules: ModuleEntry[],
  dependencies: DependencyEntry[],
  risks: RiskEntry[]
): string {
  return `${projectName} compiled into Project DNA with ${files.length} files, ${modules.length} modules, ${dependencies.length} dependencies and ${risks.length} risks.`;
}

function createHistoryEntries(projectName: string, observedFiles: ObservedFile[], maxFileBytes: number): HistoryEntry[] {
  const skipped = observedFiles.filter((file) => file.skippedReason).length;
  return [
    {
      id: "HISTORY-0001",
      kind: "compile",
      summary: `${projectName} compiled from ${observedFiles.length} observed files.`,
      confidence: "high",
      privacy: "internal"
    },
    {
      id: "HISTORY-0002",
      kind: "source-boundary",
      summary: `Compiler excluded ignored directories, secret-like filenames and files larger than ${maxFileBytes} bytes; ${skipped} files were skipped by type or size.`,
      confidence: "medium",
      privacy: "internal"
    }
  ];
}

function createArchitectureEntries(
  modules: ModuleEntry[],
  dependencies: DependencyEntry[],
  risks: RiskEntry[]
): ArchitectureEntry[] {
  const entries: ArchitectureEntry[] = [];

  for (const module of modules) {
    entries.push({
      id: stableId("ARCH", `module:${module.name}`),
      kind: "boundary",
      summary: `Module boundary "${module.name}" owns ${module.files.length} files and exposes ${module.symbols.length} detected symbols.`,
      source: module.path,
      confidence: module.confidence,
      privacy: "internal"
    });
  }

  const externalDependencies = Array.from(new Set(dependencies.filter((dependency) => dependency.external).map((dependency) => dependency.to))).sort();
  if (externalDependencies.length > 0) {
    entries.push({
      id: stableId("ARCH", `external-dependencies:${externalDependencies.join(",")}`),
      kind: "dependency",
      summary: `Project depends on ${externalDependencies.length} external packages or module specifiers.`,
      source: "dependencies",
      confidence: "medium",
      privacy: "internal"
    });
  }

  if (risks.length > 0) {
    entries.push({
      id: stableId("ARCH", `risk-zones:${risks.map((risk) => risk.id).join(",")}`),
      kind: "risk",
      summary: `${risks.length} risk candidates were detected and should constrain future context generation.`,
      source: "risks",
      confidence: "medium",
      privacy: risks.some((risk) => risk.privacy === "protected") ? "protected" : "internal"
    });
  }

  return entries;
}

function createUnresolvedQuestions(
  projectName: string,
  api: ApiEntry[],
  database: DatabaseEntry[],
  rules: RuleEntry[],
  risks: RiskEntry[]
): UnresolvedQuestionEntry[] {
  const questions: UnresolvedQuestionEntry[] = [
    {
      id: "QUESTION-0001",
      question: `Which invariants in ${projectName} are business-critical but not explicit in source or docs?`,
      confidence: "low",
      privacy: "internal"
    }
  ];

  if (api.length === 0) {
    questions.push({
      id: `QUESTION-${String(questions.length + 1).padStart(4, "0")}`,
      question: "No API surface was confidently detected; confirm whether the project exposes APIs through unsupported patterns.",
      confidence: "low",
      privacy: "internal"
    });
  }

  if (database.length === 0) {
    questions.push({
      id: `QUESTION-${String(questions.length + 1).padStart(4, "0")}`,
      question: "No database schema was detected; confirm whether persistence exists outside the observed repository boundary.",
      confidence: "low",
      privacy: "internal"
    });
  }

  if (rules.length === 0) {
    questions.push({
      id: `QUESTION-${String(questions.length + 1).padStart(4, "0")}`,
      question: "No business rules were detected from explicit rule language; ask maintainers for domain invariants before high-risk edits.",
      confidence: "low",
      privacy: "internal"
    });
  }

  if (risks.some((risk) => risk.type === "secret")) {
    questions.push({
      id: `QUESTION-${String(questions.length + 1).padStart(4, "0")}`,
      question: "Secret-like material was detected; verify the repository hygiene and rotate exposed credentials if real.",
      confidence: "medium",
      privacy: "protected"
    });
  }

  return questions;
}

function getOrCreateModule(modules: Map<string, ModuleEntry>, name: string, relativePath: string): ModuleEntry {
  const existing = modules.get(name);
  if (existing) {
    return existing;
  }

  const module: ModuleEntry = {
    name,
    path: name === "root" ? "." : relativePath.split("/").slice(0, name.split("/").length).join("/"),
    files: [],
    symbols: [],
    dependencies: [],
    summary: "",
    confidence: "medium"
  };
  modules.set(name, module);
  return module;
}

async function detectProjectName(root: string): Promise<string> {
  const packagePath = path.join(root, "package.json");
  try {
    const manifest = JSON.parse(await fs.readFile(packagePath, "utf8")) as { name?: string };
    if (manifest.name && typeof manifest.name === "string") {
      return manifest.name;
    }
  } catch {
    // Fall through to folder name.
  }
  return path.basename(root);
}

function detectModuleName(relativePath: string): string {
  const parts = normalizePath(relativePath).split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "root";
  }
  if (parts[0] === "packages" && parts[1]) {
    return `packages/${parts[1]}`;
  }
  if (["src", "app", "apps", "lib", "services", "modules", "features"].includes(parts[0]) && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

function detectFileKind(relativePath: string): FileEntry["kind"] {
  const extension = path.extname(relativePath).toLowerCase();
  const base = path.basename(relativePath).toLowerCase();

  if (base.includes(".test.") || base.includes(".spec.") || relativePath.includes("/test/") || relativePath.includes("/tests/")) {
    return "test";
  }
  if (extension === ".md" || relativePath.startsWith("docs/")) {
    return "documentation";
  }
  if (DATABASE_EXTENSIONS.has(extension) || relativePath.startsWith("database/") || relativePath.startsWith("db/")) {
    return "database";
  }
  if (SOURCE_EXTENSIONS.has(extension)) {
    return "source";
  }
  if (["package.json", "tsconfig.json", ".eslintrc", ".prettierrc"].includes(base) || extension === ".yml" || extension === ".yaml") {
    return "config";
  }
  return "unknown";
}

function resolveRelativeSpecifier(fromFile: string, specifier: string, fileSet: Set<string>): string {
  const fromDir = path.posix.dirname(fromFile);
  const base = normalizePath(path.posix.normalize(path.posix.join(fromDir, specifier)));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`
  ];

  return candidates.find((candidate) => fileSet.has(candidate)) ?? base;
}

function isExternalSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/");
}

function isIgnoredDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.includes(name.toLowerCase());
}

function isIgnoredFile(name: string, relativePath: string): boolean {
  const normalizedName = name.toLowerCase();
  const normalizedPath = relativePath.toLowerCase();
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(normalizedName) || pattern.test(normalizedPath));
}

function isTextCandidate(name: string, extension: string): boolean {
  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }
  return ["Dockerfile", "Makefile", "LICENSE"].includes(name);
}

function countLines(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function stableId(prefix: string, input: string): string {
  return `${prefix}-${hashText(input).slice(0, 12).toUpperCase()}`;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeHttpMethod(value: string | undefined): string | undefined {
  return value ? value.toUpperCase() : undefined;
}

function sanitizeRoute(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) {
    return "";
  }
  return trimmed.replace(/\s+/g, " ");
}

function sanitizeIdentifier(value: string): string {
  const trimmed = value.trim().replace(/^["'`]+|["'`]+$/g, "");
  return /^[A-Za-z_][\w.]*$/.test(trimmed) ? trimmed : "";
}

function sanitizeEvidence(value: string): string {
  return value
    .replace(/(api[_-]?key|secret|token|password|passwd|private[_-]?key)(\s*[:=]\s*)["']?[^"'\s]+/gi, "$1$2[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, 180)
    .trim();
}

function dedupeDependencies(dependencies: DependencyEntry[]): DependencyEntry[] {
  const seen = new Set<string>();
  return dependencies.filter((dependency) => {
    const key = `${dependency.from}\u0000${dependency.to}\u0000${dependency.kind}\u0000${dependency.specifier}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeById<T extends { id: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}
