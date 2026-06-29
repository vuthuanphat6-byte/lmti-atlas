import type { MemoryAssociation, MemoryRecord } from "@atlas/types";
import { clamp01, round } from "./encode";

export interface AssociationUpdateInput {
  targetMemoryId: string;
  activationA?: number;
  activationB?: number;
  reason: string;
  createdAt?: string;
  learningRate?: number;
}

export function upsertMemoryAssociation(record: MemoryRecord, input: AssociationUpdateInput): MemoryRecord {
  if (input.targetMemoryId === record.id) {
    return record;
  }

  const associations = [...(record.associations ?? [])];
  const existingIndex = associations.findIndex((association) => association.targetMemoryId === input.targetMemoryId);
  const delta = (input.learningRate ?? 0.08) * (input.activationA ?? 1) * (input.activationB ?? 1);

  if (existingIndex >= 0) {
    const existing = associations[existingIndex];
    associations[existingIndex] = {
      ...existing,
      weight: round(clamp01(existing.weight + delta)),
      reason: existing.reason.includes(input.reason) ? existing.reason : `${existing.reason}; ${input.reason}`
    };
  } else {
    associations.push({
      targetMemoryId: input.targetMemoryId,
      weight: round(clamp01(delta)),
      reason: input.reason,
      createdAt: input.createdAt ?? new Date().toISOString()
    });
  }

  return {
    ...record,
    associations: associations
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 24)
  };
}

export function weakenMemoryAssociations(record: MemoryRecord, factor = 0.85): MemoryRecord {
  return {
    ...record,
    associations: (record.associations ?? [])
      .map((association) => ({
        ...association,
        weight: round(clamp01(association.weight * factor))
      }))
      .filter((association) => association.weight > 0.02)
  };
}

export function reinforceAssociationSet(records: MemoryRecord[], memoryIds: string[], reason: string, createdAt: string): MemoryRecord[] {
  if (memoryIds.length < 2) {
    return records;
  }

  const active = new Set(memoryIds);
  return records.map((record) => {
    if (!active.has(record.id)) {
      return record;
    }

    let updated = record;
    for (const targetMemoryId of memoryIds) {
      if (targetMemoryId === record.id) {
        continue;
      }
      updated = upsertMemoryAssociation(updated, {
        targetMemoryId,
        activationA: record.baseActivation ?? 1,
        activationB: 1,
        reason,
        createdAt,
        learningRate: 0.05
      });
    }
    return updated;
  });
}

export function summarizeAssociations(record: MemoryRecord): MemoryAssociation[] {
  return [...(record.associations ?? [])].sort((left, right) => right.weight - left.weight);
}
