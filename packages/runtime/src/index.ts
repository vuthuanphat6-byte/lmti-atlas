import { randomUUID } from "node:crypto";
import { DEFAULT_AGENTS, type AgentDefinition, type AgentResponse } from "@atlas/agents";
import { DefaultContextLoader, type AppContext, type ProjectContext, type UserContext } from "@atlas/context";
import { InMemoryStore, LongTermMemory, ShortTermMemory, type MemoryStore } from "@atlas/memory";
import { DEFAULT_SECURITY_POLICY, SecurityGuard, type SecurityPolicy } from "@atlas/security";
import {
  auditLogTool,
  databaseDeleteAllTool,
  echoTool,
  memorySearchTool,
  ToolRegistry,
  type ToolDefinition,
  type ToolInput,
  type ToolOutput
} from "@atlas/tools";
import type {
  AmfDocument,
  ContextMemory,
  FileEntry,
  MemorySearchResult,
  ModuleEntry,
  RiskEntry,
  RuleEntry,
  SummaryEntry
} from "@atlas/types";

export interface InspectionStats {
  project: string;
  files: number;
  modules: number;
  dependencies: number;
  symbols: number;
  rules: number;
  risks: number;
  lastCompiled: string;
  amfVersion: string;
}

export interface ContextPack {
  task: string;
  generatedAt: string;
  project: string;
  source: {
    amfVersion: string;
    compiledAt: string;
    checksum: string;
  };
  relatedModules: Array<Pick<ModuleEntry, "name" | "path" | "summary" | "dependencies"> & { score: number }>;
  relatedFiles: Array<Pick<FileEntry, "path" | "module" | "kind" | "summary" | "privacy" | "riskFlags"> & { score: number }>;
  knownRules: Array<RuleEntry & { score: number }>;
  risks: Array<RiskEntry & { score: number }>;
  relatedShortTermMemories: ContextMemory[];
  relatedLongTermMemories: ContextMemory[];
  recommendedSteps: string[];
}

export interface ContextPackOptions {
  memories?: MemorySearchResult[];
  includeSecret?: boolean;
}

export interface RuntimeConfig {
  projectId?: string;
  projectName?: string;
  defaultAgentId?: string;
  securityPolicy?: SecurityPolicy;
}

export interface RuntimeEvent {
  id: string;
  type:
    | "session.started"
    | "context.loaded"
    | "message.received"
    | "memory.attached"
    | "memory.created"
    | "security.attached"
    | "agent.registered"
    | "tool.registered"
    | "tool.executed"
    | "agent.response";
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface RuntimeSession {
  id: string;
  projectId: string;
  activeAgentId: string;
  startedAt: string;
  updatedAt: string;
  events: RuntimeEvent[];
  context?: AppContext;
}

export interface RuntimeResult {
  session: RuntimeSession;
  response: AgentResponse;
  context: AppContext;
  events: RuntimeEvent[];
}

export class CoreRuntime {
  private readonly agents = new Map<string, AgentDefinition>();
  private readonly tools = new ToolRegistry();
  private readonly sessions = new Map<string, RuntimeSession>();
  private readonly contextLoader = new DefaultContextLoader();
  private readonly config: Required<Pick<RuntimeConfig, "projectId" | "projectName" | "defaultAgentId">>;
  private shortTermMemory: ShortTermMemory;
  private longTermMemory: LongTermMemory;
  private securityGuard: SecurityGuard;

  constructor(config: RuntimeConfig = {}) {
    const store: MemoryStore = new InMemoryStore();
    this.config = {
      projectId: config.projectId ?? "atlas-playground",
      projectName: config.projectName ?? "ATLAS Playground",
      defaultAgentId: config.defaultAgentId ?? "developer"
    };
    this.shortTermMemory = new ShortTermMemory(store, { projectId: this.config.projectId });
    this.longTermMemory = new LongTermMemory(store, { projectId: this.config.projectId });
    this.securityGuard = new SecurityGuard(config.securityPolicy ?? DEFAULT_SECURITY_POLICY);
  }

