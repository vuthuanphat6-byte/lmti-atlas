import { inferIntent } from "@atlas/kernel";
import {
  createShortMemoryNote,
  evaluateShortMemoryForPromotion,
  promoteShortMemoryToLongMemory,
  proposeLessonCandidate,
  retrieveMemoryForTask,
  retrieveShortMemoryForTask,
  searchProjectMemory,
  type LibraryZone,
  type ProjectMemorySearchResult,
  type ShortMemoryRetrievalNote
} from "@atlas/memory";
import { redactText } from "@atlas/privacy";
import type { FrameworkDetectionResult } from "@atlas/frameworks";

export type MindIntent =
  | "code_fix"
  | "feature_build"
  | "ui_ux"
  | "deployment"
  | "security"
  | "database"
  | "erp_workflow"
  | "memory_system"
  | "prompt_engineering"
  | "documentation"
  | "contract_document"
  | "seo_content"
  | "unknown";

export interface MindIntentResult {
  primary: MindIntent;
  secondary: MindIntent[];
  confidence: number;
  keywords: string[];
}

export interface MindRepoState {
  branch?: string;
  dirtyFiles?: string[];
  recentFiles?: string[];
  packageManager?: string;
  framework?: string;
}

export interface PrepareCodexContextInput {
  task: string;
  cwd?: string;
  repoState?: MindRepoState;
  frameworkContext?: FrameworkDetectionResult;
  userIntent?: string;
  options?: {
    maxShortNotes?: number;
    maxLongMemories?: number;
    maxContextChars?: number;
    privacyMode?: "safe" | "internal";
    includeReasoning?: boolean;
  };
}

export interface MindContextPacket {
  guardrails: string[];
  shortMemory: Array<{
    id: string;
    title: string;
    summary: string;
    reason: string;
    expiresAt?: string;
  }>;
  longMemory: Array<{
    id: string;
    zone: string;
    title: string;
    summary: string;
    reason: string;
  }>;
  taskHints: string[];
  warnings: string[];
}

export interface MindRejectedMemory {
  id: string;
  title: string;
  reason: string;
}

export interface MindContextResult {
  intent: {
    primary: string;
    secondary: string[];
    confidence: number;
  };
  framework?: {
    primaryFramework: string;
    packageManager?: string;
    apps: Array<{ name: string; path: string; framework: string }>;
  };
  selectedZones: string[];
  contextPacket: MindContextPacket;
  rejectedMemory: MindRejectedMemory[];
  reasoning?: Array<{
    id: string;
    title: string;
    source: "short" | "long";
    score: number;
    reasons: string[];
    penalties: string[];
  }>;
}

export interface MindScoringMemory {
  id: string;
  title: string;
  summary: string;
  text?: string;
  source: "short" | "long";
  zone?: string;
  tags?: string[];
  priority?: string;
  importance?: number;
  confidence?: number;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  status?: string;
  retrievalReason?: string;
}

export interface MindScoreResult {
  score: number;
  reasons: string[];
  penalties: string[];
  guardrailRelevant: boolean;
  noiseReason?: string;
}

export interface ReflectAfterTaskInput {
  task: string;
  cwd?: string;
  filesChanged?: string[];
  summary?: string;
  bugsFound?: string[];
  decisionsMade?: string[];
  testsRun?: string[];
  risks?: string[];
}

export interface MindReflectionResult {
  intent: {
    primary: string;
    secondary: string[];
    confidence: number;
  };
  actions: Array<{
    type: "short_memory" | "lesson_candidate" | "promotion";
    status: "created" | "skipped" | "promoted";
    id?: string;
    title?: string;
    reason: string;
  }>;
  promotedShortMemories: Array<{ noteId: string; longMemoryId: string }>;
  skipped: string[];
  warnings: string[];
}

interface ScoredCandidate {
  candidate: MindScoringMemory;
  score: MindScoreResult;
}

const DEFAULT_MAX_SHORT_NOTES = 5;
const DEFAULT_MAX_LONG_MEMORIES = 7;
const DEFAULT_MAX_CONTEXT_CHARS = 6000;
const SHORT_THRESHOLD = 45;
const LONG_THRESHOLD = 50;
const GUARDRAIL_THRESHOLD = 35;

const INTENT_LEXICON: Record<MindIntent, string[]> = {
  code_fix: ["fix", "bug", "error", "failed", "failure", "loi", "loi", "broken", "hotfix", "debug"],
  feature_build: ["build", "feature", "implement", "add", "upgrade", "nang cap", "create", "support", "architecture"],
  ui_ux: ["ui", "ux", "layout", "screen", "button", "brand", "logo", "modal", "design", "moodboard"],
  deployment: ["deploy", "production", "release", "pm2", "docker", "healthcheck", "rollback", "server", "nginx", "ci"],
  security: ["security", "privacy", "permission", "403", "forbidden", "role", "auth", "token", "secret", "credential", "least privilege"],
  database: ["database", "db", "sql", "sqlite", "postgres", "postgresql", "mongodb", "schema", "prisma", "migration"],
  erp_workflow: ["erp", "order", "packing", "shipping", "label", "dashboard", "partner", "customer", "workflow", "invoice", "fulfillment"],
  memory_system: ["memory", "short memory", "long memory", "mind", "orchestrator", "context", "remember", "lesson", "retrieval"],
  prompt_engineering: ["prompt", "system prompt", "instruction", "persona", "agent prompt", "codex"],
  documentation: ["doc", "docs", "readme", "documentation", "guide", "manual"],
  contract_document: ["contract", "agreement", "quote", "quotation", "bao gia", "hop dong", "proposal"],
  seo_content: ["seo", "content", "social", "post", "caption", "copywriting", "marketing", "slogan"],
  unknown: []
};

