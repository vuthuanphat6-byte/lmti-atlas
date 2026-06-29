import type { InferredIntent, MemoryKind, MemoryRecord, MemorySensitivity, PromptPolicy } from "@atlas/types";
import { clamp01, confidenceToWeight, durableMemoryKind, normalizeMemoryText, normalizePromptPolicy, round, tokenizeMemoryText } from "./encode";

export const DEFAULT_CONTEXT_ACTIVATION_THRESHOLD = 1.2;

export interface RetrievalScoreDetails {
  score: number;
  activation: number;
  baseActivation: number;
  lexicalScore: number;
  intentScore: number;
  associationScore: number;
  priorityScore: number;
  contextCueMatch: number;
  negativeKeywordPenalty: number;
  privacyPenalty: number;
  why: string[];
  filteredOutReason?: string;
}

export interface RetrievalScoreInput {
  query: string;
  taskIntent: InferredIntent;
  now?: Date;
}

const INTENT_KIND_WEIGHT: Partial<Record<MemoryKind, Partial<Record<InferredIntent["primaryIntent"], number>>>> = {
  permission: { permission: 4, auth: 2 },
  route: { routing: 4, api: 2, permission: 2 },
  deploy_note: { deploy: 4, debug: 1 },
  bug: { bugfix: 4, debug: 3 },
  risk: { privacy: 3, deploy: 2, debug: 2, bugfix: 2 },
  debug_note: { debug: 3, bugfix: 2 },
  rule: { permission: 2, routing: 2, deploy: 2, privacy: 2, memory: 2 },
  lesson: { permission: 2, routing: 2, deploy: 2, debug: 2, bugfix: 2, memory: 2 },
  decision: { permission: 2, routing: 2, deploy: 2, privacy: 2 }
};

export function scoreMemoryForRetrieval(record: MemoryRecord, input: RetrievalScoreInput): RetrievalScoreDetails {
  const now = input.now ?? new Date();
  const promptPolicy = normalizePromptPolicy(record.promptPolicy, record.sensitivity);
  const status = record.status ?? "active";
  const why: string[] = [];

  if (status === "archived") {
    return zeroScore("archived memory filtered from active retrieval");
  }
  if (status === "superseded") {
    return zeroScore("superseded memory is history, not source truth");
  }

  const corpus = normalizeMemoryText([
    record.title,
    record.content,
    record.kind,
    record.scope,
    record.projectId,
    ...(record.tags ?? []),
    ...(record.sourceRefs ?? []),
    ...(record.contextCues ?? [])
  ].join(" "));
  const queryTokens = tokenizeMemoryText(input.query);
  const intentKeywords = Array.from(new Set([input.taskIntent.primaryIntent, ...input.taskIntent.secondaryIntents, ...input.taskIntent.keywords].filter(Boolean)));

  let lexicalScore = 0;
  for (const keyword of queryTokens) {
    if (corpus.includes(normalizeMemoryText(keyword))) {
      lexicalScore += keyword.length > 3 ? 1.5 : 0.75;
    }
  }
  if (lexicalScore > 0) {
    why.push(`lexical match ${round(lexicalScore)}`);
  }

  let intentScore = 0;
  if (input.taskIntent.primaryIntent !== "unknown" && corpus.includes(normalizeMemoryText(input.taskIntent.primaryIntent))) {
    intentScore += 3;
    why.push(`matched primary intent ${input.taskIntent.primaryIntent}`);
  }
  for (const intent of input.taskIntent.secondaryIntents) {
    if (corpus.includes(normalizeMemoryText(intent))) {
      intentScore += 1.25;
      why.push(`matched secondary intent ${intent}`);
    }
  }
  const kindWeight = INTENT_KIND_WEIGHT[record.kind]?.[input.taskIntent.primaryIntent] ?? 0;
  if (kindWeight > 0) {
    intentScore += kindWeight;
    why.push(`${record.kind} memory fits ${input.taskIntent.primaryIntent}`);
  }

  let contextCueMatch = 0;
  for (const cue of record.contextCues ?? []) {
    const normalizedCue = normalizeMemoryText(cue);
    if (normalizedCue && intentKeywords.some((keyword) => normalizeMemoryText(keyword).includes(normalizedCue) || normalizedCue.includes(normalizeMemoryText(keyword)))) {
      contextCueMatch += 0.5;
    }
  }
  if (contextCueMatch > 0) {
    why.push(`matched context cues ${round(contextCueMatch)}`);
  }

  let associationScore = 0;
  for (const association of record.associations ?? []) {
    const associationCorpus = normalizeMemoryText(`${association.reason} ${association.targetMemoryId}`);
    if (intentKeywords.some((keyword) => associationCorpus.includes(normalizeMemoryText(keyword)))) {
      associationScore += association.weight;
    }
  }
  associationScore = round(Math.min(3, associationScore * 2));
  if (associationScore > 0) {
    why.push(`association contribution ${associationScore}`);
  }

  let negativeKeywordPenalty = 0;
  for (const keyword of input.taskIntent.negativeKeywords) {
    const normalized = normalizeMemoryText(keyword);
    if (normalized && corpus.includes(normalized)) {
      negativeKeywordPenalty += 10;
    }
  }
  for (const cue of record.negativeCues ?? []) {
    const normalized = normalizeMemoryText(cue);
    if (normalized && normalizeMemoryText(input.query).includes(normalized)) {
      negativeKeywordPenalty += 3;
    }
  }
  if (negativeKeywordPenalty > 0) {
    why.push(`negative cue penalty ${negativeKeywordPenalty}`);
  }

  const baseActivation = calculateBaseActivation(record, now);
  const priorityScore = round((record.priorityScore ?? defaultPriority(record.kind, record.importance)) * 4);
  const privacyPenalty = privacyRetrievalPenalty(record.sensitivity, promptPolicy);
  if (privacyPenalty > 0) {
    why.push(`privacy penalty ${privacyPenalty}`);
  }

  const activation = round(baseActivation + associationScore + contextCueMatch + priorityScore * 0.25 - negativeKeywordPenalty * 0.6);
  const score = round(
    lexicalScore
      + intentScore
      + baseActivation
      + associationScore
      + priorityScore
      + contextCueMatch
      - negativeKeywordPenalty
      - privacyPenalty
  );

  return {
    score: Math.max(0, score),
    activation: Math.max(0, activation),
    baseActivation,
    lexicalScore: round(lexicalScore),
    intentScore: round(intentScore),
    associationScore,
    priorityScore,
    contextCueMatch: round(contextCueMatch),
    negativeKeywordPenalty,
    privacyPenalty,
    why
  };
}