  startSession(options: { agentId?: string; projectId?: string } = {}): RuntimeSession {
    const session: RuntimeSession = {
      id: randomUUID(),
      projectId: options.projectId ?? this.config.projectId,
      activeAgentId: options.agentId ?? this.config.defaultAgentId,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: []
    };
    this.record(session, "session.started", { agentId: session.activeAgentId });
    this.sessions.set(session.id, session);
    return session;
  }

  async sendMessage(sessionId: string, message: string, agentId?: string): Promise<RuntimeResult> {
    const session = this.requireSession(sessionId);
    if (agentId) {
      session.activeAgentId = agentId;
    }

    this.record(session, "message.received", { message });
    await this.shortTermMemory.add({
      kind: "task",
      title: `User message: ${message.slice(0, 64)}`,
      content: message,
      source: "runtime.message",
      tags: ["session", session.activeAgentId],
      importance: 0.5
    });
    this.record(session, "memory.created", { scope: "short_term" });

    const remembered = extractRememberedContent(message);
    if (remembered) {
      await this.longTermMemory.add({
        kind: "preference",
        title: `Remembered: ${remembered.slice(0, 64)}`,
        content: remembered,
        source: "runtime.remember",
        tags: ["remembered", session.activeAgentId],
        importance: 0.8,
        confidence: "high"
      });
      this.record(session, "memory.created", { scope: "long_term" });
    }

    const context = await this.loadContext(session.id, {
      message,
      currentGoal: message
    });
    const agent = this.requireAgent(session.activeAgentId);

    const routedResponse = await this.tryRouteRuntimeIntent(session, agent, message, context, remembered);
    if (routedResponse) {
      this.record(session, "agent.response", { agentId: routedResponse.agentId, routed: true });
      return {
        session,
        response: routedResponse,
        context,
        events: [...session.events]
      };
    }

    const response = await agent.respond(message, {
      sessionId: session.id,
      projectId: session.projectId,
      shortTermMemory: this.shortTermMemory,
      longTermMemory: this.longTermMemory,
      executeTool: (toolName, input) => this.execute(session.id, toolName, input)
    });

    this.record(session, "agent.response", { agentId: agent.id });
    return {
      session,
      response,
      context,
      events: [...session.events]
    };
  }

  async loadContext(sessionId: string, user: Partial<UserContext> = {}): Promise<AppContext> {
    const session = this.requireSession(sessionId);
    const project: ProjectContext = {
      projectId: session.projectId,
      name: this.config.projectName
    };
    const context = await this.contextLoader.load({
      project,
      user,
      activeAgentId: session.activeAgentId,
      securityPolicy: this.securityGuard.getPolicy(),
      memorySearch: (query) => this.longTermMemory.search(query, { limit: 5 })
    });
    session.context = context;
    this.record(session, "context.loaded", { relatedMemory: context.relatedMemory.length });
    return context;
  }

  attachMemory(memory: { shortTerm?: ShortTermMemory; longTerm?: LongTermMemory }): this {
    if (memory.shortTerm) {
      this.shortTermMemory = memory.shortTerm;
    }
    if (memory.longTerm) {
      this.longTermMemory = memory.longTerm;
    }
    for (const session of this.sessions.values()) {
      this.record(session, "memory.attached");
    }
    return this;
  }

  attachSecurityPolicy(policy: SecurityPolicy): this {
    this.securityGuard.attachPolicy(policy);
    for (const session of this.sessions.values()) {
      this.record(session, "security.attached", { policyId: policy.id });
    }
    return this;
  }

  registerAgent(agent: AgentDefinition): this {
    this.agents.set(agent.id, agent);
    for (const session of this.sessions.values()) {
      this.record(session, "agent.registered", { agentId: agent.id });
    }
    return this;
  }

