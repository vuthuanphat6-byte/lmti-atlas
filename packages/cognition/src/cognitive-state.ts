import { randomUUID } from "node:crypto";
import type {
  BlackboardEntry,
  CognitiveContextItem,
  CognitiveCycleInput,
  CognitiveCycleResult,
  CognitiveGoal,
  CognitivePrivacySummary,
  CognitiveState,
  GlobalWorkspaceState,
  IntegratedComponent
} from "./types";
import { CognitiveBlackboard } from "./blackboard";
import { estimateIntegratedInformation } from "./integrated-information";
import { createPredictionState, estimatePredictionError } from "./prediction";
import { selectWorkspaceWinner, scoreWorkspaceEntry } from "./global-workspace";
import { arbitrateCognitiveFocus } from "./arbitration";
import { broadcastWorkspace } from "./broadcast";
import { explainCognitiveState } from "./explain";

export function runCognitiveCycle(input: CognitiveCycleInput): CognitiveCycleResult {
  const now = input.now ?? new Date();
  const currentGoal = createGoal(input);
  const allItems = [...(input.workingMemory ?? []), ...(input.longTermMemory ?? []), ...(input.contextItems ?? [])];
  const blackboard = new CognitiveBlackboard();
  const goalEntry = createGoalEntry(currentGoal, input.projectId, now);
  blackboard.write(goalEntry);
  for (const item of allItems) {
    blackboard.write(contextItemToBlackboardEntry(item, now));
  }

  const entries = blackboard.read({ now });
  const activeIntent = input.inferredIntent?.primaryIntent ?? inferIntentLabel(input.task, allItems);
  const secondaryIntents = input.inferredIntent?.secondaryIntents ?? [];
  const components = entries.map((entry) => blackboardEntryToComponent(entry, entries, activeIntent));
  const integratedInformation = estimateIntegratedInformation({
    components,
    activeIntent,
    secondaryIntents,
    conflicts: input.privacyBlocks
  });
  const predictionState = createPredictionState({
    task: input.task,
    goal: currentGoal,
    contextItems: allItems,
    predictions: input.predictions,
    observations: input.observations
  });
  const predictionError = estimatePredictionError(predictionState);
  const winner = selectWorkspaceWinner(entries, currentGoal, {
    now,
    integratedInformationBoost: integratedInformation.normalizedPhi,
    contradictions: predictionError.contradictions
  });
  const attentionTrace = entries
    .map((entry) => scoreWorkspaceEntry(entry, currentGoal, now, {
      integratedInformationBoost: integratedInformation.normalizedPhi,
      contradictions: predictionError.contradictions
    }))
    .map((entry) => ({ id: entry.entry.id, score: entry.score, reason: entry.reason }))
    .sort((left, right) => right.score - left.score);
  const focus = arbitrateCognitiveFocus({
    task: input.task,
    goal: currentGoal,
    entries,
    integratedInformation,
    predictionError,
    now
  });
  const broadcasts = broadcastWorkspace(winner, input.subscribers);
  const workspace: GlobalWorkspaceState = {
    entries,
    winner,
    broadcastCount: broadcasts.filter((broadcast) => broadcast.delivered).length,
    attentionTrace
  };
  const privacySummary = createPrivacySummary(entries, broadcasts, input.privacyBlocks ?? []);
  const baseState: CognitiveState = {
    id: randomUUID(),
    projectId: input.projectId,
    task: input.task,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    currentGoal,
    activeIntent,
    secondaryIntents,
    workingMemoryIds: (input.workingMemory ?? []).map((item) => item.id),
    longTermMemoryIds: (input.longTermMemory ?? []).map((item) => item.id),
    activeContextCues: Array.from(new Set(entries.flatMap((entry) => entry.contextCues))).slice(0, 32),
    integratedInformation,
    predictionState,
    workspace,
    privacySummary,
    explanation: {
      selectedFocus: focus.selectedFocus,
      focusReasons: focus.reason,
      memoryInfluence: [],
      fileModuleInfluence: [],
      missingEvidence: predictionError.missingEvidence,
      highRisks: entries.filter((entry) => entry.kind === "risk").map((entry) => entry.summary),
      fragmentation: integratedInformation.explanation,
      privacy: privacySummary.notes,
      recommendedActions: focus.recommendedNextAction
    }
  };
  const state = {
    ...baseState,
    explanation: explainCognitiveState(baseState)
  };
  const recommendedActions = Array.from(new Set([...focus.recommendedNextAction, ...predictionError.recommendedAction]));

  return {
    state,
    focus,
    broadcasts,
    predictionError,
    recommendedActions
  };
}

function createGoal(input: CognitiveCycleInput): CognitiveGoal {
  return {
    id: input.goal?.id ?? `goal:${stableToken(input.task).slice(0, 12)}`,
    title: input.goal?.title ?? input.task,
    description: input.goal?.description ?? `Complete task: ${input.task}`,
    priority: clamp01(input.goal?.priority ?? 0.75),
    successCriteria: input.goal?.successCriteria ?? ["selected focus has supporting evidence", "privacy-safe output is preserved"],
    constraints: input.goal?.constraints ?? ["do not expose secret memory", "do not treat superseded memory as truth"]
  };
}

