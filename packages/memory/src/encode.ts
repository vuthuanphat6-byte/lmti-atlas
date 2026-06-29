import type {
  InferredIntent,
  MemoryConfidence,
  MemoryKind,
  MemorySensitivity,
  PromptPolicy
} from "@atlas/types";
import { hasSecretLikeMaterial, redactText } from "@atlas/privacy";

export const CONSOLIDATION_THRESHOLD = 0.58;

export interface EncodeMemoryInput {
  kind?: MemoryKind;
  title: string;
  content: string;
  tags?: string[];
  sourceRefs?: string[];
  importance?: number;
  confidence?: MemoryConfidence;
  sensitivity?: MemorySensitivity;
  promptPolicy?: PromptPolicy;
}

export interface EncodeMemoryContext {
  taskIntent?: InferredIntent;
  manualRemember?: boolean;
  taskDoneLesson?: boolean;
  now?: Date;
}

export interface EncodedMemory {
  title: string;
  content: string;
  tags: string[];
  inferredIntent: InferredIntent;
  contextCues: string[];
  priorityScore: number;
  memoryStrength: number;
  baseActivation: number;
  decayRate: number;
  stability: number;
  privacySafeSummary: string;
  sensitivity: MemorySensitivity;
  promptPolicy: PromptPolicy;
}

const HIGH_PRIORITY_KINDS = new Set<MemoryKind>(["lesson", "rule", "permission", "deploy_note", "bug", "risk", "decision", "route", "debug_note"]);
const DURABLE_KINDS = new Set<MemoryKind>(["rule", "permission", "deploy_note", "risk", "decision", "route"]);
const CRITICAL_KEYWORDS = [
  "deploy",
  "deployment",
  "permission",
  "forbidden",
  "403",
  "bug",
  "payment",
  "security",
  "secret",
  "token",
  "route",
  "production",
  "database",
  "migration",
  "privacy"
];

export function encodeMemory(input: EncodeMemoryInput, context: EncodeMemoryContext = {}): EncodedMemory {
  const title = normalizeSummary(input.title || "Untitled memory", 120);
  const content = normalizeSummary(input.content, 900);
  const kind = input.kind ?? "system_note";
  const confidence = input.confidence ?? "medium";
  const importance = clamp01(input.importance ?? 0.5);
  const secretLike = detectSecretLikeContent(`${title}\n${content}`);
  const sensitivity = secretLike ? "secret" : input.sensitivity ?? "internal";
  const promptPolicy = normalizePromptPolicy(input.promptPolicy, sensitivity);
  const inferredIntent = context.taskIntent ?? inferBasicIntent(`${title} ${content} ${(input.tags ?? []).join(" ")}`);
  const tags = normalizeTags([...(input.tags ?? []), kind, inferredIntent.primaryIntent, ...inferredIntent.secondaryIntents].filter((tag) => tag !== "unknown"));
  const criticalMatches = CRITICAL_KEYWORDS.filter((keyword) => normalizeMemoryText(`${title} ${content} ${tags.join(" ")}`).includes(keyword));

  const kindWeight = HIGH_PRIORITY_KINDS.has(kind) ? 0.22 : kind === "system_note" ? 0.03 : 0.1;
  const confidenceWeight = confidenceToWeight(confidence) * 0.16;
  const importanceWeight = importance * 0.28;
  const manualWeight = context.manualRemember ? 0.12 : 0;
  const lessonWeight = context.taskDoneLesson ? 0.14 : 0;
  const sourceWeight = (input.sourceRefs?.length ?? 0) > 0 ? 0.05 : 0;
  const intentWeight = inferredIntent.primaryIntent !== "unknown" ? inferredIntent.confidence * 0.08 : 0;
  const criticalWeight = Math.min(0.15, criticalMatches.length * 0.035);
  const privacyWeight = sensitivity === "secret" || sensitivity === "confidential" ? 0.04 : 0;
  const priorityScore = clamp01(importanceWeight + confidenceWeight + kindWeight + manualWeight + lessonWeight + sourceWeight + intentWeight + criticalWeight + privacyWeight);
  const durableMultiplier = DURABLE_KINDS.has(kind) ? 1.35 : 1;
  const memoryStrength = Math.round((14 + priorityScore * 90 + importance * 30) * durableMultiplier * 100) / 100;
  const decayRate = Math.round((DURABLE_KINDS.has(kind) ? 0.045 : 0.085) * (1 - priorityScore * 0.35) * 1000) / 1000;
  const stability = clamp01(0.25 + priorityScore * 0.65 + (DURABLE_KINDS.has(kind) ? 0.08 : 0));
  const baseActivation = Math.round((Math.log1p(importance * 4) + priorityScore + confidenceToWeight(confidence)) * 100) / 100;
  const contextCues = extractContextCues({ title, content, tags, sourceRefs: input.sourceRefs ?? [], inferredIntent, criticalMatches });

  return {
    title,
    content,
    tags,
    inferredIntent,
    contextCues,
    priorityScore: round(priorityScore),
    memoryStrength,
    baseActivation,
    decayRate,
    stability: round(stability),
    privacySafeSummary: createPrivacySafeSummary(title, content, sensitivity),
    sensitivity,
    promptPolicy
  };
}