  registerTool(tool: ToolDefinition): this {
    this.tools.register(tool);
    for (const session of this.sessions.values()) {
      this.record(session, "tool.registered", { toolName: tool.name });
    }
    return this;
  }

  async execute(sessionId: string, toolName: string, input: ToolInput = {}): Promise<ToolOutput> {
    const session = this.requireSession(sessionId);
    const result = await this.tools.execute(toolName, input, {
      securityGuard: this.securityGuard,
      shortTermMemory: this.shortTermMemory,
      longTermMemory: this.longTermMemory
    });
    this.record(session, "tool.executed", { toolName, ok: result.ok });
    return result;
  }

  getShortTermMemory(): ShortTermMemory {
    return this.shortTermMemory;
  }

  getLongTermMemory(): LongTermMemory {
    return this.longTermMemory;
  }

  getSecurityGuard(): SecurityGuard {
    return this.securityGuard;
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  listTools(): ToolDefinition[] {
    return this.tools.list();
  }

  private requireSession(sessionId: string): RuntimeSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Runtime session not found: ${sessionId}`);
    }
    return session;
  }

  private requireAgent(agentId: string): AgentDefinition {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not registered: ${agentId}`);
    }
    return agent;
  }

  private async tryRouteRuntimeIntent(
    session: RuntimeSession,
    agent: AgentDefinition,
    message: string,
    context: AppContext,
    remembered?: string
  ): Promise<AgentResponse | undefined> {
    if (remembered) {
      return {
        agentId: agent.id,
        role: agent.role,
        message: "Đã lưu vào memory."
      };
    }

    if (isAuditLogIntent(message)) {
      const result = await this.execute(session.id, "audit.logs", { limit: 20 });
      return {
        agentId: agent.id,
        role: agent.role,
        message: result.ok
          ? `Security approved.\nĐây là audit log:\n${formatToolData(result.data)}`
          : `Security blocked. ${result.error ?? "Không thể đọc audit log."}`,
        toolResults: [result]
      };
    }

    if (isDatabaseDeleteIntent(message)) {
      const result = await this.execute(session.id, "database.deleteAll", {});
      return {
        agentId: agent.id,
        role: agent.role,
        message: result.ok
          ? "[CẢNH BÁO BẢO MẬT] Database delete tool was approved, but this Phase 4 playground tool is a no-op."
          : `Security blocked. Không đủ quyền admin/database.\nReason: ${result.error ?? "Denied by security policy."}`,
        toolResults: [result]
      };
    }

    if (isProjectRecallIntent(message)) {
      const results = context.relatedMemory.length > 0 ? context.relatedMemory : await this.longTermMemory.search(message, { limit: 3 });
      const answer = formatProjectMemoryAnswer(results[0]?.record?.content);
      return {
        agentId: agent.id,
        role: agent.role,
        message: answer ?? "Chưa có memory phù hợp cho câu hỏi này."
      };
    }

    return undefined;
  }

  private record(session: RuntimeSession, type: RuntimeEvent["type"], payload: Record<string, unknown> = {}): RuntimeEvent {
    const event: RuntimeEvent = {
      id: randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      payload
    };
    session.updatedAt = event.timestamp;
    session.events.push(event);
    return event;
  }
}

export function createDefaultRuntime(config: RuntimeConfig = {}): CoreRuntime {
  const runtime = new CoreRuntime(config);
  for (const agent of DEFAULT_AGENTS) {
    runtime.registerAgent(agent);
  }
  for (const tool of [echoTool, memorySearchTool, auditLogTool, databaseDeleteAllTool]) {
    runtime.registerTool(tool);
  }
  return runtime;
}

export function inspectAmf(amf: AmfDocument): InspectionStats {
  return {
    project: amf.project.name,
    files: amf.files.length,
    modules: amf.modules.length,
    dependencies: amf.dependencies.length,
    symbols: amf.symbols.length,
    rules: amf.rules.length,
    risks: amf.risks.length,
    lastCompiled: amf.project.compiledAt,
    amfVersion: amf.version
  };
}

