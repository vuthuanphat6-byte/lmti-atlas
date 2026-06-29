import type { InformationDensityInput } from "./types";

export function estimateInformationDensity(input: InformationDensityInput): number {
  const text = [
    input.text ?? "",
    ...(input.inputs ?? []).map((item) => `${item.content} ${(item.summary ?? "")}`),
    ...(input.observations ?? []).map((item) => item.statement)
  ].join(" ");
  const tokenEstimate = estimateTokens(text);
  const uniqueEntityCount = countUniqueEntities(text);
  const sourceRefCount = new Set([
    ...(input.sourceRefs ?? []),
    ...(input.inputs ?? []).flatMap((item) => item.sourceRefs),
    ...(input.observations ?? []).flatMap((item) => item.evidenceRefs)
  ]).size;
  const dependencyCount = input.dependencyCount ?? countMatches(text, /\b(import|require|depends|dependency|module)\b/gi);
  const riskSignalCount = input.riskSignalCount ?? countMatches(text, /\b(secret|token|password|risk|unsafe|403|error|fail|production)\b/gi);
  const contradictionCount = input.contradictionCount ?? (input.observations ?? []).reduce((sum, observation) => sum + observation.contradicts.length, 0);
  const uncertaintyCount = input.uncertaintyCount ?? countMatches(text, /\b(maybe|unknown|uncertain|assume|assumption|todo|missing)\b/gi);

  return round(
    tokenEstimate * 0.08
      + uniqueEntityCount * 0.9
      + sourceRefCount * 1.4
      + dependencyCount * 1.2
      + riskSignalCount * 1.6
      + contradictionCount * 2.2
      + uncertaintyCount * 1.3
  );
}

export function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  return Math.ceil(normalized.split(/\s+/).length * 1.25);
}

function countUniqueEntities(text: string): number {
  const entities = new Set<string>();
  for (const match of text.matchAll(/\b[A-Z][A-Za-z0-9_]{2,}\b|\/[a-z0-9_/-]+|[a-z0-9_-]+\.(?:ts|tsx|js|json|md|sql)\b/gi)) {
    entities.add(match[0].toLowerCase());
  }
  return entities.size;
}

function countMatches(text: string, regex: RegExp): number {
  return Array.from(text.matchAll(regex)).length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
