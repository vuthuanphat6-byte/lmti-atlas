import { randomUUID } from "node:crypto";
import type { MarkovBlanketOptions, MarkovBlanketState, SensoryInput } from "./types";
import { isNoiseInput, normalizeSensoryInput, sensoryInputToObservation } from "./observations";

export function createMarkovBlanketState(inputs: SensoryInput[], options: MarkovBlanketOptions): MarkovBlanketState {
  const now = options.now ?? new Date();
  const sensoryInputs: SensoryInput[] = [];
  let noiseFiltered = 0;
  let privacyFiltered = 0;

  for (const input of inputs) {
    if (isNoiseInput(input, options.noiseThreshold)) {
      noiseFiltered += 1;
      continue;
    }
    const normalized = normalizeSensoryInput(input);
    if (normalized.sensitivity === "secret" || normalized.promptPolicy === "do_not_prompt") {
      privacyFiltered += 1;
    }
    sensoryInputs.push(normalized);
  }

  const observations = sensoryInputs.map((input) => sensoryInputToObservation(input, now));
  const confidence = observations.length === 0
    ? 0
    : round(observations.reduce((sum, observation) => sum + observation.confidence, 0) / observations.length);
  const explanation = [
    `accepted sensory inputs=${sensoryInputs.length}`,
    `noise filtered=${noiseFiltered}`,
    `privacy filtered=${privacyFiltered}`,
    "internal model receives only Markov Blanket observations, not raw external world state"
  ];

  return {
    id: randomUUID(),
    projectId: options.projectId,
    createdAt: now.toISOString(),
    sensoryInputs,
    observations,
    internalStateRefs: options.internalStateRefs ?? [],
    externalStateRefs: options.externalStateRefs ?? sensoryInputs.flatMap((input) => input.sourceRefs),
    noiseFiltered,
    privacyFiltered,
    confidence,
    explanation
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
