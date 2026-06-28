import { describe, expect, it } from "vitest";
import type { AmfDocument } from "@atlas/types";
import { MindKernel, buildContextPack, inspectAmf, loadAmf } from "../src/index";

const amf: AmfDocument = {
  version: "0.0.1",
  generatedAt: "2026-06-28T00:00:00.000Z",
  project: {
    name: "NOIR ERP",
    root: "/project",
    compiledAt: "2026-06-28T00:00:00.000Z",
    atlasVersion: "0.0.0",
    amfVersion: "0.0.1",
    compiler: {
      name: "Knowledge Compiler v0",
      version: "0.1.0"
    },
    sourceBoundary: {
      root: "/project",
      ignoredDirectories: ["node_modules", ".git"],
      ignoredFiles: [".env"],
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
  api: [
    {
      id: "API-0001",
      name: "POST /packing/labels",
      kind: "http-route",
      source: "src/api/packing.ts:4",
      method: "POST",
      route: "/packing/labels",
      summary: "HTTP POST route declared in src/api/packing.ts.",
      confidence: "medium",
      privacy: "internal"
    }
  ],
  database: [
    {
      id: "DB-0001",
      name: "packing_labels",
      kind: "table",
      source: "database/schema.sql:1",
      summary: "Database table for packing labels.",
      confidence: "medium",
      privacy: "internal"
    }
  ],
  rules: [
    {
      id: "RULE-0001",
      text: "Packing label must include destination.",
      source: "README.md:1",
      confidence: "low"
    }
  ],
  risks: [
    {
      id: "RISK-0001",
      type: "secret",
      severity: "high",
      message: "Secret-like material detected and excluded from AMF content.",
      file: "src/packing/labels.ts",
      evidence: "secret-like pattern matched; value redacted",
      recommendation: "Move secrets to environment variables.",
      privacy: "protected"
    }
  ],
  history: [
    {
      id: "HISTORY-0001",
      kind: "compile",
      summary: "NOIR ERP compiled from 1 observed file.",
      confidence: "high",
      privacy: "internal"
    }
  ],
  architecture: [
    {
      id: "ARCH-0001",
      kind: "boundary",
      summary: "Module boundary src/packing owns packing label behavior.",
      source: "src/packing",
      confidence: "medium",
      privacy: "internal"
    }
  ],
  summaries: [],
  unresolvedQuestions: [
    {
      id: "QUESTION-0001",
      question: "Which packing invariants are not explicit in source or docs?",
      confidence: "low",
      privacy: "internal"
    }
  ]
};

describe("Mind Kernel", () => {
  it("loads and inspects AMF without knowing repository parsing details", () => {
    const loaded = loadAmf(JSON.stringify(amf));
    const stats = inspectAmf(loaded);

    expect(stats.project).toBe("NOIR ERP");
    expect(stats.api).toBe(1);
    expect(stats.database).toBe(1);
    expect(stats.architecture).toBe(1);
  });

  it("exposes context packs from AMF cognitive structures", () => {
    const kernel = new MindKernel(amf);
    const context = kernel.createContextPack("fix packing label bug");

    expect(context.kernel.name).toBe("Mind Kernel");
    expect(context.relatedModules[0]?.name).toBe("src/packing");
    expect(context.relatedApi[0]?.route).toBe("/packing/labels");
    expect(context.relatedDatabase[0]?.name).toBe("packing_labels");
    expect(context.knownRules[0]?.id).toBe("RULE-0001");
  });

  it("withholds protected risk evidence and excludes secret memory by default", () => {
    const context = buildContextPack(amf, "fix packing label bug", {
      memories: [
        {
          score: 5,
          record: {
            id: "mem-secret",
            scope: "long_term",
            kind: "system_note",
            title: "Secret packing credential",
            content: "Do not expose this secret.",
            projectId: "NOIR ERP",
            sourceRefs: [],
            tags: ["packing"],
            importance: 1,
            confidence: "high",
            sensitivity: "secret",
            createdAt: "2026-06-28T00:00:00.000Z",
            updatedAt: "2026-06-28T00:00:00.000Z",
            version: 1
          }
        }
      ]
    });

    expect(context.risks[0]?.evidence).toBe("Protected evidence withheld by Mind Kernel.");
    expect(context.relatedLongTermMemories).toHaveLength(0);
  });
});
