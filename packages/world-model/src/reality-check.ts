import type { ActiveInferenceAction, BeliefState, RealityCheckInput, RealityCheckResult, WorldObservation } from "./types";
import { estimateComputeCost } from "./resource-budget";
import { proposeActiveInferenceActions } from "./active-inference";
import { createMarkovBlanketState } from "./markov-blanket";

export function checkRealityAlignment(input: RealityCheckInput): RealityCheckResult {
  const assumptions = input.beliefs.filter((belief) => belief.evidenceRefs.length === 0).map((belief) => belief.statement);
  const confirmedFacts: string[] = [];
  const contradictions: string[] = [];
  const staleMemoryIds: string[] = [];
  const missingEvidence: string[] = [];

  for (const belief of input.beliefs) {
    const supporting = input.observations.filter((observation) => supportsBelief(observation, belief));
    const contradicting = input.observations.filter((observation) => contradictsBelief(observation, belief));

    if (supporting.length > 0) {
      confirmedFacts.push(`${belief.statement} supported by ${supporting.flatMap((item) => item.evidenceRefs).join(", ")}`);
    }
    if (contradicting.length > 0) {
      contradictions.push(`${belief.statement} contradicted by ${contradicting.map((item) => item.statement).join("; ")}`);
      if (belief.evidenceRefs.some((ref) => ref.startsWith("memory:") || ref.includes("long_term"))) {
        staleMemoryIds.push(belief.id);
      }
    }
    if (supporting.length === 0 && contradicting.length === 0) {
      missingEvidence.push(`${belief.id}: ${belief.statement}`);
    }
  }

  const cost = input.cost ?? estimateComputeCost({ text: input.task, observations: input.observations });
  const syntheticBlanket = createMarkovBlanketState([], { projectId: "reality-check" });
  const actions: ActiveInferenceAction[] = proposeActiveInferenceActions({
    blanket: {
      ...syntheticBlanket,
      observations: input.observations,
      confidence: input.observations.length > 0 ? input.observations.reduce((sum, observation) => sum + observation.confidence, 0) / input.observations.length : 0
    },
    cost,
    alignment: {
      updatedBeliefs: input.beliefs,
      contradictedBeliefs: input.beliefs.filter((belief) => contradictions.some((text) => text.includes(belief.statement))),
      confirmedBeliefs: input.beliefs.filter((belief) => confirmedFacts.some((text) => text.includes(belief.statement))),
      uncertainty: missingEvidence.length / Math.max(1, input.beliefs.length),
      predictionError: contradictions.length * 0.35 + missingEvidence.length * 0.1,
      explanation: []
    },
    task: input.task
  });
  const confidence = round(Math.max(0, Math.min(1, (confirmedFacts.length + 1) / Math.max(1, input.beliefs.length + contradictions.length + missingEvidence.length))));

  return {
    aligned: contradictions.length === 0,
    assumptions,
    confirmedFacts,
    contradictions,
    staleMemoryIds: Array.from(new Set(staleMemoryIds)),
    missingEvidence,
    recommendedActions: actions,
    confidence
  };
}

function supportsBelief(observation: WorldObservation, belief: BeliefState): boolean {
  return observation.supports.includes(belief.id) || overlap(observation.statement, belief.statement) >= 2;
}

function contradictsBelief(observation: WorldObservation, belief: BeliefState): boolean {
  return observation.contradicts.includes(belief.id) || (
    overlap(observation.statement, belief.statement) >= 1
    && /\b(now|instead|no longer|not|contradicts|different|fails)\b/i.test(observation.statement)
  );
}

function overlap(left: string, right: string): number {
  const leftTerms = new Set(tokens(left));
  return tokens(right).filter((term) => leftTerms.has(term)).length;
}

function tokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/i)
    .filter((part) => part.length >= 3);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