const ZONES_BY_INTENT: Record<MindIntent, LibraryZone[]> = {
  code_fix: ["codebase", "lesson", "incident", "architecture", "security"],
  feature_build: ["architecture", "codebase", "decision", "lesson", "security"],
  ui_ux: ["codebase", "decision", "customer", "prompting", "lesson"],
  deployment: ["deployment", "security", "incident", "lesson"],
  security: ["security", "lesson", "incident", "workflow", "codebase"],
  database: ["architecture", "codebase", "decision", "incident", "lesson", "security"],
  erp_workflow: ["workflow", "business", "customer", "lesson", "codebase"],
  memory_system: ["architecture", "decision", "lesson", "codebase", "security"],
  prompt_engineering: ["prompting", "workflow", "decision", "customer", "lesson"],
  documentation: ["codebase", "architecture", "decision", "lesson"],
  contract_document: ["customer", "business", "decision", "workflow"],
  seo_content: ["prompting", "customer", "business", "decision"],
  unknown: ["lesson", "codebase", "security"]
};

export function routeMindIntent(task: string, userIntent?: string): MindIntentResult {
  const normalized = normalizeText(`${userIntent ?? ""} ${task}`);
  const kernelIntent = inferIntent(task);
  const scores = new Map<MindIntent, number>();

  for (const [intent, keywords] of Object.entries(INTENT_LEXICON) as Array<[MindIntent, string[]]>) {
    if (intent === "unknown") {
      continue;
    }
    let score = 0;
    for (const keyword of keywords) {
      if (normalized.includes(normalizeText(keyword))) {
        score += keyword.includes(" ") ? 3 : 2;
      }
    }
    if (score > 0) {
      scores.set(intent, score);
    }
  }

  boostFromKernelIntent(scores, kernelIntent.primaryIntent, 4);
  for (const secondary of kernelIntent.secondaryIntents) {
    boostFromKernelIntent(scores, secondary, 2);
  }
  if (normalized.includes("403") || normalized.includes("forbidden")) {
    scores.set("security", (scores.get("security") ?? 0) + 8);
    scores.set("code_fix", (scores.get("code_fix") ?? 0) + 3);
    scores.set("security", Math.max(scores.get("security") ?? 0, (scores.get("code_fix") ?? 0) + 2));
  }
  if (normalized.includes("dashboard") && (normalized.includes("partner") || normalized.includes("agent"))) {
    scores.set("erp_workflow", (scores.get("erp_workflow") ?? 0) + 3);
  }
  if (normalized.includes("short memory") || normalized.includes("long memory")) {
    scores.set("memory_system", (scores.get("memory_system") ?? 0) + 8);
    scores.set("feature_build", (scores.get("feature_build") ?? 0) + 3);
  }

  const explicit = parseMindIntent(userIntent);
  if (explicit) {
    scores.set(explicit, (scores.get(explicit) ?? 0) + 10);
  }

  const ranked = Array.from(scores.entries()).sort((left, right) => right[1] - left[1]);
  const primary = ranked[0]?.[0] ?? "unknown";
  const secondary = ranked
    .slice(1)
    .filter(([, score]) => score > 0)
    .map(([intent]) => intent)
    .filter((intent) => intent !== primary)
    .slice(0, 4);
  const total = ranked.reduce((sum, [, score]) => sum + score, 0);
  const confidence = primary === "unknown" ? 0 : round(Math.min(1, Math.max(0.28, (ranked[0]?.[1] ?? 0) / Math.max(total, 4))));
  const keywords = Array.from(new Set([...tokenize(task), ...INTENT_LEXICON[primary], ...secondary.flatMap((intent) => INTENT_LEXICON[intent]).slice(0, 12)]));
  return { primary, secondary, confidence, keywords };
}

export function selectZonesForMindIntent(intent: MindIntentResult): LibraryZone[] {
  const zones = new Set<LibraryZone>();
  for (const zone of ZONES_BY_INTENT[intent.primary] ?? ZONES_BY_INTENT.unknown) {
    zones.add(zone);
  }
  for (const secondary of intent.secondary.slice(0, 3)) {
    for (const zone of ZONES_BY_INTENT[secondary] ?? []) {
      zones.add(zone);
    }
  }
  zones.add("lesson");
  if (intent.primary === "security" || intent.secondary.includes("security")) {
    zones.add("security");
  }
  return Array.from(zones).slice(0, 7);
}

