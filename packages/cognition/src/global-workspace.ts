import { redactText } from "@atlas/privacy";
import type { BlackboardEntry, CognitiveGoal, WorkspaceWinner } from "./types";

export interface WorkspaceSelectionOptions {
  now?: Date;
  integratedInformationBoost?: number;
  contradictions?: string[];
}

export function selectWorkspaceWinner(
  entries: BlackboardEntry[],
  goal: CognitiveGoal,
  options: WorkspaceSelectionOptions = {}
): WorkspaceWinner {
  const now = options.now ?? new Date();
  const scored = entries.map((entry) => scoreWorkspaceEntry(entry, goal, now, options));
  const winner = scored.sort((left, right) => right.score - left.score)[0];
  if (!winner) {
    const emptyEntry = createEmptyEntry(goal, now);
    return {
      entry: emptyEntry,
      score: 0,
      reason: ["no workspace entries available"],
      safeContent: emptyEntry.summary,
      privacyDecision: emptyEntry.privacyDecision
    };
  }

  return {
    entry: winner.entry,
    score: winner.score,
    reason: winner.reason,
    safeContent: safeWorkspaceContent(winner.entry),
    privacyDecision: winner.entry.privacyDecision
  };
}

export function scoreWorkspaceEntry(
  entry: BlackboardEntry,
  goal: CognitiveGoal,
  now: Date,
  options: WorkspaceSelectionOptions = {}
): { entry: BlackboardEntry; score: number; reason: string[] } {
  const reason: string[] = [];
  const goalMatchScore = scoreGoalMatch(entry, goal);
  const recencyBoost = calculateRecencyBoost(entry, now);
  const privacyPenalty = calculatePrivacyPenalty(entry);
  const contradictionPenalty = (options.contradictions ?? []).some((contradiction) => contradiction.includes(entry.id)) ? 2 : 0;
  const stalePenalty = entry.expiresAt && new Date(entry.expiresAt).getTime() <= now.getTime() ? 5 : 0;
  const integratedInformationBoost = options.integratedInformationBoost ?? 0;
  const score = round(
    entry.priority
      + entry.activation
      + goalMatchScore
      + entry.confidence
      + recencyBoost
      + integratedInformationBoost
      - privacyPenalty
      - contradictionPenalty
      - stalePenalty
  );

  if (goalMatchScore > 0) {
    reason.push(`matched goal ${goal.id}`);
  }
  if (entry.activation > 0.6) {
    reason.push("high activation");
  }
  if (entry.kind === "risk" || entry.kind === "constraint") {
    reason.push(`${entry.kind} deserves attention`);
  }
  if (privacyPenalty > 0) {
    reason.push("privacy penalty applied");
  }
  if (contradictionPenalty > 0) {
    reason.push("prediction contradiction penalty applied");
  }

  return { entry, score: Math.max(0, score), reason };
}

function safeWorkspaceContent(entry: BlackboardEntry): string {
  if (entry.sensitivity === "secret" || entry.promptPolicy === "do_not_prompt") {
    return `${entry.sensitivity} entry metadata only; raw content withheld.`;
  }
  if (entry.sensitivity === "confidential") {
    return entry.summary || `${entry.sensitivity} entry summarized; raw content withheld.`;
  }
  return redactText(entry.summary || entry.content);
}

function scoreGoalMatch(entry: BlackboardEntry, goal: CognitiveGoal): number {
  const corpus = normalize([entry.content, entry.summary, ...entry.contextCues].join(" "));
  const terms = [goal.title, goal.description, ...goal.successCriteria, ...goal.constraints]
    .flatMap((value) => tokenize(value));
  const matches = terms.filter((term) => term.length > 2 && corpus.includes(term));
  return Math.min(2.5, matches.length * 0.35);
}

function calculateRecencyBoost(entry: BlackboardEntry, now: Date): number {
  const created = new Date(entry.createdAt).getTime();
  if (!Number.isFinite(created)) {
    return 0;
  }
  const ageMinutes = Math.max(0, (now.getTime() - created) / 60_000);
  if (ageMinutes <= 10) {
    return 0.6;
  }
  if (ageMinutes <= 120) {
    return 0.25;
  }
  return 0;
}

function calculatePrivacyPenalty(entry: BlackboardEntry): number {
  if (entry.promptPolicy === "do_not_prompt" || entry.sensitivity === "secret") {
    return 4;
  }
  if (entry.sensitivity === "confidential") {
    return 0.7;
  }
  return 0;
}

function createEmptyEntry(goal: CognitiveGoal, now: Date): BlackboardEntry {
  return {
    id: "workspace:none",
    source: "agent",
    kind: "observation",
    content: `No focus selected for ${goal.title}.`,
    summary: `No focus selected for ${goal.title}.`,
    priority: 0,
    activation: 0,
    confidence: 0,
    contextCues: [],
    sensitivity: "internal",
    promptPolicy: "summarize_only",
    privacyDecision: "metadata_only: no workspace entry",
    sourceRefs: [],
    createdAt: now.toISOString()
  };
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9_/-]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
