import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readAuditEvents } from "@atlas/privacy";
import {
  createMemory,
  decayMemory,
  InMemoryStore,
  listMemory,
  LongTermMemory,
  promoteMemory,
  searchMemory,
  ShortTermMemory
} from "../src/index";

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "atlas-memory-"));
}

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
});
