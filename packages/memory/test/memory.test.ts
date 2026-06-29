import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readAuditEvents } from "@atlas/privacy";
import {
  consolidateMemory,
  createMemory,
  decayMemory,
  decayMemoryLifecycle,
  encodeMemory,
  explainMemory,
  getMemoryAssociations,
  InMemoryStore,
  listMemory,
  LongTermMemory,
  promoteMemory,
  recordTaskDone,
  reinforceMemory,
  searchMemory,
  searchMemoryForContext,
  ShortTermMemory
} from "../src/index";
import type { InferredIntent } from "@atlas/types";

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "atlas-memory-"));
}

const permissionIntent: InferredIntent = {
  primaryIntent: "permission",
  secondaryIntents: ["partner", "dashboard", "api"],
  keywords: ["partner", "403", "dashboard", "summary", "least privilege", "route"],
  negativeKeywords: ["logo", "ui asset"],
  confidence: 0.9
};

describe("Memory Core MVP-2", () => {
  it("creates, lists and searches structured memory", async () => {
    const cwd = await createWorkspace();
    const memory = await createMemory(
      {
        scope: "long_term",
        kind: "rule",
        title: "Packing label rule",
        content: "A shipping label can only be printed when all products in the same label group are completed.",
        projectId: "NOIR ERP",
        sourceRefs: ["README.md:1"],
        tags: ["packing", "label"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );

    expect((await listMemory("long_term", { cwd })).map((record) => record.id)).toContain(memory.id);
    const results = await searchMemory("packing label", { cwd });
    expect(results[0]?.record.id).toBe(memory.id);
  });

  it("promotes short-term memory to long-term memory", async () => {
    const cwd = await createWorkspace();
    const memory = await createMemory(
      {
        scope: "short_term",
        kind: "task",
        title: "Fix packing label bug",
        content: "Active task context for packing labels.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["packing"],
        importance: 0.7,
        confidence: "medium",
        sensitivity: "internal"
      },
      { cwd }
    );

    const promoted = await promoteMemory(memory.id, { cwd });

    expect(promoted.scope).toBe("long_term");
    expect(promoted.expiresAt).toBeUndefined();
    expect(await listMemory("short_term", { cwd })).toHaveLength(0);
    expect(await listMemory("long_term", { cwd })).toHaveLength(1);
  });

  it("decays expired short-term memory", async () => {
    const cwd = await createWorkspace();
    const now = new Date("2026-06-27T00:00:00.000Z");
    await createMemory(
      {
        scope: "short_term",
        kind: "task",
        title: "Temporary context",
        content: "This should expire.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: [],
        importance: 0.4,
        confidence: "low",
        sensitivity: "internal",
        expiresAt: "2026-06-27T00:00:01.000Z"
      },
      { cwd, now }
    );

    const removed = await decayMemory({ cwd, now: new Date("2026-06-27T00:00:02.000Z") });

    expect(removed).toBe(1);
    expect(await listMemory("short_term", { cwd })).toHaveLength(0);
  });

  it("applies privacy policy to search and audits sensitive access", async () => {
    const cwd = await createWorkspace();
    await createMemory(
      {
        scope: "long_term",
        kind: "risk",
        title: "Payment secret",
        content: "Stripe key: sk_test_123456789",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["payment"],
        importance: 1,
        confidence: "high",
        sensitivity: "secret"
      },
      { cwd }
    );

    expect(await searchMemory("payment", { cwd })).toHaveLength(0);

    const ownerResults = await searchMemory("payment", {
      cwd,
      includeSecret: true,
      privacyContext: {
        role: "owner",
        projectId: "NOIR ERP",
        purpose: "test",
        includeSecret: true,
        includeRaw: true,
        command: "memory search",
        timestamp: "2026-06-27T00:00:00.000Z"
      }
    });

    expect(ownerResults[0]?.record.content).toContain("sk_test_123456789");
    expect((await readAuditEvents(cwd)).some((event) => event.sensitivity === "secret")).toBe(true);
  });

  it("supports runtime short-term and long-term in-memory stores", async () => {
    const store = new InMemoryStore();
    const shortTerm = new ShortTermMemory(store, { projectId: "NOIR" });
    const longTerm = new LongTermMemory(store, { projectId: "NOIR" });

    await shortTerm.add({
      title: "Active task",
      content: "Fix packing label bug",
      tags: ["packing"]
    });
    await longTerm.add({
      title: "Packing rule",
      content: "Label printing needs completed products",
      tags: ["packing"],
      importance: 0.9
    });

    expect(await shortTerm.list()).toHaveLength(1);
    expect(await longTerm.search("packing label")).toHaveLength(1);

    await shortTerm.clear();
    expect(await shortTerm.list()).toHaveLength(0);
    expect(await longTerm.list()).toHaveLength(1);
  });

  it("summarizes internal memory by default and filters unrelated logo memory", async () => {
    const cwd = await createWorkspace();
    await createMemory(
      {
        scope: "long_term",
        kind: "lesson",
        title: "Partner route rule",
        content: "Partner user must route to /partner. /dashboard/summary returning 403 is correct due to least privilege.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["partner", "routing", "permission", "dashboard"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "internal",
        promptPolicy: "summarize_only"
      },
      { cwd }
    );
    await createMemory(
      {
        scope: "long_term",
        kind: "lesson",
        title: "Dashboard logo rule",
        content: "Dashboard logo brand image asset must stay aligned.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["dashboard", "logo", "brand", "asset"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "internal",
        promptPolicy: "summarize_only"
      },
      { cwd }
    );

    const result = await searchMemoryForContext("partner user bị 403 dashboard summary", { cwd, taskIntent: permissionIntent });

    expect(result.results.map((entry) => entry.record.title)).toContain("Partner route rule");
    expect(result.results.map((entry) => entry.record.title)).not.toContain("Dashboard logo rule");
    expect(result.results[0]?.mode).toBe("summary");
    expect(JSON.stringify(result.results)).not.toContain("/dashboard/summary returning 403 is correct");
  });

  it("excludes secret and do_not_prompt memory from context and writes privacy audit", async () => {
    const cwd = await createWorkspace();
    await createMemory(
      {
        scope: "long_term",
        kind: "risk",
        title: "Secret dashboard token",
        content: "token=super-secret-dashboard-value",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["dashboard", "secret"],
        importance: 1,
        confidence: "high",
        sensitivity: "secret",
        promptPolicy: "do_not_prompt"
      },
      { cwd }
    );

    const result = await searchMemoryForContext("show secrets", {
      cwd,
      taskIntent: {
        primaryIntent: "privacy",
        secondaryIntents: [],
        keywords: ["secret", "privacy"],
        negativeKeywords: [],
        confidence: 0.7
      }
    });

    expect(result.results).toHaveLength(0);
    const audit = await readFile(path.join(cwd, ".lmti", "logs", "privacy-audit.jsonl"), "utf8");
    expect(audit).toContain("do_not_prompt memory filtered");
    expect(audit).not.toContain("super-secret-dashboard-value");
  });

  it("blocks confidential raw context and records a task lesson", async () => {
    const cwd = await createWorkspace();
    await createMemory(
      {
        scope: "long_term",
        kind: "risk",
        title: "Confidential permission note",
        content: "Confidential permission incident detail.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["permission"],
        importance: 0.8,
        confidence: "high",
        sensitivity: "confidential",
        promptPolicy: "allow_raw"
      },
      { cwd }
    );

    const confidential = await searchMemoryForContext("permission incident", {
      cwd,
      taskIntent: permissionIntent,
      includeRaw: true,
      privacyContext: {
        role: "owner",
        projectId: "NOIR ERP",
        purpose: "test",
        includeSecret: false,
        includeRaw: true,
        command: "context",
        timestamp: "2026-06-28T00:00:00.000Z"
      }
    });

    expect(confidential.results[0]?.mode).toBe("summary");
    expect(JSON.stringify(confidential.results)).not.toContain("Confidential permission incident detail.");

    const task = await recordTaskDone(
      {
        title: "Partner route fix",
        summary: "Documented partner routing behavior.",
        lesson: "Partner users must route to /partner.",
        projectId: "NOIR ERP",
        taskIntent: permissionIntent
      },
      { cwd }
    );
    expect(task.lessonMemory?.kind).toBe("lesson");
    const taskLog = await readFile(path.join(cwd, ".lmti", "events", "tasks.jsonl"), "utf8");
    expect(taskLog).toContain("Partner route fix");
  });

  it("encodes high-priority operational memories with lifecycle defaults", () => {
    const encoded = encodeMemory(
      {
        kind: "deploy_note",
        title: "Production deploy permission rule",
        content: "Production deploy requires least-privilege permission review and rollback note.",
        tags: ["deploy", "permission"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "internal",
        sourceRefs: ["docs/deploy.md:12"]
      },
      { manualRemember: true }
    );

    expect(encoded.priorityScore).toBeGreaterThan(0.7);
    expect(encoded.memoryStrength).toBeGreaterThan(80);
    expect(encoded.contextCues).toEqual(expect.arrayContaining(["deploy", "permission"]));
    expect(encoded.promptPolicy).toBe("summarize_only");
    expect(encoded.privacySafeSummary).toContain("Production deploy permission rule");
  });

  it("consolidates short-term lessons above threshold and skips secret raw content", async () => {
    const cwd = await createWorkspace();
    await createMemory(
      {
        scope: "short_term",
        kind: "task",
        title: "Partner route debugging lesson",
        content: "Task done lesson: Partner user must route to /partner after permission checks.",
        projectId: "NOIR ERP",
        sourceRefs: ["task-123"],
        tags: ["partner", "routing", "permission"],
        importance: 0.95,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );
    await createMemory(
      {
        scope: "short_term",
        kind: "risk",
        title: "Fake secret fixture",
        content: "token=FAKE_TEST_TOKEN_VALUE",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["secret"],
        importance: 1,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );

    const result = await consolidateMemory({ cwd });

    expect(result.created).toHaveLength(1);
    expect(result.skipped.some((entry) => entry.reason.includes("secret"))).toBe(true);
    expect((await listMemory("long_term", { cwd })).some((record) => record.title.includes("Partner route"))).toBe(true);
    expect((await listMemory("short_term", { cwd, privacyContext: { role: "owner", projectId: "NOIR ERP", purpose: "test", includeSecret: true, includeRaw: true, command: "memory list", timestamp: "2026-06-29T00:00:00.000Z" } })).some((record) => record.title.includes("Fake secret"))).toBe(true);
  });

  it("decays old weak memory without over-decaying durable rules", async () => {
    const cwd = await createWorkspace();
    const old = new Date("2026-01-01T00:00:00.000Z");
    const weak = await createMemory(
      {
        scope: "long_term",
        kind: "system_note",
        title: "Temporary UI note",
        content: "A low confidence note that should fade.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["ui"],
        importance: 0.2,
        confidence: "low",
        sensitivity: "internal",
        memoryStrength: 2,
        baseActivation: 1,
        decayRate: 0.3
      },
      { cwd, now: old }
    );
    const durable = await createMemory(
      {
        scope: "long_term",
        kind: "permission",
        title: "Partner permission invariant",
        content: "Partner users must not gain admin dashboard access.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["partner", "permission"],
        importance: 1,
        confidence: "high",
        sensitivity: "internal",
        memoryStrength: 2,
        baseActivation: 1,
        decayRate: 0.3
      },
      { cwd, now: old }
    );

    const report = await decayMemoryLifecycle({ cwd, now: new Date("2026-06-01T00:00:00.000Z") });
    const records = await listMemory("long_term", { cwd, privacyContext: { role: "owner", projectId: "NOIR ERP", purpose: "test", includeSecret: false, includeRaw: true, command: "memory list", timestamp: "2026-06-01T00:00:00.000Z" } });
    const weakAfter = records.find((record) => record.id === weak.id);
    const durableAfter = records.find((record) => record.id === durable.id);

    expect(report.updatedLongTerm).toBeGreaterThan(0);
    expect(weakAfter?.status).toBe("archived");
    expect(durableAfter?.status).toBe("active");
    expect(durableAfter?.baseActivation).toBeGreaterThanOrEqual(0.8);
  });

  it("reinforces success and failure differently", async () => {
    const cwd = await createWorkspace();
    const memory = await createMemory(
      {
        scope: "long_term",
        kind: "lesson",
        title: "Permission debugging lesson",
        content: "Use least privilege when debugging partner permissions.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["permission"],
        importance: 0.8,
        confidence: "medium",
        sensitivity: "internal"
      },
      { cwd }
    );

    const success = await reinforceMemory(memory.id, { cwd, success: true, now: new Date("2026-06-28T00:00:00.000Z") });
    const failed = await reinforceMemory(memory.id, { cwd, success: false, now: new Date("2026-06-29T00:00:00.000Z") });

    expect(success.memory.retrievalCount).toBe((memory.retrievalCount ?? 0) + 1);
    expect(success.memory.memoryStrength).toBeGreaterThan(memory.memoryStrength ?? 0);
    expect(failed.memory.confidence).toBe("low");
    expect(failed.memory.status).toBe("weak");
  });

  it("marks superseded memory as history and excludes it from context", async () => {
    const cwd = await createWorkspace();
    const old = await createMemory(
      {
        scope: "long_term",
        kind: "route",
        title: "Partner route rule",
        content: "Partner user must route to /partner.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["partner", "routing"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );
    const next = await createMemory(
      {
        scope: "long_term",
        kind: "route",
        title: "Partner route rule v2",
        content: "Partner user now routes to /partner-v2 instead of /partner.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["partner", "routing"],
        importance: 1,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );

    const oldAfter = await listMemory("long_term", { cwd }).then((records) => records.find((record) => record.id === old.id));
    const context = await searchMemoryForContext("partner route", { cwd, taskIntent: { primaryIntent: "routing", secondaryIntents: ["partner"], keywords: ["partner", "route"], negativeKeywords: [], confidence: 0.9 } });

    expect(oldAfter?.status).toBe("superseded");
    expect(oldAfter?.supersededBy).toBe(next.id);
    expect(context.results.map((entry) => entry.record.id)).not.toContain(old.id);
    expect(context.results.map((entry) => entry.record.id)).toContain(next.id);
  });

  it("strengthens associations when memories are co-retrieved", async () => {
    const cwd = await createWorkspace();
    const route = await createMemory(
      {
        scope: "long_term",
        kind: "route",
        title: "Partner route",
        content: "Partner traffic routes through /partner.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["partner", "routing", "permission"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );
    const permission = await createMemory(
      {
        scope: "long_term",
        kind: "permission",
        title: "Partner permission",
        content: "Partner role has least-privilege dashboard access.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["partner", "permission", "routing"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );

    await searchMemoryForContext("partner permission route", { cwd, taskIntent: permissionIntent, includeLowScore: true });
    const associations = await getMemoryAssociations(route.id, { cwd });

    expect(associations.some((association) => association.targetMemoryId === permission.id && association.weight > 0)).toBe(true);
  });

  it("explains selected and filtered memory without raw secret leakage", async () => {
    const cwd = await createWorkspace();
    await createMemory(
      {
        scope: "long_term",
        kind: "permission",
        title: "Partner permission rule",
        content: "Partner user must route to /partner.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["partner", "permission"],
        importance: 0.9,
        confidence: "high",
        sensitivity: "internal"
      },
      { cwd }
    );
    await createMemory(
      {
        scope: "long_term",
        kind: "risk",
        title: "Secret fixture",
        content: "token=FAKE_TEST_TOKEN_VALUE",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["partner", "permission"],
        importance: 1,
        confidence: "high",
        sensitivity: "secret"
      },
      { cwd }
    );

    const explanation = await explainMemory("partner permission", { cwd, taskIntent: permissionIntent });

    expect(explanation.selected[0]?.title).toBe("Partner permission rule");
    expect(explanation.selected[0]?.activation).toBeGreaterThan(0);
    expect(explanation.filteredOut.some((entry) => entry.privacyDecision.includes("secret"))).toBe(true);
    expect(JSON.stringify(explanation)).not.toContain("FAKE_TEST_TOKEN_VALUE");
  });

  it("summarizes internal memory for external model role instead of sending raw content", async () => {
    const cwd = await createWorkspace();
    await createMemory(
      {
        scope: "long_term",
        kind: "lesson",
        title: "Internal route note",
        content: "Internal implementation detail that external models must not receive raw.",
        projectId: "NOIR ERP",
        sourceRefs: [],
        tags: ["routing"],
        importance: 0.8,
        confidence: "high",
        sensitivity: "internal",
        promptPolicy: "allow_raw"
      },
      { cwd }
    );

    const result = await searchMemoryForContext("route note", {
      cwd,
      taskIntent: { primaryIntent: "routing", secondaryIntents: [], keywords: ["route", "note"], negativeKeywords: [], confidence: 0.8 },
      includeRaw: true,
      privacyContext: {
        role: "external_model",
        projectId: "NOIR ERP",
        purpose: "test",
        includeSecret: false,
        includeRaw: true,
        command: "context",
        timestamp: "2026-06-29T00:00:00.000Z"
      }
    });

    expect(result.results[0]?.mode).toBe("summary");
    expect(JSON.stringify(result.results)).not.toContain("Internal implementation detail");
  });
});
