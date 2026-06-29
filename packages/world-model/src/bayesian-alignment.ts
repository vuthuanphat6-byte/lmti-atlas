import type { BayesianAlignmentResult, BeliefState, WorldObservation } from "./types";

const EPSILON = 0.000001;

export function updateBeliefBayesian(prior: number, likelihood: number, evidenceProbability: number): number {
  return clamp01((clamp01(likelihood) * clamp01(prior)) / Math.max(EPSILON, clamp01(evidenceProbability)));
}

export function alignBeliefsWithObservations(
  beliefs: BeliefState[],
  observations: WorldObservation[],
  now = new Date()
): BayesianAlignmentResult {
  const updatedBeliefs: BeliefState[] = [];
  const contradictedBeliefs: BeliefState[] = [];
  const confirmedBeliefs: BeliefState[] = [];
  const explanation: string[] = [];
  let predictionError = 0;

  for (const belief of beliefs) {
    const supporting = observations.filter((observation) => supportsBelief(observation, belief));
    const contradicting = observations.filter((observation) => contradictsBelief(observation, belief));
    const evidenceWeight = evidenceProbabilityFor([...supporting, ...contradicting]);
    const likelihood = supporting.length > 0
      ? clamp01(belief.likelihood + sourceWeightedConfidence(supporting) * 0.35)
      : contradicting.length > 0
        ? clamp01(belief.likelihood - sourceWeightedConfidence(contradicting) * 0.45)
        : belief.likelihood * 0.9;
    const posterior = updateBeliefBayesian(belief.prior, likelihood, Math.max(0.2, evidenceWeight || 0.5));
    const updated = {
      ...belief,
      likelihood: round(likelihood),
      posterior: round(posterior),
      evidenceRefs: Array.from(new Set([...belief.evidenceRefs, ...supporting.flatMap((item) => item.evidenceRefs), ...contradicting.flatMap((item) => item.evidenceRefs)])),
      confidence: round(clamp01((belief.confidence + posterior) / 2)),
      updatedAt: now.toISOString()
    };

    updatedBeliefs.push(updated);
    if (contradicting.length > 0 || posterior < belief.posterior - 0.15) {
      contradictedBeliefs.push(updated);
      predictionError += contradicting.length * 0.35 + Math.max(0, belief.posterior - posterior);
      explanation.push(`belief ${belief.id} contradicted by ${contradicting.map((item) => item.id).join(", ")}`);
    } else if (supporting.length > 0 && posterior >= belief.posterior) {
      confirmedBeliefs.push(updated);
      explanation.push(`belief ${belief.id} confirmed by observation evidence`);
    } else {
      predictionError += 0.08;
      explanation.push(`belief ${belief.id} lacks fresh evidence`);
    }
  }

  const uncertainty = round(clamp01((updatedBeliefs.filter((belief) => belief.confidence < 0.55).length + contradictedBeliefs.length) / Math.max(1, updatedBeliefs.length * 2)));

  return {
    updatedBeliefs,
    contradictedBeliefs,
    confirmedBeliefs,
    uncertainty,
    predictionError: round(predictionError),
    explanation
  };
}

function supportsBelief(observation: WorldObservation, belief: BeliefState): boolean {
  return observation.supports.includes(belief.id) || textOverlap(observation.statement, belief.statement) >= 2;
}

function contradictsBelief(observation: WorldObservation, belief: BeliefState): boolean {
  return observation.contradicts.includes(belief.id) || (
    textOverlap(observation.statement, belief.statement) >= 1
    && /\b(now|instead|no longer|contradicts|fails|not|different)\b/i.test(observation.statement)
  );
}

function sourceWeightedConfidence(observations: WorldObservation[]): number {
  if (observations.length === 0) {
    return 0;
  }
  const weighted = observations.map((observation) => observation.confidence * sourceWeight(observation.source));
  return clamp01(weighted.reduce((sum, value) => sum + value, 0) / observations.length);
}

function sourceWeight(source: WorldObservation["source"]): number {
  if (source === "test") {
    return 1;
  }
  if (source === "file" || source === "tool" || source === "cli") {
    return 0.9;
  }
  if (source === "user") {
    return 0.8;
  }
  if (source === "memory") {
    return 0.45;
  }
  return 0.6;
}

function evidenceProbabilityFor(observations: WorldObservation[]): number {
  if (observations.length === 0) {
    return 0.5;
  }
  return clamp01(observations.reduce((sum, observation) => sum + observation.confidence * sourceWeight(observation.source), 0) / observations.length);
}

function textOverlap(left: string, right: string): number {
  const leftTerms = new Set(tokenize(left));
  return tokenize(right).filter((term) => leftTerms.has(term)).length;
}

function tokenize(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/i)
    .filter((part) => part.length >= 3);
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
