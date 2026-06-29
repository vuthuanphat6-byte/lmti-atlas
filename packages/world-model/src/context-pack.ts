import type { ContextMemory, ContextPack, MemorySensitivity } from "@atlas/types";
import type { BeliefState, SensoryInput } from "./types";

export function contextPackToSensoryInputs(context: ContextPack, now = new Date()): SensoryInput[] {
  const timestamp = now.toISOString();
  return [
    ...contextMemoriesToSensoryInputs([...context.relatedShortTermMemories, ...context.relatedLongTermMemories], timestamp),
    ...context.relatedFiles.map((file): SensoryInput => ({
      id: `file:${file.path}`,
      source: "file",
      content: file.summary,
      summary: file.summary,
      sourceRefs: [file.path],
      timestamp,
      confidence: 0.7,
      sensitivity: privacyToSensitivity(file.privacy),
      promptPolicy: "summarize_only"
    })),
    ...context.risks.map((risk): SensoryInput => ({
      id: `risk:${risk.id}`,
      source: "amf",
      content: risk.message,
      summary: risk.message,
      sourceRefs: [risk.file ?? risk.id],
      timestamp,
      confidence: risk.severity === "high" ? 0.85 : risk.severity === "medium" ? 0.65 : 0.45,
      sensitivity: privacyToSensitivity(risk.privacy),
      promptPolicy: "summarize_only"
    }))
  ];
}

export function contextPackToBeliefs(context: ContextPack, now = new Date()): BeliefState[] {
  const updatedAt = now.toISOString();
  return context.relatedLongTermMemories.map((memory): BeliefState => {
    const confidence = confidenceWeight(memory.confidence);
    return {
      id: `belief:${memory.id}`,
      statement: memory.summary ?? memory.title,
      prior: confidence,
      likelihood: confidence,
      posterior: confidence,
      evidenceRefs: [`memory:${memory.id}`],
      confidence,
      updatedAt
    };
  });
}

function contextMemoriesToSensoryInputs(memories: ContextMemory[], timestamp: string): SensoryInput[] {
  return memories.map((memory): SensoryInput => ({
    id: `memory:${memory.id}`,
    source: "memory",
    content: memory.summary ?? memory.content ?? memory.title,
    summary: memory.summary ?? memory.title,
    sourceRefs: [`memory:${memory.id}`],
    timestamp,
    confidence: confidenceWeight(memory.confidence),
    sensitivity: memory.sensitivity,
    promptPolicy: memory.promptPolicy ?? "summarize_only"
  }));
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
