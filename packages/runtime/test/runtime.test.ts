import { describe, expect, it } from "vitest";
import type { AmfDocument } from "@atlas/types";
import { createDefaultRuntime, buildContextPack, inspectAmf } from "../src/index";

const amf: AmfDocument = {
  version: "0.0.1",
  generatedAt: "2026-06-27T00:00:00.000Z",
  project: {
    name: "Sample Project",
    root: "/project",
    compiledAt: "2026-06-27T00:00:00.000Z",
    atlasVersion: "0.0.0",
    amfVersion: "0.0.1",
    compiler: {
      name: "Knowledge Compiler v0",
      version: "0.1.0"
    },
    sourceBoundary: {
      root: "/project",
      ignoredDirectories: ["node_modules", ".git"],
      maxFileBytes: 1048576
    },
    checksum: "test-checksum"
  },
  modules: [
    {
      name: "src/packing",
      path: "src/packing",
      files: ["src/packing/labels.ts"],
      symbols: ["printPackingLabel"],
      dependencies: [],
      summary: "Packing label module.",
      confidence: "medium"
    }
  ],
  files: [
    {
      path: "src/packing/labels.ts",
      extension: ".ts",
      kind: "source",
      module: "src/packing",
      sizeBytes: 120,
      lines: 5,
      hash: "file-hash",
      summary: "Source file for packing labels.",
      privacy: "internal",
      riskFlags: []
    }
  ],
  symbols: [],
  dependencies: [],
  rules: [
    {
      id: "RULE-0001",
      text: "Packing label must include destination.",
      source: "README.md:1",
      confidence: "low"
    }
  ],
  risks: [],
  summaries: []
};

describe("Runtime MVP-0", () => {
  it("inspects AMF stats", () => {
    expect(inspectAmf(amf)).toMatchObject({
      project: "Sample Project",
      files: 1,
      modules: 1,
      rules: 1
    });
  });

  it("builds a context pack from task keywords", () => {
    const context = buildContextPack(amf, "fix packing label bug");

    expect(context.relatedModules[0]?.name).toBe("src/packing");
    expect(context.relatedFiles[0]?.path).toBe("src/packing/labels.ts");
    expect(context.knownRules[0]?.id).toBe("RULE-0001");
  });

  it("excludes secret memory by default and includes relevant long-term memory", () => {
    const context = buildContextPack(amf, "fix packing label bug", {
      memories: [
        {
          score: 4,
          record: {
            id: "mem-long",
            scope: "long_term",
            kind: "rule",
            title: "Packing label rule",
            content: "A shipping label can only be printed when all products are completed.",
            projectId: "Sample Project",
            sourceRefs: [],
            tags: ["packing", "label"],
            importance: 0.9,
            confidence: "high",
            sensitivity: "internal",
            createdAt: "2026-06-27T00:00:00.000Z",
            updatedAt: "2026-06-27T00:00:00.000Z",
            version: 1
          }
        },
        {
          score: 5,
          record: {
            id: "mem-secret",
            scope: "long_term",
            kind: "system_note",
            title: "Secret packing credential",
            content: "Do not expose this secret.",
            projectId: "Sample Project",
            sourceRefs: [],
            tags: ["packing"],
            importance: 1,
            confidence: "high",
            sensitivity: "secret",
            createdAt: "2026-06-27T00:00:00.000Z",
            updatedAt: "2026-06-27T00:00:00.000Z",
            version: 1
          }
        }
      ]
    });

    expect(context.relatedLongTermMemories.map((memory) => memory.id)).toContain("mem-long");
    expect(context.relatedLongTermMemories.map((memory) => memory.id)).not.toContain("mem-secret");
  });

  it("runs a CoreRuntime message through agent, memory, tool and security", async () => {
    const runtime = createDefaultRuntime();
    const session = runtime.startSession({ agentId: "developer" });

    await runtime.sendMessage(session.id, "Remember that this project needs a label printing module.");
    const result = await runtime.sendMessage(session.id, "What module does this project need?");
    const toolResult = await runtime.execute(session.id, "echo", { message: "audit smoke" });

    expect(result.response.message).toContain("label printing module");
    expect(toolResult.ok).toBe(true);
    expect(await runtime.getShortTermMemory().list()).toHaveLength(2);
    expect(await runtime.getLongTermMemory().list()).toHaveLength(1);
    expect(runtime.getSecurityGuard().getAuditLogs().length).toBeGreaterThan(0);
  });

  it("blocks tools when permission is not allowed", async () => {
    const runtime = createDefaultRuntime();
    runtime.registerTool({
      name: "danger.admin",
      description: "Blocked test tool",
      permissionRequired: "admin",
      async execute() {
        return { ok: true };
      }
    });
    const session = runtime.startSession({ agentId: "developer" });

    const result = await runtime.execute(session.id, "danger.admin", {});

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("supports the memory/security acceptance dialogue", async () => {
    const runtime = createDefaultRuntime();
    const session = runtime.startSession({ agentId: "developer" });

    const saved = await runtime.sendMessage(session.id, "Remember that this repository is a sample packing workflow.");
    expect(saved.response.message).toContain("Saved to memory");

    const recalled = await runtime.sendMessage(session.id, "What kind of project is this repository?");
    expect(recalled.response.message).toContain("sample packing workflow");

    const audit = await runtime.sendMessage(session.id, "Read the audit log.");
    expect(audit.response.message).toContain("Security approved");
    expect(audit.response.message).toContain("Audit log");

    const blocked = await runtime.sendMessage(session.id, "Delete the entire database.");
    expect(blocked.response.message).toContain("Security blocked");
    expect(blocked.response.message).toContain("admin/database");
  });
});