export function detectSecretLikeContent(text: string): boolean {
  return hasSecretLikeMaterial(text);
}

export function normalizePromptPolicy(promptPolicy: PromptPolicy | undefined, sensitivity: MemorySensitivity): PromptPolicy {
  if (promptPolicy === "allow_raw" || promptPolicy === "summarize_only" || promptPolicy === "do_not_prompt") {
    return sensitivity === "secret" ? "do_not_prompt" : promptPolicy;
  }
  if (sensitivity === "public") {
    return "allow_raw";
  }
  if (sensitivity === "secret") {
    return "do_not_prompt";
  }
  return "summarize_only";
}

export function durableMemoryKind(kind: MemoryKind): boolean {
  return DURABLE_KINDS.has(kind);
}

export function confidenceToWeight(confidence: MemoryConfidence): number {
  if (confidence === "high") {
    return 1;
  }
  if (confidence === "low") {
    return 0.25;
  }
  return 0.6;
}

export function normalizeMemoryText(value: string): string {
  return value
    .replace(/l(?:á|Ã¡)»(?:—|�)?i/giu, "loi")
    .replace(/b(?:á|Ã¡)»(?:‹|�)?/giu, "bi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/Ä‘/g, "d")
    .replace(/Ä/g, "d")
    .toLowerCase();
}

export function tokenizeMemoryText(value: string): string[] {
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "fix", "bug", "memory", "note"]);
  return Array.from(
    new Set(
      normalizeMemoryText(value)
        .split(/[^a-z0-9_/-]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !stopWords.has(part))
    )
  );
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeSummary(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .flatMap((tag) => tag.split(/[, ]+/))
        .map((tag) => normalizeMemoryText(tag).trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

function extractContextCues(input: {
  title: string;
  content: string;
  tags: string[];
  sourceRefs: string[];
  inferredIntent: InferredIntent;
  criticalMatches: string[];
}): string[] {
  return Array.from(
    new Set([
      ...input.tags,
      input.inferredIntent.primaryIntent,
      ...input.inferredIntent.secondaryIntents,
      ...input.inferredIntent.keywords,
      ...input.criticalMatches,
      ...tokenizeMemoryText(input.title).slice(0, 5),
      ...tokenizeMemoryText(input.content).slice(0, 8),
      ...input.sourceRefs.flatMap((ref) => tokenizeMemoryText(ref)).slice(0, 6)
    ].filter((cue) => cue && cue !== "unknown"))
  ).slice(0, 24);
}

function createPrivacySafeSummary(title: string, content: string, sensitivity: MemorySensitivity): string {
  if (sensitivity === "secret") {
    return `secret memory "${redactText(title)}"; raw content withheld.`;
  }
  const safeContent = redactText(content);
  const sentence = safeContent.split(/[.!?]\s/u)[0] || safeContent;
  return normalizeSummary(`${redactText(title)}: ${sentence}`, 260);
}

function inferBasicIntent(text: string): InferredIntent {
  const normalized = normalizeMemoryText(text);
  const scores: Array<[InferredIntent["primaryIntent"], number]> = [
    ["permission", scoreTerms(normalized, ["permission", "403", "forbidden", "role", "access", "privilege"])],
    ["routing", scoreTerms(normalized, ["route", "routing", "redirect", "path", "url", "endpoint"])],
    ["deploy", scoreTerms(normalized, ["deploy", "deployment", "release", "production", "build", "env"])],
    ["debug", scoreTerms(normalized, ["debug", "trace", "error", "exception", "risk"])],
    ["bugfix", scoreTerms(normalized, ["bug", "fix", "broken", "failure", "loi", "error"])],
    ["privacy", scoreTerms(normalized, ["privacy", "secret", "confidential", "prompt", "policy"])],
    ["api", scoreTerms(normalized, ["api", "endpoint", "request", "response"])],
    ["database", scoreTerms(normalized, ["database", "schema", "sql", "migration"])],
    ["memory", scoreTerms(normalized, ["memory", "lesson", "rule", "decision"])]
  ];
  const ranked = scores.filter(([, score]) => score > 0).sort((left, right) => right[1] - left[1]);
  const primaryIntent = ranked[0]?.[0] ?? "unknown";
  const secondaryIntents = ranked.slice(1, 4).map(([intent]) => intent);
  const total = ranked.reduce((sum, [, score]) => sum + score, 0);

  return {
    primaryIntent,
    secondaryIntents,
    keywords: tokenizeMemoryText(text).slice(0, 20),
    negativeKeywords: [],
    confidence: primaryIntent === "unknown" ? 0 : round(Math.min(1, (ranked[0]?.[1] ?? 0) / Math.max(total, 1)))
  };
}

function scoreTerms(text: string, terms: string[]): number {
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}
