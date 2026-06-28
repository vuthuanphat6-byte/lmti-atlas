import type { LongTermMemory, MemoryRecord, ShortTermMemory } from "@atlas/memory";
import type { ToolInput, ToolOutput } from "@atlas/tools";

export type AgentRole = "developer" | "business" | "security";

export interface AgentInstruction {
  objective: string;
  boundaries: string[];
}

export interface AgentRuntimeContext {
  sessionId: string;
  projectId: string;
  shortTermMemory: ShortTermMemory;
  longTermMemory: LongTermMemory;
  executeTool: (toolName: string, input: ToolInput) => Promise<ToolOutput>;
}

export interface AgentResponse {
  agentId: string;
  role: AgentRole;
  message: string;
  toolResults?: ToolOutput[];
  memories?: MemoryRecord[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: AgentRole;
  instructions: AgentInstruction;
  respond(message: string, context: AgentRuntimeContext): Promise<AgentResponse>;
}
