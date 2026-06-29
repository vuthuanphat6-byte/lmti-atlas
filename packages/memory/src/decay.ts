import type { MemoryRecord } from "@atlas/types";
import { clamp01, durableMemoryKind, round } from "./encode";

export interface DecayRecordResult {
  record: MemoryRecord;
  retention: number;
  changed: boolean;
}

export function computeRetention(memoryStrength: number, elapsedDays: number): number {
  return Math.exp(-Math.max(0, elapsedDays) / Math.max(1, memoryStrength));
}

export function decayLongTermMemoryRecord(record: MemoryRecord, now: Date): DecayRecordResult {
  if (record.scope !== "long_term" || record.status === "archived" || record.status === "superseded") {
    return { record, retention: 1, changed: false };
  }

  const reference = new Date(record.lastReinforcedAt ?? record.lastRetrievedAt ?? record.updatedAt ?? record.createdAt).getTime();
  if (!Number.isFinite(reference)) {
    return { record, retention: 1, changed: false };
  }

  const elapsedDays = Math.max(0, (now.getTime() - reference) / 86_400_000);
  if (elapsedDays < 1) {
    return { record, retention: 1, changed: false };
  }

  const durable = durableMemoryKind(record.kind);
  const strength = Math.max(1, record.memoryStrength ?? (durable ? 90 : 35));
  const adjustedStrength = durable ? strength * 2.5 : strength;
  const retention = computeRetention(adjustedStrength, elapsedDays * (record.decayRate ?? 0.08) * 12);
  const oldActivation = record.baseActivation ?? 0;
  const priorityFloor = (record.priorityScore ?? 0) * (durable ? 1.2 : 0.45);
  const baseActivation = round(Math.max(priorityFloor, oldActivation * retention));
  const stability = round(Math.max(durable ? 0.45 : 0.05, (record.stability ?? 0.4) * (0.92 + retention * 0.08)));
  let status: MemoryRecord["status"] = record.status ?? "active";

  if (!durable && retention < 0.42) {
    status = "weak";
  }
  if (!durable && retention < 0.18 && record.confidence === "low") {
    status = "archived";
  }

  const changed = baseActivation !== oldActivation || stability !== record.stability || status !== (record.status ?? "active");
  if (!changed) {
    return { record, retention: round(retention), changed: false };
  }

  return {
    record: {
      ...record,
      baseActivation,
      stability: clamp01(stability),
      status,
      updatedAt: now.toISOString()
    },
    retention: round(retention),
    changed: true
  };
}