export async function prepareCodexContext(input: PrepareCodexContextInput): Promise<MindContextResult> {
  const cwd = input.cwd ?? process.cwd();
  const options = input.options ?? {};
  const maxShortNotes = options.maxShortNotes ?? DEFAULT_MAX_SHORT_NOTES;
  const maxLongMemories = options.maxLongMemories ?? DEFAULT_MAX_LONG_MEMORIES;
  const maxContextChars = options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
  const privacyMode = options.privacyMode ?? "safe";
  const intent = routeMindIntent(input.task, input.userIntent);
  const selectedZones = selectZonesForMindIntent(intent);

  const shortFocused = await retrieveShortMemoryForTask(input.task, { cwd, limit: Math.max(maxShortNotes * 4, 8), privacyMode });
  const shortBroad = await retrieveShortMemoryForTask("", { cwd, limit: Math.max(maxShortNotes * 4, 8), privacyMode });
  const longFocused = await retrieveMemoryForTask(input.task, { cwd, zones: selectedZones, limit: Math.max(maxLongMemories * 4, 8), privacyMode });
  const longBroad = await searchProjectMemory("", { cwd, limit: Math.max(maxLongMemories * 5, 12), privacyMode });

  const candidates = [
    ...mergeShortCandidates(shortFocused.notes, shortBroad.notes),
    ...mergeLongCandidates(longFocused, longBroad)
  ];
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreMemoryForCodex({
        task: input.task,
        memory: candidate,
        intent,
        selectedZones,
        repoState: input.repoState,
        frameworkContext: input.frameworkContext
      })
    }))
    .sort((left, right) => right.score.score - left.score.score);

  const rejectedMemory: MindRejectedMemory[] = [];
  const selectedShort: ScoredCandidate[] = [];
  const selectedLong: ScoredCandidate[] = [];
  const seen = new Set<string>();

  for (const entry of scored) {
    const duplicateKey = normalizeDedupKey(entry.candidate);
    if (seen.has(duplicateKey)) {
      rejectedMemory.push(toRejected(entry, "Rejected as duplicate or near-duplicate memory."));
      continue;
    }
    seen.add(duplicateKey);

    if (entry.score.noiseReason) {
      rejectedMemory.push(toRejected(entry, entry.score.noiseReason));
      continue;
    }

    const threshold = entry.candidate.source === "short" ? SHORT_THRESHOLD : LONG_THRESHOLD;
    const guardrailOverride = entry.score.guardrailRelevant && entry.score.score >= GUARDRAIL_THRESHOLD;
    if (entry.score.score < threshold && !guardrailOverride) {
      rejectedMemory.push(toRejected(entry, `Rejected because score ${entry.score.score} is below ${threshold}.`));
      continue;
    }

    if (entry.candidate.source === "short" && selectedShort.length < maxShortNotes) {
      selectedShort.push(entry);
      continue;
    }
    if (entry.candidate.source === "long" && selectedLong.length < maxLongMemories) {
      selectedLong.push(entry);
      continue;
    }
    rejectedMemory.push(toRejected(entry, "Rejected by max memory count budget."));
  }

  const packet: MindContextPacket = {
    guardrails: buildGuardrails(intent, selectedLong),
    shortMemory: selectedShort.map(shortCandidateToPacket),
    longMemory: selectedLong.map(longCandidateToPacket),
    taskHints: buildTaskHints(intent, input.repoState, input.frameworkContext),
    warnings: [
      ...detectMindConflicts(selectedShort, selectedLong),
      ...(input.frameworkContext ? [`Framework context active: ${input.frameworkContext.primaryFramework}.`] : []),
      ...(shortFocused.filteredOut + shortBroad.filteredOut > 0 ? [`${shortFocused.filteredOut + shortBroad.filteredOut} short memory note(s) were blocked by privacy gate.`] : [])
    ]
  };

  enforceContextBudget(packet, rejectedMemory, maxContextChars);

  const result: MindContextResult = {
    intent: {
      primary: intent.primary,
      secondary: intent.secondary,
      confidence: intent.confidence
    },
    framework: input.frameworkContext ? {
      primaryFramework: redactText(input.frameworkContext.primaryFramework),
      packageManager: input.frameworkContext.packageManager ? redactText(input.frameworkContext.packageManager) : undefined,
      apps: input.frameworkContext.apps.map((app) => ({
        name: redactText(app.name),
        path: redactText(app.path),
        framework: redactText(app.framework)
      })).slice(0, 12)
    } : undefined,
    selectedZones,
    contextPacket: sanitizePacket(packet),
    rejectedMemory: rejectedMemory.map((entry) => ({
      id: redactText(entry.id),
      title: redactText(entry.title),
      reason: redactText(entry.reason)
    }))
  };

  if (options.includeReasoning) {
    result.reasoning = scored.map((entry) => ({
      id: redactText(entry.candidate.id),
      title: redactText(entry.candidate.title),
      source: entry.candidate.source,
      score: entry.score.score,
      reasons: entry.score.reasons.map(redactText),
      penalties: entry.score.penalties.map(redactText)
    }));
  }

  return result;
}

