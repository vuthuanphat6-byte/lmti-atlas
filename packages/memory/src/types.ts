import type {
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemorySearchResult,
  MemorySensitivity
} from "@atlas/types";

export type { MemoryRecord, MemorySearchResult };

export interface MemoryAddInput {
  id?: string;
  kind?: MemoryKind;
  title: string;
  content: string;
  projectId?: string;
  source?: string;
  sourceRefs?: string[];
  tags?: string[];
  importance?: number;
  confidence?: "low" | "medium" | "high";
  sensitivity?: MemorySensitivity;
  createdAt?: string;
  expiresAt?: string;
}

export interface MemorySearchQuery {
  scope?: MemoryScope;
  tags?: string[];
  limit?: number;
}

export interface MemoryStore {
  add(record: MemoryRecord): Promise<MemoryRecord>;
  get(id: string): Promise<MemoryRecord | undefined>;
  list(scope?: MemoryScope): Promise<MemoryRecord[]>;
  search(query: string, options?: MemorySearchQuery): Promise<MemorySearchResult[]>;
  clear(scope?: MemoryScope): Promise<void>;
}
