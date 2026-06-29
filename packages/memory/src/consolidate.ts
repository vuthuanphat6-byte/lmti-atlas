import type { MemoryRecord } from "@atlas/types";
import type { EncodedMemory } from "./encode";
import { CONSOLIDATION_THRESHOLD, normalizeMemoryText } from "./encode";

export interface ConsolidationCandidate {
  source: MemoryRecord;
  encoded: EncodedMemory;
  shouldConsolidate: boolean;
  reason: string;
}

export function createConsolidationCandidate(source: MemoryRecord, encoded: EncodedMemory): ConsolidationCandidate {
  if (encoded.sensitivity === "secret" || encoded.promptPolicy === "do_not_prompt") {
    return {
      source,
      encoded,
      shouldConsolidate: false,
      reason: "secret or do_not_prompt memory is not consolidated as raw long-term content"
    };
  }

  if (encoded.priorityScore < CONSOLIDATION_THRESHOLD) {
    return {
      source,
      encoded,
      shouldConsolidate: false,
      reason: `priority ${encoded.priorityScore} below consolidation threshold ${CONSOLIDATION_THRESHOLD}`
    };
  }

  return {
    source,
    encoded,
    shouldConsolidate: true,
    reason: "priority exceeded consolidation threshold"
  };
}

export function findSimilarLongTermMemory(encoded: EncodedMemory, existing: MemoryRecord[]): MemoryRecord | undefined {
  const encodedTitle = normalizeMemoryText(encoded.title);
  const encodedCues = new Set(encoded.contextCues.map(normalizeMemoryText));
  let best: { record: MemoryRecord; overlap: number } | undefined;

  for (const record of existing) {
    if (record.status === "archived" || record.status === "superseded") {
      continue;
    }
    const title = normalizeMemoryText(record.title);
    const titleMatch = title === encodedTitle || title.includes(encodedTitle) || encodedTitle.includes(title);
    const recordCues = new Set([...(record.contextCues ?? []), ...record.tags].map(normalizeMemoryText));
    const overlap = Array.from(encodedCues).filter((cue) => recordCues.has(cue)).length;

    if (titleMatch || overlap >= 3) {
      if (!best || overlap > best.overlap) {
        best = { record, overlap };
      }
    }
  }

  return best?.record;
}

export function detectSupersession(newMemory: MemoryRecord, existing: MemoryRecord[]): MemoryRecord | undefined {
  const normalizedNew = normalizeMemoryText(`${newMemory.title} ${newMemory.content}`);
  const replacementSignal = /\b(now|instead|replace|replaces|replaced|no longer|v2|new route|new path)\b/.test(normalizedNew);
  if (!replacementSignal) {
    return undefined;
  }

  const newCues = new Set([...(newMemory.contextCues ?? []), ...newMemory.tags].map(normalizeMemoryText));
  return existing.find((record) => {
    if (record.id === newMemory.id || record.status === "archived" || record.status === "superseded") {
      return false;
    }
    if (record.kind !== newMemory.kind && record.kind !== "lesson" && newMemory.kind !== "lesson") {
      return false;
    }
    const recordCues = new Set([...(record.contextCues ?? []), ...record.tags].map(normalizeMemoryText));
    const overlap = Array.from(newCues).filter((cue) => recordCues.has(cue)).length;
    return overlap >= 2;
  });
}