export async function prepareAgentContext(input: {
  task: string;
  cwd?: string;
  frameworkContext: FrameworkDetectionResult;
  repoState?: MindRepoState;
  userIntent?: string;
  options?: PrepareCodexContextInput["options"];
}): Promise<MindContextResult> {
  return prepareCodexContext({
    task: input.task,
    cwd: input.cwd,
    frameworkContext: input.frameworkContext,
    userIntent: input.userIntent,
    repoState: {
      ...input.repoState,
      framework: input.frameworkContext.primaryFramework,
      packageManager: input.frameworkContext.packageManager ?? input.repoState?.packageManager
    },
    options: input.options
  });
}

export function scoreMemoryForCodex(input: {
  task: string;
  memory: MindScoringMemory;
  intent: MindIntentResult;
  selectedZones: string[];
  repoState?: MindRepoState;
  frameworkContext?: FrameworkDetectionResult;
}): MindScoreResult {
  const taskTokens = tokenize(input.task);
  const memoryText = normalizeText([input.memory.title, input.memory.summary, input.memory.text, input.memory.zone, ...(input.memory.tags ?? [])].filter(Boolean).join(" "));
  const reasons: string[] = [];
  const penalties: string[] = [];
  let score = 0;

  const intentTerms = [input.intent.primary, ...input.intent.secondary, ...input.intent.keywords].map(normalizeText);
  const intentMatches = intentTerms.filter((term) => term && memoryText.includes(term)).length;
  const intentScore = Math.min(30, intentMatches * 4 + (memoryText.includes(normalizeText(input.intent.primary)) ? 8 : 0));
  score += intentScore;
  if (intentScore > 0) {
    reasons.push(`intent_match=${intentScore}`);
  }

  const zoneScore = input.memory.zone && input.selectedZones.includes(input.memory.zone) ? 20 : input.memory.source === "short" ? 10 : 0;
  score += zoneScore;
  if (zoneScore > 0) {
    reasons.push(`zone_or_short_context=${zoneScore}`);
  }

  const keywordMatches = taskTokens.filter((token) => memoryText.includes(token)).length;
  const keywordScore = Math.min(15, keywordMatches * 3);
  score += keywordScore;
  if (keywordScore > 0) {
    reasons.push(`keyword_match=${keywordScore}`);
  }

  const recencyScore = scoreRecency(input.memory);
  score += recencyScore;
  if (recencyScore > 0) {
    reasons.push(`recency=${recencyScore}`);
  }

  const importanceScore = input.memory.source === "short"
    ? priorityScore(input.memory.priority)
    : Math.round((input.memory.importance ?? 0.5) * 10);
  score += importanceScore;
  reasons.push(`importance_or_priority=${importanceScore}`);

  const securityScore = securityGuardrailScore(input.intent, memoryText);
  score += securityScore;
  if (securityScore > 0) {
    reasons.push(`security_guardrail=${securityScore}`);
  }

  const repoScore = scoreRepoRelevance(input.repoState, memoryText);
  score += repoScore;
  if (repoScore > 0) {
    reasons.push(`repo_relevance=${repoScore}`);
  }

  const frameworkScore = scoreFrameworkRelevance(input.frameworkContext, memoryText);
  score += frameworkScore.score;
  if (frameworkScore.score > 0) {
    reasons.push(`framework_relevance=${frameworkScore.score}`);
  }
  if (frameworkScore.penalty < 0) {
    penalties.push(`framework_mismatch=${frameworkScore.penalty}`);
  }

  const rawLength = [input.memory.summary, input.memory.text].join(" ").length;
  if (rawLength > 1200) {
    const penalty = rawLength > 3000 ? 15 : rawLength > 1800 ? 10 : 5;
    score -= penalty;
    penalties.push(`long_memory_penalty=-${penalty}`);
  }
  if (input.memory.status === "superseded") {
    score -= 20;
    penalties.push("superseded_penalty=-20");
  }
  const noiseReason = frameworkScore.noiseReason ?? antiNoiseReason(input.intent, memoryText);
  if (noiseReason) {
    score -= 30;
    penalties.push("noise_penalty=-30");
  }

  return {
    score: Math.max(0, Math.round(score)),
    reasons,
    penalties,
    guardrailRelevant: securityScore > 0,
    noiseReason
  };
}

