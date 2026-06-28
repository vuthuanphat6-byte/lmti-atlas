import type { LongTermMemory, ShortTermMemory } from "@atlas/memory";
import type { PermissionLevel, SecurityGuard } from "@atlas/security";

export type ToolInput = Record<string, unknown>;

export interface ToolOutput<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
}

export interface ToolExecutionContext {
  securityGuard: SecurityGuard;
  shortTermMemory?: ShortTermMemory;
  longTermMemory?: LongTermMemory;
}

export interface ToolDefinition<TInput extends ToolInput = ToolInput, TData = unknown> {
  name: string;
  description: string;
  permissionRequired: PermissionLevel | PermissionLevel[];
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolOutput<TData>>;
}
