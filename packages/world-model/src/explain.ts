import type { WorldModelCycleResult } from "./types";

export function explainWorldModelCycle(result: WorldModelCycleResult): string[] {
  return [
    ...result.blanket.explanation,
    `compute cost=${result.cost.computeCost}; mode=${result.cost.recommendedMode}`,
    `prediction error=${result.alignment.predictionError}; uncertainty=${result.alignment.uncertainty}`,
    result.realityCheck.aligned ? "reality check aligned with current observations" : "reality check found contradictions",
    ...result.realityCheck.missingEvidence.map((item) => `missing evidence: ${item}`),
    ...result.realityCheck.contradictions.map((item) => `contradiction: ${item}`),
    ...result.proposedActions.slice(0, 3).map((action) => `proposed action: ${action.kind} - ${action.title}`)
  ];
}