export async function reflectAfterTask(input: ReflectAfterTaskInput): Promise<MindReflectionResult> {
  const cwd = input.cwd ?? process.cwd();
  const intent = routeMindIntent(input.task);
  const actions: MindReflectionResult["actions"] = [];
  const promotedShortMemories: Array<{ noteId: string; longMemoryId: string }> = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  const text = [
    input.task,
    input.summary,
    ...(input.bugsFound ?? []),
    ...(input.decisionsMade ?? []),
    ...(input.risks ?? [])
  ].filter(Boolean).join("\n");

  if (shouldSaveLongLesson(input, intent)) {
    const lesson = await proposeLessonCandidate(
      {
        observation: {
          taskTitle: input.task,
          taskSummary: input.summary,
          agent: "mind-reflection",
          filesTouched: (input.filesChanged ?? []).map((file) => ({ path: file, changeType: "modified" as const })),
          commandsRun: (input.testsRun ?? []).map((command) => ({
            command,
            exitCode: null,
            status: "unknown" as const,
            outputRedacted: true as const
          })),
          tests: (input.testsRun ?? []).map((command) => ({ name: command, command, status: "unknown" as const })),
          errors: (input.bugsFound ?? []).map((message) => ({ message, severity: "medium" as const })),
          decisions: (input.decisionsMade ?? []).map((decision) => ({ decision, source: "reflection" })),
          outcome: input.risks && input.risks.length > 0 ? "partial" : "unknown",
          sourceRefs: (input.filesChanged ?? []).map((file) => ({ ref: file, kind: "file" as const }))
        },
        agentProposedLesson: createReflectionLesson(input, intent),
        lessonType: "workflow",
        appliesTo: input.filesChanged
      },
      { cwd }
    );
    actions.push({ type: "lesson_candidate", status: "created", id: lesson.candidate.id, title: lesson.candidate.title, reason: "Reusable lesson candidate created; approval required before long-term memory." });
  } else if (shouldSaveShortCheckpoint(input)) {
    const note = await createShortMemoryNote(
      {
        title: `Task checkpoint: ${redactText(input.task).slice(0, 80)}`,
        content: createShortCheckpointContent(input),
        tags: ["mind-reflection", intent.primary, ...(input.filesChanged ?? []).flatMap((file) => tokenize(file).slice(0, 2))],
        priority: input.risks && input.risks.length > 0 ? "high" : "medium"
      },
      { cwd }
    );
    actions.push({ type: "short_memory", status: "created", id: note.id, title: note.title, reason: "Temporary checkpoint is useful for nearby follow-up work." });
  } else {
    skipped.push("No reusable memory saved; reflection looked like routine task output.");
  }

  const short = await retrieveShortMemoryForTask(input.task, { cwd, limit: 8, privacyMode: "safe" });
  for (const note of short.notes) {
    const evaluation = await evaluateShortMemoryForPromotion(note.id, { cwd });
    if (evaluation.blocked) {
      warnings.push(`Short memory ${note.id} blocked from promotion by privacy gate.`);
      continue;
    }
    if (evaluation.shouldAutoPromote || (evaluation.shouldSuggest && note.priority === "critical")) {
      const promoted = await promoteShortMemoryToLongMemory(
        {
          noteId: note.id,
          reason: "Mind reflection found durable project knowledge."
        },
        { cwd }
      );
      if (promoted.promoted && promoted.longMemory) {
        promotedShortMemories.push({ noteId: note.id, longMemoryId: promoted.longMemory.id });
        actions.push({ type: "promotion", status: "promoted", id: promoted.longMemory.id, title: promoted.longMemory.title, reason: "Short memory crossed durable promotion threshold." });
      }
    } else {
      actions.push({ type: "promotion", status: "skipped", id: note.id, title: note.title, reason: "Short memory did not cross promotion threshold." });
    }
  }

  return {
    intent: {
      primary: intent.primary,
      secondary: intent.secondary,
      confidence: intent.confidence
    },
    actions,
    promotedShortMemories,
    skipped,
    warnings: warnings.map(redactText)
  };
}

function mergeShortCandidates(focused: ShortMemoryRetrievalNote[], broad: ShortMemoryRetrievalNote[]): MindScoringMemory[] {
  const byId = new Map<string, ShortMemoryRetrievalNote>();
  for (const note of [...focused, ...broad]) {
    byId.set(note.id, note);
  }
  return Array.from(byId.values()).map((note) => ({
    id: note.id,
    title: note.title,
    summary: note.summary,
    text: note.summary,
    source: "short",
    tags: note.tags,
    priority: note.priority,
    expiresAt: note.expiresAt,
    retrievalReason: note.reason
  }));
}

function mergeLongCandidates(focused: ProjectMemorySearchResult[], broad: ProjectMemorySearchResult[]): MindScoringMemory[] {
  const byId = new Map<string, ProjectMemorySearchResult>();
  for (const result of [...focused, ...broad]) {
    byId.set(result.item.id, result);
  }
  return Array.from(byId.values()).map((result) => ({
    id: result.item.id,
    title: result.item.title,
    summary: result.item.summary,
    text: [result.item.summary, result.item.content, ...result.item.tags].join(" "),
    source: "long",
    zone: result.item.zone,
    tags: result.item.tags,
    importance: result.item.importance,
    confidence: result.item.confidence,
    createdAt: result.item.createdAt,
    updatedAt: result.item.updatedAt,
    status: result.item.status,
    retrievalReason: result.why.join("; ")
  }));
}

function buildGuardrails(intent: MindIntentResult, selectedLong: ScoredCandidate[]): string[] {
  const guardrails = new Set<string>([
    "Do not expose secrets, tokens, .env values or raw credentials.",
    "Use source code, tests and explicit user instruction as observations; memory is prior belief."
  ]);
  if (intent.primary === "security" || intent.secondary.includes("security")) {
    guardrails.add("For permission/403 work, verify least privilege before treating access denial as a bug.");
  }
  if (intent.primary === "deployment" || intent.secondary.includes("deployment")) {
    guardrails.add("Before deployment, verify dirty files, build/test status, app name and healthcheck without printing env values.");
  }
  if (intent.primary === "memory_system" || intent.secondary.includes("memory_system")) {
    guardrails.add("Ensure Privacy Gate runs before memory write, retrieval, promotion and prompt injection into Codex.");
  }
  for (const entry of selectedLong) {
    if (entry.score.guardrailRelevant && entry.score.score >= GUARDRAIL_THRESHOLD) {
      guardrails.add(`Memory guardrail: ${truncate(entry.candidate.summary, 180)}`);
    }
  }
  return Array.from(guardrails).slice(0, 6).map(redactText);
}