function createGoalEntry(goal: CognitiveGoal, projectId: string, now: Date): BlackboardEntry {
  return {
    id: goal.id,
    source: "agent",
    kind: "goal",
    content: goal.description,
    summary: goal.title,
    priority: goal.priority,
    activation: goal.priority,
    confidence: 0.8,
    contextCues: tokenize(`${goal.title} ${goal.description} ${goal.successCriteria.join(" ")}`),
    sensitivity: "internal",
    promptPolicy: "summarize_only",
    privacyDecision: `summary: ${projectId} goal metadata`,
    sourceRefs: [projectId],
    createdAt: now.toISOString()
  };
}

function contextItemToBlackboardEntry(item: CognitiveContextItem, now: Date): BlackboardEntry {
  return {
    id: item.id,
    source: item.source,
    kind: item.kind,
    content: item.content,
    summary: item.summary ?? summarize(item.content),
    priority: clamp01(item.priority),
    activation: clamp01(item.activation ?? item.priority),
    confidence: clamp01(item.confidence),
    contextCues: item.contextCues,
    sensitivity: item.sensitivity,
    promptPolicy: item.promptPolicy,
    privacyDecision: item.privacyDecision ?? defaultPrivacyDecision(item),
    sourceRefs: item.sourceRefs,
    createdAt: item.createdAt ?? now.toISOString(),
    expiresAt: item.expiresAt
  };
}

function blackboardEntryToComponent(entry: BlackboardEntry, entries: BlackboardEntry[], activeIntent: string): IntegratedComponent {
  const ownCues = new Set(entry.contextCues.map(normalize));
  const connectedTo = entries
    .filter((candidate) => candidate.id !== entry.id)
    .filter((candidate) => candidate.contextCues.some((cue) => ownCues.has(normalize(cue))) || candidate.contextCues.some((cue) => normalize(cue) === normalize(activeIntent)))
    .map((candidate) => candidate.id)
    .slice(0, 12);
  return {
    id: entry.id,
    kind: entry.kind,
    label: entry.summary,
    sourceRefs: entry.sourceRefs,
    connectedTo,
    contextCues: entry.contextCues,
    weight: entry.priority + entry.activation,
    sensitivity: entry.sensitivity,
    promptPolicy: entry.promptPolicy,
    privacyDecision: entry.privacyDecision
  };
}

function createPrivacySummary(entries: BlackboardEntry[], broadcasts: Array<{ privacyDecision: string; mode: string }>, blocks: string[]): CognitivePrivacySummary {
  const blockedEvidenceCount = broadcasts.filter((broadcast) => broadcast.mode === "blocked").length + blocks.length;
  const summarizedEvidenceCount = broadcasts.filter((broadcast) => broadcast.mode === "summary" || broadcast.mode === "metadata_only").length;
  const mostSensitive = entries.some((entry) => entry.sensitivity === "secret")
    ? "secret"
    : entries.some((entry) => entry.sensitivity === "confidential")
      ? "confidential"
      : entries.some((entry) => entry.sensitivity === "internal")
        ? "internal"
        : "public";
  const notes = [
    blockedEvidenceCount > 0 ? "Some evidence was withheld by Cognitive Privacy Layer." : "No evidence was privacy-blocked.",
    summarizedEvidenceCount > 0 ? "Some evidence was summarized before broadcast." : "No broadcast summarization was required.",
    ...blocks
  ];
  return {
    sensitivity: mostSensitive,
    promptPolicy: mostSensitive === "public" ? "allow_raw" : mostSensitive === "secret" ? "do_not_prompt" : "summarize_only",
    privacyDecision: blockedEvidenceCount > 0 ? "blocked_or_summarized: privacy layer enforced" : "allow: policy-safe cognition output",
    blockedEvidenceCount,
    summarizedEvidenceCount,
    notes
  };
}

function inferIntentLabel(task: string, items: CognitiveContextItem[]): string {
  const corpus = normalize(`${task} ${items.flatMap((item) => item.contextCues).join(" ")}`);
  if (corpus.includes("permission") || corpus.includes("403")) {
    return "permission";
  }
  if (corpus.includes("route") || corpus.includes("routing")) {
    return "routing";
  }
  if (corpus.includes("deploy")) {
    return "deploy";
  }
  if (corpus.includes("bug") || corpus.includes("error") || corpus.includes("loi")) {
    return "debug";
  }
  return "unknown";
}

function defaultPrivacyDecision(item: CognitiveContextItem): string {
  if (item.promptPolicy === "do_not_prompt") {
    return "blocked: do_not_prompt";
  }
  if (item.sensitivity === "secret") {
    return "blocked: secret";
  }
  if (item.sensitivity === "confidential") {
    return "summary: confidential";
  }
  if (item.sensitivity === "internal") {
    return "summary: internal default";
  }
  return item.promptPolicy === "summarize_only" ? "summary: prompt policy" : "raw: public";
}

function summarize(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= 220 ? normalized : `${normalized.slice(0, 219).trim()}...`;
}

function tokenize(value: string): string[] {
  return Array.from(new Set(normalize(value).split(/[^a-z0-9_/-]+/i).filter((part) => part.length >= 2))).slice(0, 20);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function stableToken(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "task";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