export function formatInspection(stats: InspectionStats): string {
  return [
    `Project: ${stats.project}`,
    `Files: ${stats.files}`,
    `Modules: ${stats.modules}`,
    `Dependencies: ${stats.dependencies}`,
    `Symbols: ${stats.symbols}`,
    `Rules: ${stats.rules}`,
    `Risks: ${stats.risks}`,
    `AMF version: ${stats.amfVersion}`,
    `Last compiled: ${stats.lastCompiled}`
  ].join("\n");
}

export function buildContextPack(amf: AmfDocument, task: string, options: ContextPackOptions = {}): ContextPack {
  const keywords = tokenize(task);
  const scoredModules = amf.modules
    .map((module) => ({ ...module, score: scoreText(keywords, [module.name, module.path, module.summary, ...module.dependencies]) }))
    .filter((module) => module.score > 0)
    .sort(sortByScore)
    .slice(0, 8);

  const scoredFiles = amf.files
    .map((file) => ({ ...file, score: scoreText(keywords, [file.path, file.module, file.kind, file.summary, ...file.riskFlags]) }))
    .filter((file) => file.score > 0)
    .sort(sortByScore)
    .slice(0, 12);

  const scoredRules = amf.rules
    .map((rule) => ({ ...rule, score: scoreText(keywords, [rule.text, rule.source]) }))
    .filter((rule) => rule.score > 0)
    .sort(sortByScore)
    .slice(0, 8);

  const scoredRisks = amf.risks
    .map((risk) => ({ ...risk, score: scoreText(keywords, [risk.type, risk.message, risk.file ?? "", risk.recommendation]) }))
    .filter((risk) => risk.score > 0 || scoredFiles.some((file) => file.path === risk.file))
    .sort(sortByScore)
    .slice(0, 8);
  const relatedMemories = (options.memories ?? [])
    .filter((result) => options.includeSecret || result.record.sensitivity !== "secret")
    .map((result) => memoryToContext(result, Boolean(options.includeSecret)));
  const relatedShortTermMemories = relatedMemories.filter((memory) => memory.scope === "short_term").slice(0, 8);
  const relatedLongTermMemories = relatedMemories.filter((memory) => memory.scope === "long_term").slice(0, 8);

  return {
    task,
    generatedAt: new Date().toISOString(),
    project: amf.project.name,
    source: {
      amfVersion: amf.version,
      compiledAt: amf.project.compiledAt,
      checksum: amf.project.checksum
    },
    relatedModules: scoredModules.map(({ name, path, summary, dependencies, score }) => ({
      name,
      path,
      summary,
      dependencies,
      score
    })),
    relatedFiles: scoredFiles.map(({ path, module, kind, summary, privacy, riskFlags, score }) => ({
      path,
      module,
      kind,
      summary,
      privacy,
      riskFlags,
      score
    })),
    knownRules: scoredRules,
    risks: scoredRisks,
    relatedShortTermMemories,
    relatedLongTermMemories,
    recommendedSteps: recommendSteps(scoredModules, scoredFiles, scoredRisks, relatedShortTermMemories, relatedLongTermMemories)
  };
}

function recommendSteps(
  modules: Array<ModuleEntry & { score: number }>,
  files: Array<FileEntry & { score: number }>,
  risks: Array<RiskEntry & { score: number }>,
  shortTermMemories: ContextMemory[],
  longTermMemories: ContextMemory[]
): string[] {
  const steps = [
    "Review the highest-scoring related modules before editing.",
    "Inspect related files and confirm the compiled summary still matches source reality."
  ];

  if (risks.length > 0) {
    steps.push("Check risk zones before making changes, especially protected or secret-related findings.");
  }

  if (files.some((file) => file.kind === "test")) {
    steps.push("Run or update the related tests after the change.");
  } else {
    steps.push("Add or identify a focused verification path for this task.");
  }

  if (modules.some((module) => module.dependencies.length > 0)) {
    steps.push("Check module dependencies for downstream impact.");
  }

  if (shortTermMemories.length > 0) {
    steps.push("Use related short-term memory to preserve active task context.");
  }

  if (longTermMemories.length > 0) {
    steps.push("Apply related long-term memory before changing behavior.");
  }

  return steps;
}