function buildTaskHints(intent: MindIntentResult, repoState?: MindRepoState, frameworkContext?: FrameworkDetectionResult): string[] {
  const hints: string[] = [];
  if (intent.primary === "deployment" || intent.secondary.includes("deployment")) {
    hints.push("Before deploying, check dirty files, run build/test if available, verify PM2 app name and healthcheck, never print env values.");
  }
  if (intent.primary === "security" || intent.secondary.includes("security")) {
    hints.push("Check whether 403 is expected by least privilege before treating it as a bug.");
  }
  if (intent.primary === "memory_system" || intent.secondary.includes("memory_system")) {
    hints.push("Ensure Privacy Gate runs before write, before retrieve, before promote, and before prompt injection into Codex.");
  }
  if (intent.primary === "erp_workflow" || intent.secondary.includes("erp_workflow")) {
    hints.push("Preserve business workflow states and do not allow shipping label print until all products under the same label are completed.");
  }
  if (repoState?.dirtyFiles && repoState.dirtyFiles.length > 0) {
    hints.push(`Repo has dirty files: ${repoState.dirtyFiles.slice(0, 5).map(redactText).join(", ")}.`);
  }
  if (frameworkContext && frameworkContext.primaryFramework !== "unknown") {
    hints.push(`Use ${frameworkContext.primaryFramework} framework rules, risk zones and verification commands; avoid unrelated framework memory.`);
  }
  return hints;
}

function shortCandidateToPacket(entry: ScoredCandidate): MindContextPacket["shortMemory"][number] {
  return {
    id: entry.candidate.id,
    title: redactText(entry.candidate.title),
    summary: truncate(redactText(entry.candidate.summary), 420),
    reason: redactText([`score=${entry.score.score}`, ...entry.score.reasons.slice(0, 3)].join("; ")),
    expiresAt: entry.candidate.expiresAt
  };
}

function longCandidateToPacket(entry: ScoredCandidate): MindContextPacket["longMemory"][number] {
  return {
    id: entry.candidate.id,
    zone: entry.candidate.zone ?? "unknown",
    title: redactText(entry.candidate.title),
    summary: truncate(redactText(entry.candidate.summary), 480),
    reason: redactText([`score=${entry.score.score}`, ...entry.score.reasons.slice(0, 3)].join("; "))
  };
}

function detectMindConflicts(shortMemory: ScoredCandidate[], longMemory: ScoredCandidate[]): string[] {
  const warnings: string[] = [];
  for (const short of shortMemory) {
    const shortText = normalizeText(`${short.candidate.title} ${short.candidate.summary}`);
    for (const long of longMemory) {
      const longText = normalizeText(`${long.candidate.title} ${long.candidate.summary}`);
      if (shortText.includes("mongodb") && (longText.includes("postgresql") || longText.includes("postgres"))) {
        warnings.push(`Short Memory conflicts with Long Memory decision: database should be PostgreSQL, not MongoDB.`);
      }
      if ((shortText.includes("postgresql") || shortText.includes("postgres")) && longText.includes("mongodb")) {
        warnings.push(`Short Memory conflicts with Long Memory decision: database choice differs between PostgreSQL and MongoDB.`);
      }
      if (/\b(no longer|instead|not|khong|khong dung)\b/i.test(shortText)) {
        const overlap = tokenize(shortText).filter((token) => token.length > 3 && longText.includes(token)).length;
        if (overlap >= 2) {
          warnings.push(`Short memory "${redactText(short.candidate.title)}" may conflict with long memory "${redactText(long.candidate.title)}".`);
        }
      }
    }
  }
  return Array.from(new Set(warnings)).slice(0, 8);
}

function enforceContextBudget(packet: MindContextPacket, rejected: MindRejectedMemory[], maxChars: number): void {
  while (measurePacket(packet) > maxChars && packet.longMemory.length > 0) {
    const removed = packet.longMemory.pop();
    if (removed) {
      rejected.push({ id: removed.id, title: removed.title, reason: "Rejected by context character budget." });
    }
  }
  while (measurePacket(packet) > maxChars && packet.shortMemory.length > 0) {
    const removed = packet.shortMemory.pop();
    if (removed) {
      rejected.push({ id: removed.id, title: removed.title, reason: "Rejected by context character budget." });
    }
  }
  if (measurePacket(packet) > maxChars) {
    packet.taskHints = packet.taskHints.slice(0, 2);
    packet.warnings = packet.warnings.slice(0, 2);
  }
  if (measurePacket(packet) > maxChars) {
    packet.guardrails = packet.guardrails.slice(0, 3);
  }
}

