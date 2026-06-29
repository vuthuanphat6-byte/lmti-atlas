import type { PermissionLevel } from "@atlas/security";
import type { ToolDefinition, ToolExecutionContext, ToolInput, ToolOutput } from "./types";

export type { ToolDefinition, ToolExecutionContext, ToolInput, ToolOutput } from "./types";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, input: ToolInput, context: ToolExecutionContext): Promise<ToolOutput> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        error: `Tool not registered: ${name}`
      };
    }

    for (const permission of permissionsFor(tool.permissionRequired)) {
      const decision = context.securityGuard.checkToolExecution({
        action: "tool.execute",
        toolName: tool.name,
        permissionRequired: permission
      });

      if (!decision.allowed) {
        return {
          ok: false,
          error: decision.reason
        };
      }
    }

    try {
      return await tool.execute(input, context);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Tool execution failed."
      };
    }
  }
}

export const echoTool: ToolDefinition<ToolInput, { echo: ToolInput }> = {
  name: "echo",
  description: "Returns the provided input. Useful for runtime smoke tests.",
  permissionRequired: "execute",
  async execute(input) {
    return {
      ok: true,
      data: { echo: input }
    };
  }
};

export const memorySearchTool: ToolDefinition<{ query?: unknown; limit?: unknown }, unknown[]> = {
  name: "memory.search",
  description: "Searches long-term memory.",
  permissionRequired: "read",
  async execute(input, context) {
    if (!context.longTermMemory) {
      return {
        ok: false,
        error: "Long-term memory is not attached."
      };
    }

    const query = typeof input.query === "string" ? input.query : "";
    const limit = typeof input.limit === "number" ? input.limit : 5;
    const results = await context.longTermMemory.search(query, { limit });
    return {
      ok: true,
      data: results
    };
  }
};

export const auditLogTool: ToolDefinition<{ limit?: unknown }, unknown[]> = {
  name: "audit.logs",
  description: "Returns recent security audit log entries.",
  permissionRequired: "read",
  async execute(input, context) {
    const limit = typeof input.limit === "number" ? input.limit : 20;
    return {
      ok: true,
      data: context.securityGuard.getAuditLogs(limit)
    };
  }
};

export const databaseDeleteAllTool: ToolDefinition<ToolInput, { simulated: true }> = {
  name: "database.deleteAll",
  description: "Dangerous no-op tool used to verify database/admin permission enforcement.",
  permissionRequired: ["database", "admin"],
  async execute() {
    return {
      ok: true,
      data: { simulated: true }
    };
  }
};

function permissionsFor(permission: PermissionLevel | PermissionLevel[]): PermissionLevel[] {
  return Array.isArray(permission) ? permission : [permission];
}
