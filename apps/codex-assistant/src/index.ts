#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { createDefaultRuntime, type CoreRuntime } from "@atlas/runtime";
import type { SecurityPolicy } from "@atlas/security";
import type { ToolDefinition } from "@atlas/tools";

type AssistantCommand = "interactive" | "ask" | "remember" | "audit" | "memory" | "status" | "scenario" | "help";

const assistantPolicy: SecurityPolicy = {
  id: "codex-project-assistant-local",
  name: "Codex Project Assistant Local Policy",
  description: "Allows read and execute only. Blocks filesystem, database, network and admin tools.",
  permissions: ["read", "execute"],
  defaultDecision: "deny"
};

const blockedAdminTool: ToolDefinition = {
  name: "danger.admin",
  description: "A blocked tool used to verify SecurityGuard enforcement.",
  permissionRequired: "admin",
  async execute() {
    return {
      ok: true,
      data: { message: "This should not run under the default policy." }
    };
  }
};

const scenarioMessages = {
  intro: "T\u00f4i \u0111ang x\u00e2y Core AI cho Cyno.",
  remember: "Nh\u1edb r\u1eb1ng d\u1ef1 \u00e1n n\u00e0y l\u00e0 Core AI cho Cyno.",
  recall: "Kh\u00e1ch h\u00e0ng n\u00e0y \u0111ang l\u00e0m d\u1ef1 \u00e1n g\u00ec?",
  audit: "Ch\u1ea1y tool \u0111\u1ecdc audit log.",
  blocked: "X\u00f3a to\u00e0n b\u1ed9 database."
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = parseCommand(args);
  const runtime = createAssistantRuntime();
  const session = runtime.startSession({ agentId: "developer" });

  switch (command.name) {
    case "help":
      printHelp();
      return;
    case "status":
      printStatus(runtime);
      return;
    case "ask":
      await sendAndPrint(runtime, session.id, command.text);
      return;
    case "remember":
      await sendAndPrint(runtime, session.id, `Nh\u1edb r\u1eb1ng ${command.text}`);
      return;
    case "audit":
      console.table(runtime.getSecurityGuard().getAuditLogs(20));
      return;
    case "memory":
      await printMemory(runtime);
      return;
    case "scenario":
      await runScenario(runtime, session.id);
      return;
    case "interactive":
      await runInteractive(runtime, session.id);
      return;
  }
}

function createAssistantRuntime(): CoreRuntime {
  const runtime = createDefaultRuntime({
    projectId: "codex-project-assistant",
    projectName: "Codex Project Assistant",
    securityPolicy: assistantPolicy
  });
  runtime.registerTool(blockedAdminTool);
  return runtime;
}

async function runInteractive(runtime: CoreRuntime, sessionId: string): Promise<void> {
  printHelp();
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const line = (await rl.question("\ncodex-assistant> ")).trim();
      if (!line) {
        continue;
      }

      if (line === "/exit") {
        break;
      }
      if (line === "/help") {
        printHelp();
        continue;
      }
      if (line === "/status") {
        printStatus(runtime);
        continue;
      }
      if (line === "/scenario") {
        await runScenario(runtime, sessionId);
        continue;
      }
      if (line === "/audit") {
        console.table(runtime.getSecurityGuard().getAuditLogs(20));
        continue;
      }
      if (line === "/memory") {
        await printMemory(runtime);
        continue;
      }
      if (line === "/memory short") {
        console.table((await runtime.getShortTermMemory().list()).map(safeMemoryRow));
        continue;
      }
      if (line === "/memory long") {
        console.table((await runtime.getLongTermMemory().list()).map(safeMemoryRow));
        continue;
      }
      if (line.startsWith("/remember ")) {
        await sendAndPrint(runtime, sessionId, `Nh\u1edb r\u1eb1ng ${line.slice("/remember ".length).trim()}`);
        continue;
      }
      if (line.startsWith("/agent ")) {
        const session = runtime.startSession({ agentId: line.slice("/agent ".length).trim() });
        sessionId = session.id;
        console.log(`Started new session with agent: ${session.activeAgentId}`);
        continue;
      }
      if (line.startsWith("/tool echo ")) {
        const result = await runtime.execute(sessionId, "echo", { message: line.slice("/tool echo ".length) });
        console.log(JSON.stringify(result, null, 2));
        continue;
      }
      if (line === "/tool admin") {
        const result = await runtime.execute(sessionId, "danger.admin", {});
        console.log(JSON.stringify(result, null, 2));
        continue;
      }
      if (line === "/clear") {
        await runtime.getShortTermMemory().clear();
        console.log("Short-term memory cleared.");
        continue;
      }

      await sendAndPrint(runtime, sessionId, line);
    }
  } finally {
    rl.close();
  }
}