function sanitizePacket(packet: MindContextPacket): MindContextPacket {
  return {
    guardrails: packet.guardrails.map(redactText),
    shortMemory: packet.shortMemory.map((note) => ({
      ...note,
      title: redactText(note.title),
      summary: redactText(note.summary),
      reason: redactText(note.reason)
    })),
    longMemory: packet.longMemory.map((memory) => ({
      ...memory,
      title: redactText(memory.title),
      summary: redactText(memory.summary),
      reason: redactText(memory.reason)
    })),
    taskHints: packet.taskHints.map(redactText),
    warnings: packet.warnings.map(redactText)
  };
}

function toRejected(entry: ScoredCandidate, reason: string): MindRejectedMemory {
  return {
    id: entry.candidate.id,
    title: redactText(entry.candidate.title),
    reason: redactText(reason)
  };
}

function antiNoiseReason(intent: MindIntentResult, memoryText: string): string | undefined {
  const intents = new Set<MindIntent>([intent.primary, ...intent.secondary]);
  if ((intents.has("security") || intents.has("code_fix")) && /\b(logo|brand|color|seo|social|caption|contract|quote|moodboard)\b/i.test(memoryText)) {
    return "Rejected because task intent is security/code_fix and memory is branding, content, contract or UI-only noise.";
  }
  if ((intents.has("seo_content") || intents.has("prompt_engineering") || intents.has("ui_ux")) && /\b(pm2|deploy|rollback|database incident|migration outage)\b/i.test(memoryText)) {
    return "Rejected because task is content/UI/prompt work and memory is deployment or database incident noise.";
  }
  if (intents.has("deployment") && /\b(social post|caption|brand slogan|moodboard|logo|seo)\b/i.test(memoryText)) {
    return "Rejected because task is deployment and memory is marketing or brand-only noise.";
  }
  return undefined;
}

function scoreFrameworkRelevance(frameworkContext: FrameworkDetectionResult | undefined, memoryText: string): { score: number; penalty: number; noiseReason?: string } {
  if (!frameworkContext || frameworkContext.primaryFramework === "unknown") {
    return { score: 0, penalty: 0 };
  }
  const primary = normalizeFrameworkName(frameworkContext.primaryFramework);
  const primaryAliases = FRAMEWORK_ALIASES[primary] ?? [primary];
  const primaryMatched = primaryAliases.some((alias) => memoryText.includes(alias));
  const otherMatch = Object.entries(FRAMEWORK_ALIASES)
    .filter(([framework]) => framework !== primary)
    .find(([, aliases]) => aliases.some((alias) => memoryText.includes(alias)));

  let score = 0;
  let penalty = 0;
  if (primaryMatched) {
    score += 14;
  }
  for (const app of frameworkContext.apps.slice(0, 8)) {
    const appTokens = tokenize(`${app.name} ${app.path} ${app.framework}`);
    const overlap = appTokens.filter((token) => memoryText.includes(token)).length;
    score += Math.min(8, overlap * 2);
  }
  if (otherMatch && !primaryMatched) {
    penalty = -35;
    return {
      score: penalty,
      penalty,
      noiseReason: `Rejected because memory targets ${otherMatch[0]} but active framework is ${frameworkContext.primaryFramework}.`
    };
  }
  return { score, penalty };
}

const FRAMEWORK_ALIASES: Record<string, string[]> = {
  nextjs: ["nextjs", "next.js", "next middleware", "next config", "app router"],
  "react-vite": ["react", "vite", "react vite", "vite config"],
  nestjs: ["nestjs", "nest.js", "@nestjs", "nest cli"],
  express: ["express", "expressjs"],
  laravel: ["laravel", "artisan", "routes/web.php", "routes/api.php", "app/http/middleware", "eloquent"],
  django: ["django", "manage.py", "urls.py", "settings.py"],
  fastapi: ["fastapi", "uvicorn", "pydantic", "app/main.py"],
  wordpress: ["wordpress", "wp-config", "wp-content", "plugin", "theme functions.php"],
  dotnet: [".net", "dotnet", "asp.net", "csproj", "appsettings"],
  "spring-boot": ["spring boot", "spring-boot", "mvnw", "gradlew", "application.yml"],
  rails: ["rails", "ruby on rails", "routes.rb", "bin/rails"],
  flutter: ["flutter", "dart", "pubspec.yaml"]
};

function securityGuardrailScore(intent: MindIntentResult, memoryText: string): number {
  const securityText = /\b(security|privacy|secret|credential|token|permission|403|least privilege|do_not_prompt|env)\b/i.test(memoryText);
  if (!securityText) {
    return 0;
  }
  if (intent.primary === "security" || intent.secondary.includes("security")) {
    return 10;
  }
  if (intent.primary === "deployment" || intent.primary === "memory_system" || intent.secondary.includes("memory_system")) {
    return 8;
  }
  return 4;
}

function scoreRepoRelevance(repoState: MindRepoState | undefined, memoryText: string): number {
  if (!repoState) {
    return 0;
  }
  const values = [...(repoState.dirtyFiles ?? []), ...(repoState.recentFiles ?? []), repoState.branch, repoState.packageManager, repoState.framework]
    .filter(Boolean)
    .flatMap((value) => tokenize(String(value)));
  const matches = values.filter((token) => token.length > 2 && memoryText.includes(token)).length;
  return Math.min(10, matches * 2);
}

