import type { MemoryConfidence, MemoryRecord } from "@atlas/types";
import { clamp01, round } from "./encode";
import { weakenMemoryAssociations } from "./associations";

export interface ReinforceMemoryOptions {
  success: boolean;
  now?: Date;
  intensity?: number;
}

export function reinforceMemoryRecord(record: MemoryRecord, options: ReinforceMemoryOptions): MemoryRecord {
  const now = options.now ?? new Date();
  const intensity = Math.max(0.2, Math.min(3, options.intensity ?? 1));

  if (options.success) {
    const easinessFactor = Math.max(1.3, record.easinessFactor ?? 2.3);
    const previousInterval = Math.max(1, record.reviewIntervalDays ?? 1);
    const nextInterval = Math.min(365, Math.ceil(previousInterval * easinessFactor));
    return {
      ...record,
      retrievalCount: (record.retrievalCount ?? 0) + 1,
      lastRetrievedAt: now.toISOString(),
      lastReinforcedAt: now.toISOString(),
      baseActivation: round((record.baseActivation ?? 0) + 0.22 * intensity),
      memoryStrength: round((record.memoryStrength ?? 30) * (1 + 0.08 * intensity)),
      stability: clamp01((record.stability ?? 0.4) + 0.05 * intensity),
      confidence: promoteConfidence(record.confidence),
      status: "active",
      reviewCount: (record.reviewCount ?? 0) + 1,
      reviewIntervalDays: nextInterval,
      easinessFactor: round(easinessFactor + 0.05),
      nextReviewAt: new Date(now.getTime() + nextInterval * 86_400_000).toISOString(),
      updatedAt: now.toISOString(),
      version: record.version + 1
    };
  }

  const weakened = weakenMemoryAssociations(record, 0.72);
  const reviewIntervalDays = Math.max(1, Math.floor((record.reviewIntervalDays ?? 2) / 2));
  return {
    ...weakened,
    baseActivation: round(Math.max(0, (record.baseActivation ?? 0) - 0.35 * intensity)),
    memoryStrength: round(Math.max(1, (record.memoryStrength ?? 30) * (1 - 0.08 * intensity))),
    stability: clamp01((record.stability ?? 0.4) - 0.12 * intensity),
    confidence: demoteConfidence(record.confidence),
    status: "weak",
    lastReinforcedAt: now.toISOString(),
    reviewIntervalDays,
    easinessFactor: round(Math.max(1.3, (record.easinessFactor ?? 2.3) - 0.18)),
    nextReviewAt: new Date(now.getTime() + reviewIntervalDays * 86_400_000).toISOString(),
    updatedAt: now.toISOString(),
    version: record.version + 1
  };
}

function promoteConfidence(confidence: MemoryConfidence): MemoryConfidence {
  if (confidence === "low") {
    return "medium";
  }
  return confidence;
}

function demoteConfidence(confidence: MemoryConfidence): MemoryConfidence {
  if (confidence === "high") {
    return "medium";
  }
  if (confidence === "medium") {
    return "low";
  }
  return "low";
}
