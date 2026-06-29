import type {
  BlackboardEntry,
  CognitiveFocusDecision,
  CognitiveGoal,
  IntegratedInformationEstimate,
  PredictionErrorEstimate,
  RejectedFocusCandidate
} from "./types";
import { scoreWorkspaceEntry } from "./global-workspace";

export interface CognitiveArbitrationInput {
  task: string;
  goal: CognitiveGoal;
  entries: BlackboardEntry[];
  integratedInformation: IntegratedInformationEstimate;
  predictionError: PredictionErrorEstimate;
  now?: Date;
}

export function arbitrateCognitiveFocus(input: CognitiveArbitrationInput): CognitiveFocusDecision {
  const now = input.now ?? new Date();
  const contradictions = input.predictionError.contradictions;
  const scored = input.entries
    .map((entry) => scoreWorkspaceEntry(entry, input.goal, now, { contradictions, integratedInformationBoost: input.integratedInformation.normalizedPhi }))
    .sort((left, right) => right.score - left.score);
  const winner = scored[0];

  if (!winner) {
    return {
      focusId: "focus:none",
      selectedFocus: `Clarify task: ${input.task}`,
      selectedSourceRefs: [],
      rejectedCandidates: [],
      reason: ["no cognitive candidates available"],
      confidence: 0.1,
      recommendedNextAction: ["Run context retrieval before acting."]
    };
  }

  const rejectedCandidates = scored.slice(1, 8).map(({ entry, score }) => rejectCandidate(entry, score, winner.entry));
  const recommendedNextAction = createNextActions(input, winner.entry);
  const confidence = Math.max(
    0.1,
    Math.min(1, winner.entry.confidence + input.integratedInformation.normalizedPhi * 0.25 - input.predictionError.error * 0.05)
  );

  return {
    focusId: `focus:${winner.entry.id}`,
    selectedFocus: winner.entry.summary,
    selectedSourceRefs: winner.entry.sourceRefs,
    rejectedCandidates,
    reason: [
      ...winner.reason,
      `workspace score ${winner.score}`,
      `phi ${input.integratedInformation.normalizedPhi}`,
      `prediction error ${input.predictionError.error}`
    ],
    confidence: Math.round(confidence * 100) / 100,
    recommendedNextAction
  };
}

function rejectCandidate(entry: BlackboardEntry, score: number, winner: BlackboardEntry): RejectedFocusCandidate {
  const winnerCues = new Set(winner.contextCues.map(normalize));
  const overlap = entry.contextCues.filter((cue) => winnerCues.has(normalize(cue))).length;
  let reason = score <= 0 ? "low relevance" : "lower workspace score";
  if (entry.contextCues.some((cue) => ["logo", "brand", "asset", "image"].includes(normalize(cue))) && !winner.contextCues.some((cue) => ["logo", "brand"].includes(normalize(cue)))) {
    reason = "rejected noisy asset candidate for current task focus";
  } else if (overlap === 0) {
    reason = "no context cue overlap with selected focus";
  } else if (entry.sensitivity === "secret" || entry.promptPolicy === "do_not_prompt") {
    reason = "privacy-restricted candidate cannot be primary prompt focus";
  }

  return {
    id: entry.id,
    source: entry.source,
    reason,
    score
  };
}

function createNextActions(input: CognitiveArbitrationInput, winner: BlackboardEntry): string[] {
  const actions = new Set<string>();
  if (input.integratedInformation.fragmentationRisk > 0.5) {
    actions.add("Run focused context retrieval to reduce fragmentation.");
  }
  for (const action of input.predictionError.recommendedAction) {
    actions.add(action);
  }
  if (winner.kind === "risk") {
    actions.add("Resolve or acknowledge the selected risk before implementation.");
  }
  if (winner.kind === "file" || winner.kind === "module") {
    actions.add("Inspect the selected file/module before changing behavior.");
  }
  if (actions.size === 0) {
    actions.add("Use the selected focus as the next reasoning target.");
  }
  return Array.from(actions);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