function scoreRecency(memory: MindScoringMemory): number {
  if (memory.source === "short") {
    return 10;
  }
  const timestamp = memory.updatedAt ?? memory.createdAt;
  if (!timestamp) {
    return 3;
  }
  const ageDays = Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 86_400_000);
  if (!Number.isFinite(ageDays)) {
    return 3;
  }
  if (ageDays <= 7) {
    return 10;
  }
  if (ageDays <= 30) {
    return 7;
  }
  if (ageDays <= 120) {
    return 4;
  }
  return 2;
}

function priorityScore(priority?: string): number {
  switch (priority) {
    case "critical":
      return 10;
    case "high":
      return 8;
    case "medium":
      return 6;
    case "low":
      return 3;
    default:
      return 5;
  }
}

function shouldSaveLongLesson(input: ReflectAfterTaskInput, intent: MindIntentResult): boolean {
  const corpus = normalizeText([input.task, input.summary, ...(input.bugsFound ?? []), ...(input.decisionsMade ?? []), ...(input.risks ?? [])].join(" "));
  if (input.decisionsMade && input.decisionsMade.length > 0) {
    return true;
  }
  if (input.bugsFound && input.bugsFound.length > 0 && /\b(permission|security|incident|production|deploy|architecture|workflow|403|rule)\b/i.test(corpus)) {
    return true;
  }
  if (input.risks && input.risks.length > 0) {
    return true;
  }
  return intent.primary === "security" || intent.primary === "deployment" || intent.primary === "memory_system" || /\b(lesson|remember|rule|least privilege|privacy gate)\b/i.test(corpus);
}

function shouldSaveShortCheckpoint(input: ReflectAfterTaskInput): boolean {
  const testsOnly = Boolean(input.testsRun?.length) && !input.summary && !input.filesChanged?.length && !input.bugsFound?.length && !input.decisionsMade?.length && !input.risks?.length;
  if (testsOnly) {
    return false;
  }
  return Boolean(input.filesChanged?.length || input.summary);
}

function createReflectionLesson(input: ReflectAfterTaskInput, intent: MindIntentResult): string {
  return redactText([
    `Intent: ${intent.primary}`,
    input.summary ? `Summary: ${input.summary}` : undefined,
    input.bugsFound && input.bugsFound.length > 0 ? `Bugs found: ${input.bugsFound.join("; ")}` : undefined,
    input.decisionsMade && input.decisionsMade.length > 0 ? `Decisions: ${input.decisionsMade.join("; ")}` : undefined,
    input.risks && input.risks.length > 0 ? `Risks: ${input.risks.join("; ")}` : undefined
  ].filter(Boolean).join("\n"));
}

function createShortCheckpointContent(input: ReflectAfterTaskInput): string {
  return redactText([
    input.summary ? `Summary: ${input.summary}` : undefined,
    input.filesChanged && input.filesChanged.length > 0 ? `Files changed: ${input.filesChanged.join(", ")}` : undefined,
    input.testsRun && input.testsRun.length > 0 ? `Tests run: ${input.testsRun.join(", ")}` : undefined
  ].filter(Boolean).join("\n"));
}

function boostFromKernelIntent(scores: Map<MindIntent, number>, kernelIntent: string, amount: number): void {
  const kernelMap: Record<string, MindIntent> = {
    bugfix: "code_fix",
    debug: "code_fix",
    deploy: "deployment",
    permission: "security",
    auth: "security",
    privacy: "security",
    database: "database",
    ui: "ui_ux",
    dashboard: "erp_workflow",
    partner: "erp_workflow",
    memory: "memory_system",
    routing: "code_fix",
    api: "code_fix"
  };
  const mapped = kernelMap[kernelIntent];
  if (mapped) {
    scores.set(mapped, (scores.get(mapped) ?? 0) + amount);
  }
}

function parseMindIntent(value?: string): MindIntent | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim() as MindIntent;
  return Object.prototype.hasOwnProperty.call(INTENT_LEXICON, normalized) ? normalized : undefined;
}

function normalizeDedupKey(memory: MindScoringMemory): string {
  return normalizeText(`${memory.title} ${memory.summary}`).slice(0, 180);
}

function measurePacket(packet: MindContextPacket): number {
  return JSON.stringify(packet).length;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/Ä‘/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

function normalizeFrameworkName(value: string): string {
  const normalized = normalizeText(value).replace(/[_\s]+/g, "-");
  if (normalized === "next" || normalized === "next.js") {
    return "nextjs";
  }
  if (normalized === "spring") {
    return "spring-boot";
  }
  if (normalized === "vite" || normalized === "react") {
    return "react-vite";
  }
  return normalized;
}

function tokenize(value: string): string[] {
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "task", "please", "hay", "cho", "cua", "cac"]);
  return Array.from(
    new Set(
      normalizeText(value)
        .split(/[^a-z0-9_/-]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !stopWords.has(part))
    )
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
