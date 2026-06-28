import { buildContextPack } from "@atlas/kernel";
import { createMemory, readAmfDocument, searchMemory } from "@atlas/memory";
import type { MemorySensitivity } from "@atlas/types";

export const LMTI_MCP_TOOL_NAMES = [
  "lmti_get_project_context",
  "lmti_get_related_files",
  "lmti_get_memory",
  "lmti_record_task_result"
] as const;

export type LmtiMcpToolName = (typeof LMTI_MCP_TOOL_NAMES)[number];

export interface LmtiMcpServerOptions {
  cwd?: string;
}

export interface ProjectContextInput {
  task: string;
}

export interface RelatedFilesInput {
  task: string;
}

export interface MemoryInput {
  query: string;
}

export interface TaskResultInput {
  task: string;
  summary: string;
  sensitivity?: MemorySensitivity;
}

export function createLmtiMcpStub(options: LmtiMcpServerOptions = {}) {
  const cwd = options.cwd ?? process.cwd();

  return {
    tools: LMTI_MCP_TOOL_NAMES,
    async lmti_get_project_context(input: ProjectContextInput) {
      const amf = await readAmfDocument(undefined, cwd);
      const memories = await searchMemory(input.task, { cwd, limit: 16 });
      return buildContextPack(amf, input.task, { memories });
    },
    async lmti_get_related_files(input: RelatedFilesInput) {
      const amf = await readAmfDocument(undefined, cwd);
      const context = buildContextPack(amf, input.task);
      return context.relatedFiles;
    },
    async lmti_get_memory(input: MemoryInput) {
      return searchMemory(input.query, { cwd, limit: 16 });
    },
    async lmti_record_task_result(input: TaskResultInput) {
      return createMemory(
        {
          scope: "long_term",
          kind: "experience",
          title: `Task result: ${input.task.slice(0, 80)}`,
          content: input.summary,
          projectId: "local",
          sourceRefs: [],
          tags: ["task-result"],
          importance: 0.6,
          confidence: "medium",
          sensitivity: input.sensitivity ?? "internal"
        },
        { cwd }
      );
    }
  };
}
