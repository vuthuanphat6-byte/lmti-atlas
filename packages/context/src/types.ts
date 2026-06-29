import type { MemorySearchResult } from "@atlas/memory";
import type { SecurityPolicy } from "@atlas/security";

export interface ProjectContext {
  projectId: string;
  name: string;
  root?: string;
  description?: string;
}

export interface UserContext {
  userId?: string;
  currentGoal?: string;
  message?: string;
}

export interface AppContext {
  project: ProjectContext;
  user: UserContext;
  activeAgentId: string;
  relatedMemory: MemorySearchResult[];
  securityPolicy: SecurityPolicy;
  loadedAt: string;
}

export interface ContextLoaderInput {
  project: ProjectContext;
  user: UserContext;
  activeAgentId: string;
  securityPolicy: SecurityPolicy;
  memorySearch?: (query: string) => Promise<MemorySearchResult[]>;
}

export interface ContextLoader {
  load(input: ContextLoaderInput): Promise<AppContext>;
}
