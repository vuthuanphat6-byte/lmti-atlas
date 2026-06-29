import type { BlackboardEntry, BlackboardQuery } from "./types";

export class CognitiveBlackboard {
  private readonly entries = new Map<string, BlackboardEntry>();

  write(entry: BlackboardEntry): void {
    this.entries.set(entry.id, { ...entry, contextCues: [...entry.contextCues], sourceRefs: [...entry.sourceRefs] });
  }

  read(query: BlackboardQuery = {}): BlackboardEntry[] {
    const now = query.now ?? new Date();
    const cues = new Set((query.cues ?? []).map(normalize));
    return Array.from(this.entries.values())
      .filter((entry) => !entry.expiresAt || new Date(entry.expiresAt).getTime() > now.getTime())
      .filter((entry) => !query.source || entry.source === query.source)
      .filter((entry) => !query.kind || entry.kind === query.kind)
      .filter((entry) => query.minPriority === undefined || entry.priority >= query.minPriority)
      .filter((entry) => cues.size === 0 || entry.contextCues.some((cue) => cues.has(normalize(cue))))
      .map((entry) => ({ ...entry, contextCues: [...entry.contextCues], sourceRefs: [...entry.sourceRefs] }))
      .sort((left, right) => right.priority + right.activation - (left.priority + left.activation));
  }

  clearExpired(now = new Date()): number {
    let removed = 0;
    for (const [id, entry] of this.entries.entries()) {
      if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= now.getTime()) {
        this.entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