function memoryToContext(result: MemorySearchResult, includeSecret: boolean): ContextMemory {
  const { record, score } = result;
  const base = {
    id: record.id,
    scope: record.scope,
    kind: record.kind,
    title: record.title,
    tags: record.tags,
    importance: record.importance,
    confidence: record.confidence,
    sensitivity: record.sensitivity,
    score
  };

  if (record.sensitivity === "confidential") {
    return {
      ...base,
      summary: "Confidential memory matched. Content withheld; use title, tags and source refs only."
    };
  }

  if (record.sensitivity === "secret" && !includeSecret) {
    return {
      ...base,
      summary: "Secret memory withheld."
    };
  }

  return {
    ...base,
    content: record.content
  };
}

function extractRememberedContent(message: string): string | undefined {
  const normalized = normalizeSearchText(message);
  const markers = ["remember that", "remember", "nho rang", "hay nho rang"];

  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index >= 0) {
      const content = message.slice(index + marker.length).replace(/^[:\s]+/, "").trim();
      return content.length > 0 ? content : undefined;
    }
  }

  return undefined;
}

function isAuditLogIntent(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return normalized.includes("audit log") && /\b(chay|run|doc|read|show|xem)\b/i.test(normalized);
}

function isDatabaseDeleteIntent(message: string): boolean {
  const normalized = normalizeSearchText(message);
  const hasDelete = /\b(xoa|delete|remove|drop|clear)\b/i.test(normalized);
  const hasDatabase = /\b(database|db|co so du lieu)\b/i.test(normalized);
  const hasWideScope = /\b(toan bo|all|everything|tat ca)\b/i.test(normalized);
  return hasDelete && hasDatabase && hasWideScope;
}

function isProjectRecallIntent(message: string): boolean {
  const normalized = normalizeSearchText(message);
  const asksProject = /\b(du an|project)\b/i.test(normalized);
  const asksWhat = /\b(gi|what|dang lam|la)\b/i.test(normalized);
  return asksProject && asksWhat;
}

function formatProjectMemoryAnswer(content?: string): string | undefined {
  if (!content) {
    return undefined;
  }

  const trimmed = content.trim().replace(/\s+\.$/, ".");
  const match = /^dự án này là\s+(.+)$/i.exec(trimmed);
  if (match?.[1]) {
    return ensureSentence(`Dự án ${match[1].trim()}`);
  }

  return ensureSentence(trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
}

function formatToolData(data: unknown): string {
  if (!Array.isArray(data)) {
    return JSON.stringify(data ?? null, null, 2);
  }

  if (data.length === 0) {
    return "[]";
  }

  return JSON.stringify(data.slice(0, 20), null, 2);
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function scoreText(keywords: string[], values: string[]): number {
  if (keywords.length === 0) {
    return 0;
  }

  const corpus = normalizeSearchText(values.join(" "));
  let score = 0;

  for (const keyword of keywords) {
    if (corpus.includes(keyword)) {
      score += keyword.length > 3 ? 2 : 1;
    }
  }

  return score;
}

function tokenize(task: string): string[] {
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "fix", "bug"]);
  return Array.from(
    new Set(
      normalizeSearchText(task)
        .split(/[^a-z0-9_]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !stopWords.has(part))
    )
  );
}

function sortByScore<T extends { score: number }>(left: T, right: T): number {
  return right.score - left.score;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}
