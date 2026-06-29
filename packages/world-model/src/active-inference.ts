import type { ActiveInferenceAction, ActiveInferenceInput, ComputeCostEstimate } from "./types";

export function proposeActiveInferenceActions(input: ActiveInferenceInput): ActiveInferenceAction[] {
  const actions: ActiveInferenceAction[] = [];

  if (input.cost.overBudget) {
    actions.push(createAction("defer_to_ltm", "Defer dense context to long-term memory", "Compute budget is exceeded; avoid overloading working memory.", 0.35, input.cost, false, "low"));
    actions.push(createAction("build_context", "Summarize context before deep reasoning", "High information density should be summarized before cognition.", 0.45, input.cost, false, "low"));
  }

  if (input.alignment.predictionError > 0.25 || input.alignment.uncertainty > 0.35) {
    actions.push(createAction("inspect_memory", "Inspect belief and memory evidence", "Beliefs are uncertain or contradicted; inspect memory metadata and evidence refs.", 0.5, input.cost, false, "low"));
  }

  const missingFileEvidence = input.blanket.observations.some((observation) =>
    observation.evidenceRefs.some((ref) => /\.(?:ts|tsx|js|json|md|sql)$/i.test(ref))
  );
  if (missingFileEvidence || input.alignment.contradictedBeliefs.length > 0) {
    actions.push(createAction("read_file", "Inspect source evidence refs", "Observation or contradiction points at source evidence that should be checked through the runtime/tool layer.", 0.65, input.cost, false, "low"));
  }

  const testRefs = input.blanket.observations.some((observation) => observation.source === "test" || observation.evidenceRefs.some((ref) => /test|spec/i.test(ref)));
  if (testRefs || input.alignment.predictionError > 0.6) {
    actions.push(createAction("run_test", "Run focused verification test", "Prediction error is high enough that a focused test may reduce uncertainty.", 0.7, input.cost, true, "medium", "test execution approval"));
  }

  if (input.blanket.privacyFiltered > 0) {
    actions.push(createAction("build_context", "Use privacy-safe observation summaries", "Some sensory input was withheld; continue with metadata and summaries only.", 0.3, input.cost, false, "low"));
  }

  if (actions.length === 0) {
    actions.push(createAction("do_nothing", "No additional world action needed", "Observations align with current beliefs and compute cost is acceptable.", 0.05, input.cost, false, "low"));
  }

  return actions
    .map((action) => ({ action, score: scoreAction(action) }))
    .sort((left, right) => right.score - left.score)
    .map(({ action }) => action);
}

function createAction(
  kind: ActiveInferenceAction["kind"],
  title: string,
  rationale: string,
  expectedPredictionErrorReduction: number,
  estimatedCost: ComputeCostEstimate,
  requiresPermission: boolean,
  riskLevel: ActiveInferenceAction["riskLevel"],
  permissionRequired?: string
): ActiveInferenceAction {
  return {
    id: `action:${kind}:${stableToken(title)}`,
    kind,
    title,
    rationale,
    expectedPredictionErrorReduction,
    estimatedCost,
    requiresPermission,
    permissionRequired,
    riskLevel
  };
}

function scoreAction(action: ActiveInferenceAction): number {
  const riskPenalty = action.riskLevel === "high" ? 0.6 : action.riskLevel === "medium" ? 0.25 : 0.05;
  const evidenceGain = action.kind === "read_file" || action.kind === "run_test" ? 0.35 : action.kind === "inspect_memory" ? 0.25 : 0.1;
  const safetyBoost = action.requiresPermission ? 0.05 : 0.15;
  return action.expectedPredictionErrorReduction - action.estimatedCost.computeCost / 100 - riskPenalty + evidenceGain + safetyBoost;
}

function stableToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}
