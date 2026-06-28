import type { AgentDefinition, AgentResponse, AgentRuntimeContext } from "./types";

export type { AgentDefinition, AgentInstruction, AgentResponse, AgentRole, AgentRuntimeContext } from "./types";

export const DeveloperAgent: AgentDefinition = {
  id: "developer",
  name: "Developer Agent",
  role: "developer",
  instructions: {
    objective: "Analyze code, explain technical behavior and suggest safe implementation steps.",
    boundaries: ["Do not execute tools directly.", "Do not assume memory without searching when needed."]
  },
  async respond(message, context) {
    const memoryResult = await context.executeTool("memory.search", { query: message, limit: 3 });
    const relatedCount = Array.isArray(memoryResult.data) ? memoryResult.data.length : 0;
    const memorySnippet = formatMemorySnippet(memoryResult.data);
    return response(this, [
      `Developer analysis ready for: ${message}`,
      relatedCount > 0 ? `Found ${relatedCount} related long-term memory item(s).` : "No related long-term memory was found.",
      memorySnippet ? `Most relevant memory: ${memorySnippet}` : "",
      "Recommended next step: inspect the relevant module, make a focused change, then run tests."
    ].filter(Boolean), [memoryResult]);
  }
};

export const BusinessAgent: AgentDefinition = {
  id: "business",
  name: "Business Agent",
  role: "business",
  instructions: {
    objective: "Analyze business requirements, split modules and shape roadmap decisions.",
    boundaries: ["Do not invent customer facts.", "Persist durable business facts only when the user asks to remember them."]
  },
  async respond(message, context) {
    const memoryResult = await context.executeTool("memory.search", { query: message, limit: 3 });
    const memorySnippet = formatMemorySnippet(memoryResult.data);
    return response(this, [
      `Business analysis ready for: ${message}`,
      "I would clarify the actor, workflow, acceptance rule and module boundary before implementation.",
      Array.isArray(memoryResult.data) && memoryResult.data.length > 0
        ? `Relevant remembered context: ${memoryResult.data.length} item(s). ${memorySnippet ? `Top item: ${memorySnippet}` : ""}`
        : "No confirmed business memory matched this request."
    ], [memoryResult]);
  }
};

export const SecurityAgent: AgentDefinition = {
  id: "security",
  name: "Security Agent",
  role: "security",
  instructions: {
    objective: "Review risk, access control, data exposure and dangerous actions.",
    boundaries: ["Apply least privilege.", "Treat tool execution as untrusted until SecurityGuard allows it."]
  },
  async respond(message, context) {
    const risky = hasRiskSignal(message);
    const auditResult = await context.executeTool("audit.logs", { limit: 5 });
    return response(this, [
      risky
        ? "[SECURITY] This request contains elevated-risk wording. Verify permissions and data exposure before execution."
        : "Security review: no obvious high-risk wording detected.",
      "Use read/execute by default; require explicit policy for filesystem, database, network or admin actions.",
      Array.isArray(auditResult.data) ? `Recent audit entries available: ${auditResult.data.length}.` : "Audit log unavailable."
    ], [auditResult]);
  }
};

export const DEFAULT_AGENTS = [DeveloperAgent, BusinessAgent, SecurityAgent];

function response(agent: AgentDefinition, lines: string[], toolResults: AgentResponse["toolResults"] = []): AgentResponse {
  return {
    agentId: agent.id,
    role: agent.role,
    message: lines.join("\n"),
    toolResults
  };
}

function hasRiskSignal(message: string): boolean {
  return /\b(admin|filesystem|database|network|secret|token|password|delete|remove|exec|shell)\b/i.test(message);
}

function formatMemorySnippet(data: unknown): string | undefined {
  if (!Array.isArray(data) || data.length === 0) {
    return undefined;
  }

  const first = data[0] as { record?: { title?: unknown; content?: unknown } };
  const title = typeof first.record?.title === "string" ? first.record.title : "";
  const content = typeof first.record?.content === "string" ? first.record.content : "";
  const snippet = [title, content].filter(Boolean).join(" - ");
  return snippet || undefined;
}
