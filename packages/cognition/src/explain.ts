import type { CognitiveExplanation, CognitiveState } from "./types";

export function explainCognitiveState(state: CognitiveState): CognitiveExplanation {
  const selectedFocus = state.workspace.winner?.entry.summary ?? state.currentGoal.title;
  const memoryInfluence = [
    ...state.workingMemoryIds.map((id) => `working memory influenced focus: ${id}`),
    ...state.longTermMemoryIds.map((id) => `long-term memory influenced focus: ${id}`)
  ];
  const fileModuleInfluence = state.workspace.entries
    .filter((entry) => entry.kind === "file" || entry.kind === "module")
    .slice(0, 8)
    .map((entry) => `${entry.kind}: ${entry.summary}`);
  const missingEvidence = state.predictionState.nextBestObservation ? [state.predictionState.nextBestObservation] : [];
  const highRisks = state.workspace.entries
    .filter((entry) => entry.kind === "risk" && entry.priority >= 0.6)
    .slice(0, 6)
    .map((entry) => entry.summary);
  const fragmentation = state.integratedInformation.fragmentationRisk > 0.5
    ? ["Context is fragmented; gather more focused evidence."]
    : ["Context integration is acceptable for the current focus."];
  const privacy = [
    state.privacySummary.privacyDecision,
    ...state.privacySummary.notes
  ];
  const recommendedActions = Array.from(new Set([
    ...(state.predictionState.nextBestObservation ? [`Inspect: ${state.predictionState.nextBestObservation}`] : []),
    ...(state.explanation?.recommendedActions ?? [])
  ]));

  return {
    selectedFocus,
    focusReasons: state.workspace.winner?.reason ?? ["no focus winner available"],
    memoryInfluence,
    fileModuleInfluence,
    missingEvidence,
    highRisks,
    fragmentation,
    privacy,
    recommendedActions
  };
}