export function explainPrivacyDecision(input: {
  sensitivity: MemorySensitivity;
  promptPolicy?: PromptPolicy;
  role: string;
  includeRaw?: boolean;
  includeSecret?: boolean;
}): string {
  const promptPolicy = normalizePromptPolicy(input.promptPolicy, input.sensitivity);
  if (input.sensitivity === "secret") {
    return input.role === "owner" && input.includeSecret ? "metadata_only: owner requested secret metadata" : "blocked: secret";
  }
  if (promptPolicy === "do_not_prompt") {
    return "blocked: do_not_prompt";
  }
  if (input.sensitivity === "confidential") {
    return input.role === "owner" || input.role === "maintainer" ? "summary: confidential raw blocked by default" : "summary: confidential";
  }
  if (input.sensitivity === "internal") {
    return input.role === "external_model" ? "summary: external model cannot receive internal raw" : input.includeRaw ? "raw: trusted role requested raw" : "summary: internal default";
  }
  return promptPolicy === "summarize_only" ? "summary: prompt policy" : "raw: public";
}

export function calculateBaseActivation(record: MemoryRecord, now: Date): number {
  const retrievalCount = record.retrievalCount ?? 0;
  const storedBase = record.baseActivation ?? 0;
  const recencyBoost = recencyBoostFor(record, now);
  const importanceBoost = clamp01(record.importance) * 1.6;
  const confidenceBoost = confidenceToWeight(record.confidence) * 0.8;
  const stabilityBoost = (record.stability ?? 0.4) * 0.5;
  const agePenalty = decayPenaltyFor(record, now);
  return round(Math.log1p(retrievalCount) + storedBase * 0.3 + recencyBoost + importanceBoost + confidenceBoost + stabilityBoost - agePenalty);
}

function zeroScore(filteredOutReason: string): RetrievalScoreDetails {
  return {
    score: 0,
    activation: 0,
    baseActivation: 0,
    lexicalScore: 0,
    intentScore: 0,
    associationScore: 0,
    priorityScore: 0,
    contextCueMatch: 0,
    negativeKeywordPenalty: 0,
    privacyPenalty: 0,
    why: [filteredOutReason],
    filteredOutReason
  };
}

function defaultPriority(kind: MemoryKind, importance: number): number {
  const importantKind = ["lesson", "rule", "permission", "deploy_note", "bug", "risk", "decision", "route"].includes(kind);
  return clamp01(importance * 0.6 + (importantKind ? 0.3 : 0.08));
}

function privacyRetrievalPenalty(sensitivity: MemorySensitivity, promptPolicy: PromptPolicy): number {
  if (promptPolicy === "do_not_prompt" || sensitivity === "secret") {
    return 8;
  }
  if (sensitivity === "confidential") {
    return 1;
  }
  return 0;
}

function recencyBoostFor(record: MemoryRecord, now: Date): number {
  const timestamp = new Date(record.lastRetrievedAt ?? record.lastReinforcedAt ?? record.updatedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  const ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  if (ageDays <= 3) {
    return 0.9;
  }
  if (ageDays <= 14) {
    return 0.45;
  }
  if (ageDays <= 45) {
    return 0.15;
  }
  return 0;
}

function decayPenaltyFor(record: MemoryRecord, now: Date): number {
  if (durableMemoryKind(record.kind)) {
    return 0;
  }
  const timestamp = new Date(record.lastRetrievedAt ?? record.lastReinforcedAt ?? record.updatedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return 0.25;
  }
  const ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  const strength = Math.max(1, record.memoryStrength ?? 30);
  return round(Math.min(2, ageDays / strength));
}
