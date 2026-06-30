import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMemory } from "@atlas/memory";
import { attachCodex, benchmarkPreflightCommand, compileCommand, contextCommand, doctorSecurityCommand, initCommand, main, preflightCommand, rememberCommand, taskDoneCommand, thinkingExperimentCommand } from "../src/index";

const githubTokenFixture = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");

async function createFixtureProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "lmti-cli-"));
  await mkdir(path.join(root, "src", "orders"), { recursive: true });
  await mkdir(path.join(root, "database"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });

  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "lmti-fixture", private: true }, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(root, "README.md"),
    "# Fixture\n\nBusiness rule: packing labels must include destination.\n",
    "utf8"
  );
  await writeFile(
    path.join(root, "src", "orders", "packing.ts"),
    [
      "export function printPackingLabel(destination: string): string {",
      "  if (!destination) throw new Error('Destination required');",
      "  return `DEST=${destination}`;",
      "}"
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, "database", "schema.sql"),
    ["CREATE TABLE packing_labels (", "  id INTEGER PRIMARY KEY,", "  destination TEXT NOT NULL", ");"].join("\n"),
    "utf8"
  );
  for (let index = 0; index < 16; index += 1) {
    await writeFile(path.join(root, "docs", `packing-note-${index}.md`), `# Packing note ${index}\n`, "utf8");
  }

  return root;
}

async function writeLegacyAmf(filePath: string, name: string): Promise<void> {
  await writeFile(
    filePath,
    JSON.stringify(
      {
        version: "0.1.0",
        generatedAt: "2026-06-28T00:00:00.000Z",
        project: {
          name,
          root: "/legacy",
          compiledAt: "2026-06-28T00:00:00.000Z",
          atlasVersion: "0.0.0",
          amfVersion: "0.1.0",
          compiler: {
            name: "Legacy Atlas compiler",
            version: "0.0.1"
          },
          sourceBoundary: {
            root: "/legacy",
            ignoredDirectories: [],
            ignoredFiles: [],
            maxFileBytes: 1024
          },
          checksum: "legacy"
        },
        modules: [],
        files: [],
        symbols: [],
        dependencies: [],
        api: [],
        database: [],
        rules: [],
        risks: [],
        history: [],
        architecture: [],
        summaries: [],
        unresolvedQuestions: []
      },
      null,
      2
    ),
    "utf8"
  );
}