async function runScenario(runtime: CoreRuntime, sessionId: string): Promise<void> {
  console.log("Running Codex Project Assistant scenario...\n");

  await sendAndPrint(runtime, sessionId, scenarioMessages.intro);
  console.log(`Short-term memory count: ${(await runtime.getShortTermMemory().list()).length}\n`);

  await sendAndPrint(runtime, sessionId, scenarioMessages.remember);
  console.log(`Long-term memory count: ${(await runtime.getLongTermMemory().list()).length}\n`);

  await sendAndPrint(runtime, sessionId, scenarioMessages.recall);
  console.log();

  await sendAndPrint(runtime, sessionId, scenarioMessages.audit);
  console.log();

  await sendAndPrint(runtime, sessionId, scenarioMessages.blocked);
  console.log();

  console.log(`Audit log entries: ${runtime.getSecurityGuard().getAuditLogs().length}`);
  console.table(runtime.getSecurityGuard().getAuditLogs(10));
}

async function sendAndPrint(runtime: CoreRuntime, sessionId: string, message: string): Promise<void> {
  const result = await runtime.sendMessage(sessionId, message);
  console.log(`User: ${message}`);
  console.log(`AI: ${result.response.message}`);
}

async function printMemory(runtime: CoreRuntime): Promise<void> {
  const [shortTerm, longTerm] = await Promise.all([
    runtime.getShortTermMemory().list(),
    runtime.getLongTermMemory().list()
  ]);
  console.log("Short-term memory");
  console.table(shortTerm.map(safeMemoryRow));
  console.log("Long-term memory");
  console.table(longTerm.map(safeMemoryRow));
}

function printStatus(runtime: CoreRuntime): void {
  console.log(JSON.stringify({
    project: "Codex Project Assistant",
    agents: runtime.listAgents().map((agent) => ({ id: agent.id, role: agent.role })),
    tools: runtime.listTools().map((tool) => ({ name: tool.name, permissionRequired: tool.permissionRequired })),
    policy: assistantPolicy
  }, null, 2));
}

function parseCommand(args: string[]): { name: AssistantCommand; text: string } {
  const [rawCommand, ...rest] = args;
  const command = rawCommand;
  const text = rest.join(" ").trim();

  if (!command) {
    return { name: "interactive", text: "" };
  }
  if (command === "--help" || command === "-h" || command === "help") {
    return { name: "help", text: "" };
  }
  if (command === "--scenario" || command === "scenario") {
    return { name: "scenario", text: "" };
  }
  if (command === "ask" || command === "remember") {
    if (!text) {
      throw new Error(`${command} requires text input.`);
    }
    return { name: command as "ask" | "remember", text };
  }
  if (command === "audit" || command === "memory" || command === "status") {
    return { name: command as "audit" | "memory" | "status", text: "" };
  }

  return { name: "ask", text: args.join(" ").trim() };
}

function safeMemoryRow(record: {
  id: string;
  scope: string;
  kind: string;
  title: string;
  content: string;
  sensitivity: string;
  updatedAt: string;
}) {
  return {
    id: record.id,
    scope: record.scope,
    kind: record.kind,
    title: redact(record.title).slice(0, 80),
    content: redact(record.content).slice(0, 120),
    sensitivity: record.sensitivity,
    updatedAt: record.updatedAt
  };
}

function redact(value: string): string {
  return value
    .replace(/\b(password|token|api[_-]?key|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/sk_(test|live)_[A-Za-z0-9_\-]+/g, "[REDACTED_SECRET]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]");
}

function printHelp(): void {
  console.log(`
Codex Project Assistant

Usage:
  codex-project-assistant
  codex-project-assistant ask "Khach hang nay dang lam du an gi?"
  codex-project-assistant remember "du an nay la Core AI cho Cyno"
  codex-project-assistant status
  codex-project-assistant scenario

Interactive commands:
  /remember <text>                     Add long-term memory through runtime
  /agent developer|business|security   Start a new session with another agent
  /memory                              Show short-term and long-term memory
  /memory short                        Show short-term memory
  /memory long                         Show long-term memory
  /tool echo <text>                    Run allowed echo tool
  /tool admin                          Run blocked admin tool
  /audit                               Show security audit log
  /scenario                            Run the built-in safety scenario
  /status                              Show runtime status
  /clear                               Clear short-term memory
  /help                                Show help
  /exit                                Exit
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Codex Project Assistant failed.");
  process.exitCode = 1;
});
