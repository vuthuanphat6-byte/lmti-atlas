import type { ComputeCostEstimate, InformationDensityInput, ResourceBudget } from "./types";
import { estimateInformationDensity, estimateTokens } from "./information-density";

export function estimateComputeCost(input: InformationDensityInput, budget: ResourceBudget = {}): ComputeCostEstimate {
  const text = [
    input.text ?? "",
    ...(input.inputs ?? []).map((item) => item.content),
    ...(input.observations ?? []).map((item) => item.statement)
  ].join(" ");
  const informationDensity = estimateInformationDensity(input);
  const estimatedTokens = estimateTokens(text);
  const refs = new Set([
    ...(input.sourceRefs ?? []),
    ...(input.inputs ?? []).flatMap((item) => item.sourceRefs),
    ...(input.observations ?? []).flatMap((item) => item.evidenceRefs)
  ]);
  const estimatedFiles = Array.from(refs).filter((ref) => /\.(?:ts|tsx|js|json|md|sql|css|html)\b/i.test(ref)).length;
  const estimatedMemoryItems = Array.from(refs).filter((ref) => ref.startsWith("memory:") || ref.includes("memory")).length;
  const estimatedToolCalls = (input.inputs ?? []).filter((item) => item.source === "tool" || item.source === "cli" || item.source === "test").length;
  const processingSpeedFactor = informationDensity > 60 ? 1.35 : informationDensity > 30 ? 1.15 : 1;
  const estimatedLatencyMs = Math.ceil(informationDensity * 18 * processingSpeedFactor + estimatedToolCalls * 250);
  const computeCost = round(informationDensity * Math.pow(processingSpeedFactor, 2));
  const reasons: string[] = [];

  if (budget.maxTokens !== undefined && estimatedTokens > budget.maxTokens) {
    reasons.push("estimated tokens exceed budget");
  }
  if (budget.maxFiles !== undefined && estimatedFiles > budget.maxFiles) {
    reasons.push("estimated files exceed budget");
  }
  if (budget.maxMemoryItems !== undefined && estimatedMemoryItems > budget.maxMemoryItems) {
    reasons.push("estimated memory items exceed budget");
  }
  if (budget.maxLatencyMs !== undefined && estimatedLatencyMs > budget.maxLatencyMs) {
    reasons.push("estimated latency exceeds budget");
  }
  if (budget.maxToolCalls !== undefined && estimatedToolCalls > budget.maxToolCalls) {
    reasons.push("estimated tool calls exceed budget");
  }
  if (budget.maxComputeCost !== undefined && computeCost > budget.maxComputeCost) {
    reasons.push("estimated compute cost exceeds budget");
  }
  if (informationDensity > 55) {
    reasons.push("high information density");
  }

  const overBudget = reasons.length > 0;
  return {
    informationDensity,
    estimatedTokens,
    estimatedFiles,
    estimatedMemoryItems,
    estimatedToolCalls,
    estimatedLatencyMs,
    computeCost,
    overBudget,
    reasons,
    recommendedMode: chooseMode(overBudget, reasons, informationDensity, estimatedMemoryItems)
  };
}

function chooseMode(
  overBudget: boolean,
  reasons: string[],
  informationDensity: number,
  estimatedMemoryItems: number
): ComputeCostEstimate["recommendedMode"] {
  if (!overBudget && informationDensity <= 45) {
    return "process_now";
  }
  if (reasons.some((reason) => reason.includes("memory items")) || estimatedMemoryItems > 8) {
    return "defer_to_ltm";
  }
  if (reasons.some((reason) => reason.includes("tokens")) || informationDensity > 55) {
    return "summarize_first";
  }
  if (reasons.some((reason) => reason.includes("latency"))) {
    return "background_review";
  }
  return "ask_for_focus";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
