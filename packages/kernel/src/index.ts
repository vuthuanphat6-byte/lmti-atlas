import type {
  AmfDocument,
  ApiEntry,
  ArchitectureEntry,
  ContextMemory,
  DatabaseEntry,
  FileEntry,
  HistoryEntry,
  MemorySearchResult,
  ModuleEntry,
  RiskEntry,
  RuleEntry,
  UnresolvedQuestionEntry
} from "@atlas/types";

const KERNEL_VERSION = "0.1.0";

export interface InspectionStats {
  project: string;
  files: number;
  modules: number;
  dependencies: number;
  symbols: number;
  api: number;
  database: number;
  rules: number;
  risks: number;
  architecture: number;
  unresolvedQuestions: number;
  lastCompiled: string;
  amfVersion: string;
}

export interface ContextPack {
  task: string;
  generatedAt: string;
  kernel: {
    name: "Mind Kernel";
    version: string;
  };
  project: string;
  source: {
    amfVersion: string;
    compiledAt: string;
    checksum: string;
  };
  relatedModules: Array<Pick<ModuleEntry, "name" | "path" | "summary" | "dependencies"> & { score: number }>;
  relatedFiles: Array<Pick<FileEntry, "path" | "module" | "kind" | "summary" | "privacy" | "riskFlags"> & { score: number }>;
  relatedApi: Array<ApiEntry & { score: number }>;
  relatedDatabase: Array<DatabaseEntry & { score: number }>;
  knownRules: Array<RuleEntry & { score: number }>;
  risks: Array<RiskEntry & { score: number }>;
  architecture: Array<ArchitectureEntry & { score: number }>;
  history: HistoryEntry[];
  unresolvedQuestions: UnresolvedQuestionEntry[];
  relatedShortTermMemories: ContextMemory[];
  relatedLongTermMemories: ContextMemory[];
  recommendedSteps: string[];
}

export interface ContextPackOptions {
  memories?: MemorySearchResult[];
  includeSecret?: boolean;
}

export class MindKernel {
  private readonly amf: AmfDocument;

  constructor(amf: AmfDocument) {
    this.amf = loadAmf(amf);
  }

  inspect(): InspectionStats {
    return inspectAmf(this.amf);
  }

  createContextPack(task: string, options: ContextPackOptions = {}): ContextPack {
    return buildContextPack(this.amf, task, options);
  }

  getAmf(): AmfDocument {
    return this.amf;
  }
}

export function createMindKernel(amf: AmfDocument): MindKernel {
  return new MindKernel(amf);
}

export function loadAmf(input: string | AmfDocument): AmfDocument {
  const parsed = typeof input === "string" ? (JSON.parse(input) as Partial<AmfDocument>) : input;
  const amf = normalizeAmf(parsed);
  validateAmf(amf);
  return amf;
}

export function inspectAmf(amfInput: AmfDocument): InspectionStats {
  const amf = loadAmf(amfInput);
  return {
    project: amf.project.name,
    files: amf.files.length,
    modules: amf.modules.length,
    dependencies: amf.dependencies.length,
    symbols: amf.symbols.length,
    api: amf.api.length,
    database: amf.database.length,
    rules: amf.rules.length,
    risks: amf.risks.length,
    architecture: amf.architecture.length,
    unresolvedQuestions: amf.unresolvedQuestions.length,
    lastCompiled: amf.project.compiledAt,
    amfVersion: amf.version
  };
}

export function formatInspection(stats: InspectionStats): string {
  return [
    `Project: ${stats.project}`,
    `Files: ${stats.files}`,
    `Modules: ${stats.modules}`,
    `Dependencies: ${stats.dependencies}`,
    `Symbols: ${stats.symbols}`,
    `API: ${stats.api}`,
    `Database: ${stats.database}`,
    `Rules: ${stats.rules}`,
    `Risks: ${stats.risks}`,
    `Architecture: ${stats.architecture}`,
    `Unresolved questions: ${stats.unresolvedQuestions}`,
    `AMF version: ${stats.amfVersion}`,
    `Last compiled: ${stats.lastCompiled}`
  ].join("\n");
}

