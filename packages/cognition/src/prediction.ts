import type {
  CognitiveObservation,
  CognitivePrediction,
  PredictionErrorEstimate,
  PredictionState,
  PredictionStateInput
} from "./types";

export function createPredictionState(input: PredictionStateInput): PredictionState {
  const generated = createPredictionsFromContext(input);
  const predictions = [...(input.predictions ?? []), ...generated];
  const observations = input.observations ?? [];
  const error = estimatePredictionError({ predictions, observations, freeEnergyEstimate: 0, uncertainty: 0 });
  const uncertainty = round(clamp01((predictions.filter((prediction) => prediction.confidence < 0.55).length + error.missingEvidence.length) / Math.max(1, predictions.length * 2)));

  return {
    predictions,
    observations,
    freeEnergyEstimate: error.error,
    uncertainty,
    nextBestObservation: error.missingEvidence[0]
  };
}

export function updatePredictionWithObservation(state: PredictionState, observation: CognitiveObservation): PredictionState {
  const observations = [...state.observations, observation];
  const error = estimatePredictionError({ ...state, observations });
  const uncertainty = round(clamp01((state.predictions.filter((prediction) => prediction.confidence < 0.55).length + error.missingEvidence.length) / Math.max(1, state.predictions.length * 2)));
  return {
    ...state,
    observations,
    freeEnergyEstimate: error.error,
    uncertainty,
    nextBestObservation: error.missingEvidence[0]
  };
}

export function estimatePredictionError(state: PredictionState): PredictionErrorEstimate {
  const contradictions: string[] = [];
  const missingEvidence: string[] = [];
  let missingEvidencePenalty = 0;
  let contradictionPenalty = 0;
  let confirmedEvidenceBoost = 0;

  for (const prediction of state.predictions) {
    const supporting = state.observations.filter((observation) => observation.supportsPredictionIds.includes(prediction.id));
    const contradicting = state.observations.filter((observation) => observation.contradictsPredictionIds.includes(prediction.id));

    if (supporting.length === 0 && prediction.expectedEvidence.length > 0) {
      missingEvidence.push(...prediction.expectedEvidence.map((evidence) => `${prediction.id}: ${evidence}`));
      missingEvidencePenalty += prediction.expectedEvidence.length * (1 - prediction.confidence + 0.4);
    } else {
      confirmedEvidenceBoost += supporting.reduce((sum, observation) => sum + observation.confidence, 0);
    }

    if (contradicting.length > 0) {
      contradictions.push(...contradicting.map((observation) => `${prediction.id}: ${observation.statement}`));
      contradictionPenalty += contradicting.reduce((sum, observation) => sum + 2 * observation.confidence, 0);
    }
  }

  const uncertaintyPenalty = state.uncertainty * 2;
  const staleMemoryPenalty = state.predictions.filter((prediction) => prediction.statement.toLowerCase().includes("deprecated")).length * 0.8;
  const error = round(Math.max(0, missingEvidencePenalty + contradictionPenalty + uncertaintyPenalty + staleMemoryPenalty - confirmedEvidenceBoost * 0.6));
  const recommendedAction = createRecommendedActions(contradictions, missingEvidence);

  return {
    error,
    contradictions,
    missingEvidence,
    recommendedAction
  };
}

function createPredictionsFromContext(input: PredictionStateInput): CognitivePrediction[] {
  const predictions: CognitivePrediction[] = [];
  for (const item of input.contextItems ?? []) {
    if (item.kind !== "memory" && item.kind !== "constraint" && item.kind !== "risk" && item.kind !== "file" && item.kind !== "module") {
      continue;
    }
    predictions.push({
      id: `prediction:${item.id}`,
      statement: item.summary || item.content,
      expectedEvidence: item.sourceRefs.length > 0 ? item.sourceRefs : [`verify ${item.kind} evidence for ${item.id}`],
      confidence: clamp01(item.confidence),
      source: item.source === "long_term_memory" || item.source === "working_memory" ? "memory" : item.source === "amf" || item.kind === "file" || item.kind === "module" ? "amf" : "agent"
    });
  }

  if (predictions.length === 0) {
    predictions.push({
      id: "prediction:task-evidence",
      statement: `Task "${input.task}" needs focused evidence before action.`,
      expectedEvidence: ["retrieve relevant memory or inspect related AMF context"],
      confidence: input.goal ? 0.55 : 0.35,
      source: "agent"
    });
  }

  return predictions.slice(0, 16);
}

function createRecommendedActions(contradictions: string[], missingEvidence: string[]): string[] {
  const actions = new Set<string>();
  if (missingEvidence.length > 0) {
    actions.add("Inspect the missing evidence refs before making irreversible changes.");
    actions.add("Run context or memory explain for the active task.");
  }
  if (contradictions.length > 0) {
    actions.add("Resolve contradictions between memory and current evidence before treating memory as truth.");
  }
  if (actions.size === 0) {
    actions.add("Proceed with the selected focus and keep evidence attached to the result.");
  }
  return Array.from(actions);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
