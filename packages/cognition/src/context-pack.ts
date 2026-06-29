import type { ContextMemory, ContextPack, MemorySearchResult, MemorySensitivity } from "@atlas/types";
import type { CognitiveContextItem } from "./types";

export function contextPackToCognitiveItems(context: ContextPack): CognitiveContextItem[] {
  return [
    ...contextMemoriesToCognitiveItems([...context.relatedShortTermMemories, ...context.relatedLongTermMemories]),
    ...context.relatedFiles.map((file): CognitiveContextItem => ({
      id: `file:${file.path}`,
      source: "context_pack",
      kind: "file",
      content: file.summary,
      summary: file.summary,
      priority: clamp01(file.score / 10),
      activation: clamp01(file.score / 10),
      confidence: 0.7,
      contextCues: [file.module, file.kind, ...file.riskFlags],
      sourceRefs: [file.path],
      sensitivity: privacyToSensitivity(file.privacy),
      promptPolicy: "summarize_only",
      privacyDecision: file.privacy === "protected" ? "summary: protected file context" : "summary: file context"
    })),
    ...context.relatedModules.map((module): CognitiveContextItem => ({
      id: `module:${module.path}`,
      source: "context_pack",
      kind: "module",
      content: module.summary,
      summary: module.summary,
      priority: clamp01(module.score / 10),
      activation: clamp01(module.score / 10),
      confidence: 0.7,
      contextCues: [module.name, module.path, ...module.dependencies],
      sourceRefs: [module.path],
      sensitivity: "internal",
      promptPolicy: "summarize_only",
      privacyDecision: "summary: module context"
    })),
    ...context.risks.map((risk): CognitiveContextItem => ({
      id: `risk:${risk.id}`,
      source: "context_pack",
      kind: "risk",
      content: risk.message,
      summary: risk.message,
      priority: risk.severity === "high" ? 1 : risk.severity === "medium" ? 0.7 : 0.4,
      activation: clamp01(risk.score / 10),
      confidence: risk.severity === "high" ? 0.85 : risk.severity === "medium" ? 0.65 : 0.45,
      contextCues: [risk.type, risk.severity, risk.file ?? ""].filter(Boolean),
      sourceRefs: [risk.file ?? risk.id],
      sensitivity: privacyToSensitivity(risk.privacy),
      promptPolicy: "summarize_only",
      privacyDecision: risk.privacy === "protected" ? "summary: protected risk evidence withheld" : "summary: risk context"
    }))
  ];
}

export function memorySearchResultsToCognitiveItems(results: MemorySearchResult[]): CognitiveContextItem[] {
  return contextMemoriesToCognitiveItems(results.map((result) => memoryResultToContextMemory(result)));
}

function contextMemoriesToCognitiveItems(memories: ContextMemory[]): CognitiveContextItem[] {
  return memories.map((memory): CognitiveContextItem => ({
    id: `memory:${memory.id}`,
    source: memory.scope === "short_term" ? "working_memory" : "long_term_memory",
    kind: "memory",
    content: memory.content ?? memory.summary ?? memory.title,
    summary: memory.summary ?? memory.title,
    priority: memory.importance,
    activation: memory.activation ?? memory.score / 10,
    confidence: confidenceWeight(memory.confidence),
    contextCues: [...memory.tags, memory.kind],
    sourceRefs: [`${memory.scope}:${memory.id}`],
    sensitivity: memory.sensitivity,
    promptPolicy: memory.promptPolicy ?? "summarize_only",
    privacyDecision: memory.mode === "raw" ? "raw: context selected memory" : `${memory.mode ?? "summary"}: context selected memory`
  }));
}

function memoryResultToContextMemory(result: MemorySearchResult): ContextMemory {
  const { record, score } = result;
  const sensitivity = record.sensitivity;
  const safeSummary = record.privacySafeSummary ?? (sensitivity === "secret" ? "Secret memory withheld." : record.title);

  return {
    id: record.id,
    scope: record.scope,
    kind: record.kind,
    title: record.title,
    tags: record.tags,
    importance: record.importance,
    confidence: record.confidence,
    sensitivity,
    promptPolicy: result.promptPolicy ?? record.promptPolicy,
    mode: contextMode(result.mode) ?? (sensitivity === "secret" ? "summary" : "raw"),
    score,
    activation: result.activation,
    summary: sensitivity === "secret" || sensitivity === "confidential" ? safeSummary : record.privacySafeSummary ?? record.title,
    content: sensitivity === "secret" ? undefined : record.content
  };
}

function contextMode(mode: MemorySearchResult["mode"]): ContextMemory["mode"] {
  return mode === "excluded" ? undefined : mode;
}

function confidenceWeight(confidence: "low" | "medium" | "high"): number {
  if (confidence === "high") {
    return 0.9;
  }
  if (confidence === "low") {
    return 0.35;
  }
  return 0.6;
}

function privacyToSensitivity(privacy: "public" | "internal" | "protected"): MemorySensitivity {
  return privacy === "protected" ? "confidential" : privacy;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