export function buildContextPack(amfInput: AmfDocument, task: string, options: ContextPackOptions = {}): ContextPack {
  const amf = loadAmf(amfInput);
  const includeSecret = Boolean(options.includeSecret);
  const keywords = tokenize(task);
  const scoredModules = amf.modules
    .map((module) => ({ ...module, score: scoreText(keywords, [module.name, module.path, module.summary, ...module.dependencies]) }))
    .filter((module) => module.score > 0)
    .sort(sortByScore)
    .slice(0, 8);

  const scoredFiles = amf.files
    .map((file) => ({ ...file, score: scoreText(keywords, [file.path, file.module, file.kind, file.summary, ...file.riskFlags]) }))
    .filter((file) => file.score > 0 && (includeSecret || file.privacy !== "protected"))
    .sort(sortByScore)
    .slice(0, 12);

  const scoredApi = amf.api
    .map((entry) => ({ ...entry, score: scoreText(keywords, [entry.name, entry.kind, entry.method ?? "", entry.route ?? "", entry.summary]) }))
    .filter((entry) => entry.score > 0 && (includeSecret || entry.privacy !== "protected"))
    .sort(sortByScore)
    .slice(0, 8);

  const scoredDatabase = amf.database
    .map((entry) => ({ ...entry, score: scoreText(keywords, [entry.name, entry.kind, entry.summary, entry.source]) }))
    .filter((entry) => entry.score > 0 && (includeSecret || entry.privacy !== "protected"))
    .sort(sortByScore)
    .slice(0, 8);

  const scoredRules = amf.rules
    .map((rule) => ({ ...rule, score: scoreText(keywords, [rule.text, rule.source]) }))
    .filter((rule) => rule.score > 0)
    .sort(sortByScore)
    .slice(0, 8);

  const scoredRisks = amf.risks
    .map((risk) => ({
      ...sanitizeRiskForContext(risk, includeSecret),
      score: scoreText(keywords, [risk.type, risk.message, risk.file ?? "", risk.recommendation])
    }))
    .filter((risk) => risk.score > 0 || scoredFiles.some((file) => file.path === risk.file))
    .sort(sortByScore)
    .slice(0, 8);

  const scoredArchitecture = amf.architecture
    .map((entry) => ({ ...entry, score: scoreText(keywords, [entry.kind, entry.summary, entry.source]) }))
    .filter((entry) => entry.score > 0 || scoredModules.some((module) => entry.source === module.path || entry.summary.includes(module.name)))
    .sort(sortByScore)
    .slice(0, 8);

  const relatedMemories = (options.memories ?? [])
    .filter((result) => includeSecret || result.record.sensitivity !== "secret")
    .map((result) => memoryToContext(result, includeSecret));
  const relatedShortTermMemories = relatedMemories.filter((memory) => memory.scope === "short_term").slice(0, 8);
  const relatedLongTermMemories = relatedMemories.filter((memory) => memory.scope === "long_term").slice(0, 8);

  return {
    task,
    generatedAt: new Date().toISOString(),
    kernel: {
      name: "Mind Kernel",
      version: KERNEL_VERSION
    },
    project: amf.project.name,
    source: {
      amfVersion: amf.version,
      compiledAt: amf.project.compiledAt,
      checksum: amf.project.checksum
    },
    relatedModules: scoredModules.map(({ name, path, summary, dependencies, score }) => ({
      name,
      path,
      summary,
      dependencies,
      score
    })),
    relatedFiles: scoredFiles.map(({ path, module, kind, summary, privacy, riskFlags, score }) => ({
      path,
      module,
      kind,
      summary,
      privacy,
      riskFlags,
      score
    })),
    relatedApi: scoredApi,
    relatedDatabase: scoredDatabase,
    knownRules: scoredRules,
    risks: scoredRisks,
    architecture: scoredArchitecture,
    history: amf.history.slice(0, 5),
    unresolvedQuestions: selectQuestions(amf.unresolvedQuestions, keywords),
    relatedShortTermMemories,
    relatedLongTermMemories,
    recommendedSteps: recommendSteps(
      scoredModules,
      scoredFiles,
      scoredApi,
      scoredDatabase,
      scoredRisks,
      scoredArchitecture,
      relatedShortTermMemories,
      relatedLongTermMemories
    )
  };
}

function normalizeAmf(input: Partial<AmfDocument>): AmfDocument {
  return {
    version: input.version ?? "",
    generatedAt: input.generatedAt ?? input.project?.compiledAt ?? "",
    project: input.project as AmfDocument["project"],
    modules: input.modules ?? [],
    files: input.files ?? [],
    symbols: input.symbols ?? [],
    dependencies: input.dependencies ?? [],
    api: input.api ?? [],
    database: input.database ?? [],
    rules: input.rules ?? [],
    risks: input.risks ?? [],
    history: input.history ?? [],
    architecture: input.architecture ?? [],
    summaries: input.summaries ?? [],
    unresolvedQuestions: input.unresolvedQuestions ?? []
  };
}