async function runCliInFixture(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const originalCwd = process.cwd();
  const originalLog = console.log;
  const originalWarn = console.warn;
  const stdout: string[] = [];
  const stderr: string[] = [];

  console.log = (...values: unknown[]) => {
    stdout.push(values.map(String).join(" "));
  };
  console.warn = (...values: unknown[]) => {
    stderr.push(values.map(String).join(" "));
  };

  try {
    process.chdir(cwd);
    await main(args);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
    console.warn = originalWarn;
  }

  return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

describe("LMTI CLI commands", () => {
  it("init creates .lmti structure", async () => {
    const cwd = await createFixtureProject();
    const storage = await initCommand(cwd);

    expect(storage.atlasDir.endsWith(".lmti")).toBe(true);
    await expect(readFile(path.join(cwd, ".lmti", "config.json"), "utf8")).resolves.toContain("\"kernel\": \"atlas\"");
    await expect(readFile(path.join(cwd, ".lmti", "project.amf.json"), "utf8")).resolves.toContain("\"version\": \"0.1.0\"");
    await expect(readFile(path.join(cwd, ".lmti", "memory", "long-term.json"), "utf8")).resolves.toBe("[]");
    expect((await stat(path.join(cwd, ".lmti", "experiments"))).isDirectory()).toBe(true);
  });

  it("compile creates project.amf.json", async () => {
    const cwd = await createFixtureProject();
    await initCommand(cwd);
    const { amf } = await compileCommand(cwd);

    expect(amf.project.name).toBe("lmti-fixture");
    await expect(readFile(path.join(cwd, ".lmti", "project.amf.json"), "utf8")).resolves.toContain("packing_labels");
  });

  it("compile migrates legacy Atlas storage before writing canonical AMF", async () => {
    const cwd = await createFixtureProject();
    await mkdir(path.join(cwd, ".atlas"), { recursive: true });
    await writeLegacyAmf(path.join(cwd, ".atlas", "project.amf.json"), "legacy-fixture");

    const { warnings } = await compileCommand(cwd);

    expect(warnings.join("\n")).toContain("migrated to .lmti before compile");
    await expect(stat(path.join(cwd, ".atlas", "project.amf.json"))).resolves.toBeTruthy();
    const logs = await readdir(path.join(cwd, ".lmti", "logs"));
    expect(logs.some((file) => file.startsWith("migration-") && file.endsWith(".json"))).toBe(true);
  });

  it("compile warns and keeps .lmti canonical when legacy storage also exists", async () => {
    const cwd = await createFixtureProject();
    await initCommand(cwd);
    await mkdir(path.join(cwd, ".atlas"), { recursive: true });
    await writeLegacyAmf(path.join(cwd, ".atlas", "project.amf.json"), "legacy-fixture");

    const { warnings } = await compileCommand(cwd);

    expect(warnings.join("\n")).toContain("using .lmti/project.amf.json as canonical");
  });

  it("attach codex creates AGENTS.md and is idempotent", async () => {
    const cwd = await createFixtureProject();

    await attachCodex(cwd);
    await attachCodex(cwd);

    const agents = await readFile(path.join(cwd, "AGENTS.md"), "utf8");
    expect(agents).toContain("## LMTI - Atlas Integration");
    expect(agents.match(/## LMTI - Atlas Integration/g)).toHaveLength(1);
  });

  it("attach codex preserves existing AGENTS.md content", async () => {
    const cwd = await createFixtureProject();
    await writeFile(path.join(cwd, "AGENTS.md"), "# Existing Guidance\n\nDo not remove this.\n", "utf8");

    await attachCodex(cwd);

    const agents = await readFile(path.join(cwd, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Existing Guidance");
    expect(agents).toContain("Do not remove this.");
    expect(agents).toContain("lmti context \"<task>\"");
  });

  it("context command reads AMF and memory", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);
    await createMemory(
      {
        scope: "long_term",
        kind: "rule",
        title: "Packing label rule",
        content: "Packing labels must include destination.",
        projectId: "lmti-fixture",
        sourceRefs: ["README.md:3"],
        tags: ["packing"],
        importance: 0.8,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );

    const context = await contextCommand(cwd, "fix packing label bug");

    expect(context.project).toBe("lmti-fixture");
    expect(context.relatedDatabase.some((entry) => entry.name === "packing_labels")).toBe(true);
    expect(context.relatedLongTermMemories.some((memory) => memory.title === "Packing label rule")).toBe(true);
  });

  it("context command uses intent to return partner permission lessons and filter logo memory", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);
    await rememberCommand(cwd, [
      "--kind",
      "lesson",
      "--title",
      "Partner route rule",
      "--content",
      "Partner user must route to /partner. /dashboard/summary returning 403 is correct due to least privilege.",
      "--tags",
      "partner,routing,permission,dashboard",
      "--sensitivity",
      "internal",
      "--prompt-policy",
      "summarize_only"
    ]);
    await rememberCommand(cwd, [
      "--kind",
      "lesson",
      "--title",
      "Dashboard logo rule",
      "--content",
      "Dashboard logo brand image asset must stay aligned.",
      "--tags",
      "dashboard,logo,brand,asset",
      "--sensitivity",
      "internal",
      "--prompt-policy",
      "summarize_only"
    ]);

    const context = await contextCommand(cwd, "partner user bị 403 dashboard summary");

    expect(context.inferredIntent.primaryIntent).toBe("permission");
    expect(context.inferredIntent.secondaryIntents).toContain("partner");
    expect(context.inferredIntent.secondaryIntents).toContain("dashboard");
    expect(context.relatedLongTermMemories.some((memory) => memory.title === "Partner route rule" && memory.mode === "summary")).toBe(true);
    expect(context.relatedLongTermMemories.some((memory) => memory.title === "Dashboard logo rule")).toBe(false);
    expect(JSON.stringify(context)).not.toContain("/dashboard/summary returning 403 is correct");
  });

  it("context command fails gracefully before compile", async () => {
    const cwd = await createFixtureProject();
    await initCommand(cwd);

    await expect(contextCommand(cwd, "fix packing label bug")).rejects.toThrow("Run `lmti compile` first");
  });

  it("context command does not expose secret memory", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);
    await createMemory(
      {
        scope: "long_term",
        kind: "risk",
        title: "Secret deployment token",
        content: "super-secret-token-value",
        projectId: "lmti-fixture",
        sourceRefs: [],
        tags: ["secret"],
        importance: 1,
        confidence: "high",
        sensitivity: "secret"
      },
      { cwd }
    );

    const context = await contextCommand(cwd, "secret deployment token");

    expect(JSON.stringify(context)).not.toContain("super-secret-token-value");
    expect(context.relatedLongTermMemories).toHaveLength(0);
  });

  it("preflight hard gates blocked memory before policy-safe ranking", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);
    await createMemory(
      {
        scope: "long_term",
        kind: "route",
        title: "Dashboard Agent public route",
        content: "Dashboard Agent summary route is /dashboard/summary.",
        projectId: "lmti-fixture",
        sourceRefs: ["README.md:3"],
        tags: ["dashboard", "agent", "route"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "public",
        promptPolicy: "allow_raw"
      },
      { cwd }
    );
    await createMemory(
      {
        scope: "long_term",
        kind: "risk",
        title: "Secret dashboard token",
        content: "token=super-secret-dashboard-value",
        projectId: "lmti-fixture",
        sourceRefs: ["README.md:3"],
        tags: ["dashboard", "agent", "secret"],
        importance: 1,
        confidence: "high",
        sensitivity: "secret",
        promptPolicy: "allow_raw"
      },
      { cwd }
    );
    await createMemory(
      {
        scope: "long_term",
        kind: "route",
        title: "Deprecated dashboard route",
        content: "Deprecated route says Agent dashboard must use /old-dashboard.",
        projectId: "lmti-fixture",
        sourceRefs: ["README.md:3"],
        tags: ["dashboard", "agent", "deprecated"],
        importance: 1,
        confidence: "high",
        sensitivity: "public",
        promptPolicy: "allow_raw"
      },
      { cwd }
    );
    await createMemory(
      {
        scope: "long_term",
        kind: "permission",
        title: "Internal dashboard permission note",
        content: "Internal permission note for dashboard Agent.",
        projectId: "lmti-fixture",
        sourceRefs: ["README.md:3"],
        tags: ["dashboard", "agent", "permission"],
        importance: 1,
        confidence: "high",
        sensitivity: "internal",
        promptPolicy: "summarize_only"
      },
      { cwd }
    );

    const result = await preflightCommand(cwd, "dashboard Agent loi", {
      role: "developer",
      modelTarget: "external_model",
      now: new Date("2026-06-28T00:00:00.000Z")
    });

    expect(result.observerFrame.effectiveContextRole).toBe("external_model");
    expect(result.selectedMemories.map((memory) => memory.metadata.title)).toContain("Dashboard Agent public route");
    expect(result.selectedMemories.some((memory) => memory.metadata.title === "Internal dashboard permission note" && memory.mode === "summary")).toBe(true);
    expect(result.blockedMemories.map((memory) => memory.reason)).toEqual(
      expect.arrayContaining(["secret", "deprecated_as_truth"])
    );
    expect(result.finalContextPackage.policyDecisionIds).toEqual(result.selectedMemories.map((memory) => memory.policyDecisionId));
    expect(result.egress.blocked).toBe(false);
    expect(result.adapterSandbox.allowed).toBe(true);
    expect(result.adapterSandbox.deliveredContextPackageId).toBe(result.finalContextPackage.id);
    expect(JSON.stringify(result)).not.toContain("super-secret-dashboard-value");
    expect(JSON.stringify(result)).not.toContain("/old-dashboard");
    expect(result.explanation.blockedMemories.every((memory) => !memory.safeSummary.includes("super-secret-dashboard-value"))).toBe(true);
  });

  it("preflight blocks adapter manifests that request memory store scope", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);
    await writeFile(
      path.join(cwd, "bad-adapter.json"),
      JSON.stringify(
        {
          id: "bad-plugin",
          name: "Bad Plugin",
          version: "0.1.0",
          kind: "plugin",
          scopes: ["context:read", "memory:read"],
          sandbox: {
            network: false,
            filesystem: "none",
            allowMemoryStore: true,
            timeoutMs: 1000
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await preflightCommand(cwd, "fix packing label bug", {
      flags: { "adapter-manifest": "bad-adapter.json" },
      now: new Date("2026-06-28T00:00:00.000Z")
    });

    expect(result.adapterSandbox.allowed).toBe(false);
    expect(result.adapterSandbox.deniedReasons).toEqual(
      expect.arrayContaining(["forbidden_scope_memory:read", "direct_memory_store_access_forbidden"])
    );
    expect(result.adapterSandbox.deliveredContextPackageId).toBeUndefined();
    expect(result.predictedFailures.some((failure) => failure.includes("adapter sandbox blocked"))).toBe(true);
  });

  it("preflight applies adapter privacy profiles and denies raw sensitive adapter output", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);
    await writeFile(
      path.join(cwd, "unsafe-adapter.json"),
      JSON.stringify(
        {
          id: "unsafe-model",
          name: "Unsafe Model",
          version: "0.1.0",
          kind: "model",
          scopes: ["context:read"],
          privacy: {
            allowRawSecret: true,
            allowRawConfidential: true,
            requiresEgressScan: false,
            defaultModelTarget: "external_model"
          },
          sandbox: {
            network: false,
            filesystem: "none",
            allowMemoryStore: false,
            timeoutMs: 1000
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await preflightCommand(cwd, "fix packing label bug", {
      flags: { "adapter-manifest": "unsafe-adapter.json" },
      now: new Date("2026-06-28T00:00:00.000Z")
    });

    expect(result.adapterSandbox.allowed).toBe(false);
    expect(result.adapterSandbox.manifest.privacy).toMatchObject({
      allowRawSecret: true,
      allowRawConfidential: true,
      requiresEgressScan: false,
      defaultModelTarget: "external_model"
    });
    expect(result.adapterSandbox.deniedReasons).toEqual(
      expect.arrayContaining(["egress_scan_required", "raw_secret_adapter_output_forbidden", "raw_confidential_adapter_output_forbidden"])
    );
  });

  it("known adapters default to external policy-safe output", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);
    const result = await preflightCommand(cwd, "fix packing label bug", {
      flags: { adapter: "codex" },
      now: new Date("2026-06-28T00:00:00.000Z")
    });

    expect(result.request.modelTarget).toBe("external_model");
    expect(result.adapterSandbox.manifest.privacy).toMatchObject({
      allowRawSecret: false,
      allowRawConfidential: false,
      requiresEgressScan: true,
      defaultModelTarget: "external_model"
    });
  });

  it("security doctor reports config secret findings without raw leakage", async () => {
    const cwd = await createFixtureProject();
    await initCommand(cwd);
    await writeFile(path.join(cwd, ".lmti", "config.json"), JSON.stringify({ token: githubTokenFixture, privacy: { allowSecretExport: true, allowExternalModelRawMemory: true } }, null, 2), "utf8");

    const report = await doctorSecurityCommand(cwd);

    expect(report.status).toBe("fail");
    expect(report.checks.some((check) => check.id === "config-secret-scan" && check.status === "fail")).toBe(true);
    expect(report.checks.some((check) => check.id === "privacy-config" && check.status === "fail")).toBe(true);
    expect(JSON.stringify(report)).not.toContain(githubTokenFixture);
  });

  it("benchmarks preflight latency using the real preflight path", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);

    const result = await benchmarkPreflightCommand(cwd, ["fix packing label bug", "--runs", "2"]);

    expect(result.runs).toBe(2);
    expect(result.samples).toHaveLength(2);
    expect(result.p95LatencyMs).toBeGreaterThanOrEqual(result.p50LatencyMs);
    expect(result.samples.every((sample) => sample.adapterAllowed)).toBe(true);
  });

  it("remember creates lessons and task done records task events", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);

    const lesson = await rememberCommand(cwd, [
      "--kind",
      "lesson",
      "--title",
      "Partner route rule",
      "--content",
      "Partner user must route to /partner.",
      "--tags",
      "partner,routing,permission",
      "--sensitivity",
      "internal",
      "--prompt-policy",
      "summarize_only"
    ]);
    expect(lesson.kind).toBe("lesson");
    await expect(readFile(path.join(cwd, ".lmti", "memory", "lessons.json"), "utf8")).resolves.toContain("Partner route rule");

    const done = await taskDoneCommand(cwd, [
      "--title",
      "Partner 403 route task",
      "--summary",
      "Confirmed partner route behavior.",
      "--lesson",
      "Partner user must route to /partner."
    ]);

    expect(done.lessonMemory?.kind).toBe("lesson");
    await expect(readFile(path.join(cwd, ".lmti", "events", "tasks.jsonl"), "utf8")).resolves.toContain("Partner 403 route task");
  });

  it("experiment thinking saves a local reduction report", async () => {
    const cwd = await createFixtureProject();
    await compileCommand(cwd);

    const result = await thinkingExperimentCommand(cwd, "fix packing label bug");

    expect(result.baseline.estimatedFilesToInspect).toBeGreaterThan(result.lmti.estimatedFilesToInspect);
    expect(result.reduction.filesReduced).toBeGreaterThan(0);
    await expect(readFile(path.join(cwd, ".lmti", "experiments", "EXP-0001-thinking.json"), "utf8")).resolves.toContain(
      "\"filesReduced\""
    );
  });

  it("experiment thinking fails gracefully before compile", async () => {
    const cwd = await createFixtureProject();
    await initCommand(cwd);

    await expect(thinkingExperimentCommand(cwd, "fix packing label bug")).rejects.toThrow("Run `lmti compile` first");
  });

  it("actions CLI records a session lifecycle and returns detail", async () => {
    const cwd = await createFixtureProject();
    const start = JSON.parse(
      (await runCliInFixture(cwd, ["actions", "start", "--task", "Fix dashboard Agent 403", "--branch", "feature/actions"])).stdout
    ) as { id: string; status: string; task: string };

    expect(start.status).toBe("running");
    expect(start.task).toBe("Fix dashboard Agent 403");

    await runCliInFixture(cwd, [
      "actions",
      "log",
      "--session-id",
      start.id,
      "--type",
      "file_modified",
      "--file",
      "src/auth/middleware.ts",
      "--diff-summary",
      "Adjusted role guard after source review",
      "--lines-added",
      "2",
      "--lines-removed",
      "1"
    ]);
    await runCliInFixture(cwd, [
      "actions",
      "command",
      "--session-id",
      start.id,
      "--command",
      "npm test",
      "--exit-code",
      "0",
      "--duration-ms",
      "1200",
      "--output-summary",
      "tests passed"
    ]);
    await runCliInFixture(cwd, [
      "actions",
      "decision",
      "--session-id",
      start.id,
      "--decision",
      "Keep least privilege",
      "--reason",
      "403 remains valid for users outside the allowed role",
      "--related-files",
      "src/auth/middleware.ts",
      "--related-memory-ids",
      "mem-1"
    ]);
    await runCliInFixture(cwd, [
      "actions",
      "memory",
      "--session-id",
      start.id,
      "--memory-id",
      "mem-1",
      "--memory-type",
      "long",
      "--used-in-decision"
    ]);
    await runCliInFixture(cwd, [
      "actions",
      "reflection",
      "--session-id",
      start.id,
      "--summary",
      "Fixed permission route safely",
      "--tests-run",
      "npm test"
    ]);
    await runCliInFixture(cwd, ["actions", "end", "--session-id", start.id, "--status", "completed"]);

    const detail = JSON.parse((await runCliInFixture(cwd, ["actions", "show", start.id])).stdout) as {
      session: { status: string };
      fileEvents: Array<{ filePath: string; linesAdded: number }>;
      commandEvents: Array<{ command: string; exitCode: number }>;
      decisions: Array<{ relatedMemoryIds: string[] }>;
      memoryUsage: Array<{ memoryId: string; usedInDecision: boolean }>;
      reflections: Array<{ testsRun: string[] }>;
    };

    expect(detail.session.status).toBe("completed");
    expect(detail.fileEvents[0]?.filePath).toBe("src/auth/middleware.ts");
    expect(detail.fileEvents[0]?.linesAdded).toBe(2);
    expect(detail.commandEvents[0]).toMatchObject({ command: "npm test", exitCode: 0 });
    expect(detail.decisions[0]?.relatedMemoryIds).toContain("mem-1");
    expect(detail.memoryUsage[0]).toMatchObject({ memoryId: "mem-1", usedInDecision: true });
    expect(detail.reflections[0]?.testsRun).toContain("npm test");
  });

  it("framework CLI detects project framework and writes default config", async () => {
    const cwd = await createFixtureProject();
    await writeFile(path.join(cwd, "next.config.ts"), "export default {};", "utf8");
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ name: "lmti-fixture", private: true, dependencies: { next: "latest", react: "latest" } }, null, 2),
      "utf8"
    );

    const result = JSON.parse((await runCliInFixture(cwd, ["framework", "detect", "--json"])).stdout) as {
      primaryFramework: string;
      packageManager?: string;
      evidence: string[];
    };

    expect(result.primaryFramework).toBe("nextjs");
    expect(result.evidence.join("\n")).toContain("next");
    await expect(readFile(path.join(cwd, ".lmti", "frameworks.yml"), "utf8")).resolves.toContain("confidence_threshold");
  });

  it("actions CLI redacts secret-like summaries and can render replay HTML", async () => {
    const cwd = await createFixtureProject();
    const rawSecret = "OPENAI_API_KEY=sk-proj-FAKE_TEST_VALUE_12345678901234567890";
    const startResult = await runCliInFixture(cwd, ["actions", "start", "--task", "Investigate leaked env"]);
    const start = JSON.parse(startResult.stdout) as { id: string };

    expect(start.id).toBeTruthy();

    const commandResult = await runCliInFixture(cwd, [
      "actions",
      "command",
      "--session-id",
      start.id,
      "--command",
      "npm test",
      "--exit-code",
      "0",
      "--output-summary",
      `test output contained ${rawSecret}`
    ]);
    const command = JSON.parse(commandResult.stdout) as { outputSummary?: string };

    expect(JSON.stringify(command)).not.toContain(rawSecret);
    expect(JSON.stringify(command)).toContain("REDACTED");

    const detailHtml = (await runCliInFixture(cwd, ["actions", "show", start.id, "--html"])).stdout;
    const replayHtml = (await runCliInFixture(cwd, ["actions", "replay", start.id, "--html"])).stdout;

    expect(detailHtml).toContain("<!doctype html>");
    expect(detailHtml).toContain("REDACTED");
    expect(detailHtml).not.toContain(rawSecret);
    expect(replayHtml).toContain("LMTI Codex Replay");
    expect(replayHtml).not.toContain(rawSecret);
  });
});
