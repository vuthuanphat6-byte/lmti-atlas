import type { AppContext, ContextLoader, ContextLoaderInput, ProjectContext, UserContext } from "./types";

export type { AppContext, ContextLoader, ContextLoaderInput, ProjectContext, UserContext } from "./types";

export class DefaultContextLoader implements ContextLoader {
  async load(input: ContextLoaderInput): Promise<AppContext> {
    const query = [input.user.currentGoal, input.user.message].filter(Boolean).join(" ");
    const relatedMemory = input.memorySearch && query ? await input.memorySearch(query) : [];

    return {
      project: input.project,
      user: input.user,
      activeAgentId: input.activeAgentId,
      relatedMemory,
      securityPolicy: input.securityPolicy,
      loadedAt: new Date().toISOString()
    };
  }
}