function validateAmf(amf: AmfDocument): void {
  if (!amf.version) {
    throw new Error("Invalid AMF: version is required.");
  }
  if (!amf.project?.name || !amf.project.compiledAt || !amf.project.checksum) {
    throw new Error("Invalid AMF: project identity, compiledAt and checksum are required.");
  }
  const arrayFields: Array<keyof Pick<
    AmfDocument,
    "modules" | "files" | "symbols" | "dependencies" | "api" | "database" | "rules" | "risks" | "history" | "architecture" | "summaries" | "unresolvedQuestions"
  >> = [
    "modules",
    "files",
    "symbols",
    "dependencies",
    "api",
    "database",
    "rules",
    "risks",
    "history",
    "architecture",
    "summaries",
    "unresolvedQuestions"
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(amf[field])) {
      throw new Error(`Invalid AMF: ${field} must be an array.`);
    }
  }
}

function sanitizeRiskForContext(risk: RiskEntry, includeSecret: boolean): RiskEntry {
  if (risk.privacy !== "protected" || includeSecret) {
    return risk;
  }

  return {
    ...risk,
    evidence: "Protected evidence withheld by Mind Kernel."
  };
}

function selectQuestions(questions: UnresolvedQuestionEntry[], keywords: string[]): UnresolvedQuestionEntry[] {
  const scored = questions
    .map((question) => ({ question, score: scoreText(keywords, [question.question, question.source ?? "", question.privacy]) }))
    .sort((left, right) => right.score - left.score);
  return scored.slice(0, 5).map((entry) => entry.question);
}

function recommendSteps(
  modules: Array<ModuleEntry & { score: number }>,
  files: Array<FileEntry & { score: number }>,
  api: Array<ApiEntry & { score: number }>,
  database: Array<DatabaseEntry & { score: number }>,
  risks: Array<RiskEntry & { score: number }>,
  architecture: Array<ArchitectureEntry & { score: number }>,
  shortTermMemories: ContextMemory[],
  longTermMemories: ContextMemory[]
): string[] {
  const steps = [
    "Review the highest-scoring cognitive structures before editing.",
    "Confirm compiled summaries still match source reality when the task is high impact."
  ];

  if (architecture.length > 0) {
    steps.push("Use architecture entries to preserve module boundaries and dependency direction.");
  }

  if (api.length > 0) {
    steps.push("Check related API surfaces for caller-visible behavior changes.");
  }

  if (database.length > 0) {
    steps.push("Check related database structures before changing persistence behavior.");
  }

  if (risks.length > 0) {
    steps.push("Check risk zones before making changes, especially protected findings.");
  }

  if (files.some((file) => file.kind === "test")) {
    steps.push("Run or update the related tests after the change.");
  } else {
    steps.push("Add or identify a focused verification path for this task.");
  }

  if (modules.some((module) => module.dependencies.length > 0)) {
    steps.push("Check module dependencies for downstream impact.");
  }

  if (shortTermMemories.length > 0) {
    steps.push("Use related short-term memory to preserve active task context.");
  }

  if (longTermMemories.length > 0) {
    steps.push("Apply related long-term memory before changing behavior.");
  }

  return steps;
}

function memoryToContext(result: MemorySearchResult, includeSecret: boolean): ContextMemory {
  const { record, score } = result;
  const base = {
    id: record.id,
    scope: record.scope,
    kind: record.kind,
    title: record.title,
    tags: record.tags,
    importance: record.importance,
    confidence: record.confidence,
    sensitivity: record.sensitivity,
    score
  };

  if (record.sensitivity === "confidential") {
    return {
      ...base,
      summary: "Confidential memory matched. Content withheld; use title, tags and source refs only."
    };
  }

  if (record.sensitivity === "secret" && !includeSecret) {
    return {
      ...base,
      summary: "Secret memory withheld."
    };
  }

  return {
    ...base,
    content: record.content
  };
}

function scoreText(keywords: string[], values: string[]): number {
  if (keywords.length === 0) {
    return 0;
  }

  const corpus = normalizeSearchText(values.join(" "));
  let score = 0;

  for (const keyword of keywords) {
    if (corpus.includes(keyword)) {
      score += keyword.length > 3 ? 2 : 1;
    }
  }

  return score;
}

function tokenize(task: string): string[] {
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "fix", "bug"]);
  return Array.from(
    new Set(
      normalizeSearchText(task)
        .split(/[^a-z0-9_]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !stopWords.has(part))
    )
  );
}

function sortByScore<T extends { score: number }>(left: T, right: T): number {
  return right.score - left.score;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/Ä‘/g, "d")
    .replace(/Ä/g, "d")
    .toLowerCase();
}
