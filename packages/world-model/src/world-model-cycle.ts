import type { BeliefState, WorldModelCycleInput, WorldModelCycleResult } from "./types";
import { alignBeliefsWithObservations } from "./bayesian-alignment";
import { explainWorldModelCycle } from "./explain";
import { createMarkovBlanketState } from "./markov-blanket";
import { proposeActiveInferenceActions } from "./active-inference";
import { checkRealityAlignment } from "./reality-check";
import { estimateComputeCost } from "./resource-budget";

export function runWorldModelCycle(input: WorldModelCycleInput): WorldModelCycleResult {
  const now = input.now ?? new Date();
  const blanket = createMarkovBlanketState(input.inputs, {
    projectId: input.projectId,
    now
  });
  const cost = estimateComputeCost({
    text: input.task,
    inputs: blanket.sensoryInputs,
    observations: blanket.observations
  }, input.budget);
  const beliefs = input.beliefs?.length ? input.beliefs : createBeliefsFromInputs(input.task, blanket, now);
  const alignment = alignBeliefsWithObservations(beliefs, blanket.observations, now);
  const realityCheck = checkRealityAlignment({
    task: input.task,
    beliefs: alignment.updatedBeliefs,
    observations: blanket.observations,
    cost
  });
  const proposedActions = proposeActiveInferenceActions({
    blanket,
    cost,
    alignment,
    budget: input.budget,
    task: input.task
  });
  const result = {
    blanket,
    cost,
    alignment,
    realityCheck: {
      ...realityCheck,
      recommendedActions: realityCheck.recommendedActions.length > 0 ? realityCheck.recommendedActions : proposedActions
    },
    proposedActions,
    explanation: []
  };

  return {
    ...result,
    explanation: explainWorldModelCycle(result)
  };
}

function createBeliefsFromInputs(task: string, blanket: ReturnType<typeof createMarkovBlanketState>, now: Date): BeliefState[] {
  const memoryInputs = blanket.sensoryInputs.filter((input) => input.source === "memory");
  if (memoryInputs.length === 0) {
    return [{
      id: "belief:task-needs-evidence",
      statement: `Task "${task}" needs external evidence before action.`,
      prior: 0.5,
      likelihood: 0.5,
      posterior: 0.5,
      evidenceRefs: [],
      confidence: 0.4,
      updatedAt: now.toISOString()
    }];
  }

  return memoryInputs.map((input) => ({
    id: `belief:${input.id}`,
    statement: input.summary ?? input.content,
    prior: input.confidence,
    likelihood: input.confidence,
    posterior: input.confidence,
    evidenceRefs: input.sourceRefs,
    confidence: input.confidence,
    updatedAt: now.toISOString()
  }));
}
