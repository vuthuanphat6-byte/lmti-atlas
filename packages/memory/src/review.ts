import type { MemoryRecord } from "@atlas/types";
import { durableMemoryKind, round } from "./encode";

export interface MemoryReviewItem {
  id: string;
  title: string;
  kind: MemoryRecord["kind"];
  status: MemoryRecord["status"];
  importance: number;
  confidence: MemoryRecord["confidence"];
  reason: string;
  recommendation: "review" | "reinforce" | "archive" | "resolve_conflict";
}

export interface MemoryReviewReport {
  due: MemoryReviewItem[];
  weak: MemoryReviewItem[];
  conflicts: MemoryReviewItem[];
  archiveCandidates: MemoryReviewItem[];
}

export function reviewMemoryRecords(records: MemoryRecord[], now: Date): MemoryReviewReport {
  const due: MemoryReviewItem[] = [];
  const weak: MemoryReviewItem[] = [];
  const conflicts: MemoryReviewItem[] = [];
  const archiveCandidates: MemoryReviewItem[] = [];

  for (const record of records.filter((item) => item.scope === "long_term")) {
    const nextReview = record.nextReviewAt ? new Date(record.nextReviewAt).getTime() : undefined;
    const important = record.importance >= 0.75 || durableMemoryKind(record.kind);

    if (nextReview && nextReview <= now.getTime() && important && record.status !== "archived" && record.status !== "superseded") {
      due.push(createItem(record, "important memory is due for spaced review", "review"));
    }

    if ((record.status === "weak" || (record.baseActivation ?? 0) < 0.35) && important) {
      weak.push(createItem(record, `important memory has low activation ${round(record.baseActivation ?? 0)}`, "reinforce"));
    }

    if (record.status === "superseded" || record.supersededBy) {
      conflicts.push(createItem(record, "memory is superseded and should remain history only", "resolve_conflict"));
    }

    if (!important && record.confidence === "low" && (record.baseActivation ?? 0) < 0.2) {
      archiveCandidates.push(createItem(record, "low confidence memory has low activation", "archive"));
    }
  }

  return { due, weak, conflicts, archiveCandidates };
}

function createItem(record: MemoryRecord, reason: string, recommendation: MemoryReviewItem["recommendation"]): MemoryReviewItem {
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    status: record.status,
    importance: record.importance,
    confidence: record.confidence,
    reason,
    recommendation
  };
}
