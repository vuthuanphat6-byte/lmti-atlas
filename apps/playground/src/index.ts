#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { createDefaultRuntime } from "@atlas/runtime";
import type { SecurityPolicy } from "@atlas/security";
import type { ToolDefinition } from "@atlas/tools";

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
  intro: "I am working on the sample packing workflow.",
  remember: "Remember that this repository is a local-first project memory tool for AI coding agents.",
  recall: "What kind of project is this repository?",
  audit: "Read the audit log.",
  blocked: "Delete the entire database."
};

async function main(): Promise<void> {
  const runtime = createDefaultRuntime({
    projectId: "codex-project-assistant",
    projectName: "Codex Project Assistant",
    securityPolicy: assistantPolicy
  });
  runtime.registerTool(blockedAdminTool);
  const session = runtime.startSession({ agentId: "developer" });

  if (process.argv.includes("--scenario")) {
    await runScenario(runtime, session.id);
    return;
  }

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
      if (line === "/scenario") {
        await runScenario(runtime, session.id);
        continue;
      }
      if (line.startsWith("/agent ")) {
        session.activeAgentId = line.slice("/agent ".length).trim();
        console.log(`Active agent: ${session.activeAgentId}`);
        continue;
      }
      if (line.startsWith("/memory add ")) {
        const content = line.slice("/memory add ".length).trim();
        await runtime.getLongTermMemory().add({
          kind: "system_note",
          title: content.slice(0, 64),
          content,
          source: "codex-assistant.manual",
          tags: ["manual", "codex-assistant"],
          importance: 0.7
        });
        console.log("Added long-term memory.");
        continue;
      }
      if (line === "/memory short") {
        console.table(await runtime.getShortTermMemory().list());
        continue;
      }
      if (line === "/memory long") {
        console.table(await runtime.getLongTermMemory().list());
        continue;
      }
      if (line === "/clear") {
        await runtime.getShortTermMemory().clear();
        console.log("Short-term memory cleared.");
        continue;
      }
      if (line === "/audit") {
        console.table(runtime.getSecurityGuard().getAuditLogs(20));
        continue;
      }
      if (line.startsWith("/tool echo ")) {
        const result = await runtime.execute(session.id, "echo", { message: line.slice("/tool echo ".length) });
        console.log(JSON.stringify(result, null, 2));
        continue;
      }
      if (line === "/tool admin") {
        const result = await runtime.execute(session.id, "danger.admin", {});
        console.log(JSON.stringify(result, null, 2));
        continue;
      }

      const result = await runtime.sendMessage(session.id, line);
      console.log(`\n[${result.response.role}] ${result.response.message}`);
      console.log(`Short-term memory: ${(await runtime.getShortTermMemory().list()).length}`);
      console.log(`Long-term memory: ${(await runtime.getLongTermMemory().list()).length}`);
      console.log(`Audit entries: ${runtime.getSecurityGuard().getAuditLogs().length}`);
    }
  } finally {
    rl.close();
  }
}

async function runScenario(runtime: ReturnType<typeof createDefaultRuntime>, sessionId: string): Promise<void> {
  console.log("Running Codex Project Assistant scenario...\n");

  const intro = await runtime.sendMessage(sessionId, scenarioMessages.intro);
  printExchange("User", scenarioMessages.intro, "AI", intro.response.message);
  console.log(`Test 1 short-term memory count: ${(await runtime.getShortTermMemory().list()).length}\n`);

  const remembered = await runtime.sendMessage(sessionId, scenarioMessages.remember);
  printExchange("User", scenarioMessages.remember, "AI", remembered.response.message);
  console.log(`Test 2 long-term memory count: ${(await runtime.getLongTermMemory().list()).length}\n`);

  const answer = await runtime.sendMessage(sessionId, scenarioMessages.recall);
  printExchange("User", scenarioMessages.recall, "AI", answer.response.message);
  console.log();

  const audit = await runtime.sendMessage(sessionId, scenarioMessages.audit);
  printExchange("User", scenarioMessages.audit, "AI", audit.response.message);
  console.log();

  const blocked = await runtime.sendMessage(sessionId, scenarioMessages.blocked);
  printExchange("User", scenarioMessages.blocked, "AI", blocked.response.message);
  console.log();

  console.log(`Audit log entries: ${runtime.getSecurityGuard().getAuditLogs().length}`);
  console.table(runtime.getSecurityGuard().getAuditLogs(10));
}

function printExchange(userLabel: string, userMessage: string, assistantLabel: string, assistantMessage: string): void {
  console.log(`${userLabel}: ${userMessage}`);
  console.log(`${assistantLabel}: ${assistantMessage}`);
}

function printHelp(): void {
  console.log(`
Codex Project Assistant

Commands:
  /agent developer|business|security   Switch active agent
  /memory add <text>                   Add long-term memory manually
  /memory short                        Show short-term memory
  /memory long                         Show long-term memory
  /tool echo <text>                    Run allowed echo tool
  /tool admin                          Run blocked admin tool
  /audit                               Show security audit log
  /scenario                            Run the built-in safety scenario
  /clear                               Clear short-term memory
  /help                                Show help
  /exit                                Exit
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Codex Project Assistant failed.");
  process.exitCode = 1;
});
