import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addProjectMemory,
  createShortMemoryNote,
  searchProjectMemory
} from "@atlas/memory";
import {
  prepareAgentContext,
  prepareCodexContext,
  reflectAfterTask,
  routeMindIntent,
  selectZonesForMindIntent
} from "../src/index";

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "atlas-mind-"));
}

describe("Mind Orchestrator", () => {
  it("detects security intent for dashboard 403 work", () => {
    const intent = routeMindIntent("fix partner dashboard permission 403");

    expect(intent.primary).toBe("security");
    expect(intent.secondary).toEqual(expect.arrayContaining(["code_fix", "erp_workflow"]));
  });

  it("detects memory_system intent for short memory work", () => {
    const intent = routeMindIntent("nang cap short memory dang note giay");

    expect(intent.primary).toBe("memory_system");
    expect(intent.secondary).toEqual(expect.arrayContaining(["feature_build"]));
  });

  it("selects zones from intent", () => {
    const zones = selectZonesForMindIntent({
      primary: "memory_system",
      secondary: ["feature_build", "database"],
      confidence: 0.9,
      keywords: []
    });

    expect(zones).toEqual(expect.arrayContaining(["architecture", "decision", "lesson", "codebase", "security"]));
  });

  it("prioritizes security guardrails for permission tasks", async () => {
    const cwd = await createWorkspace();
    const result = await prepareCodexContext({ task: "fix partner dashboard 403 permission", cwd });

    expect(result.contextPacket.guardrails.join("\n")).toContain("least privilege");
  });

  it("rejects logo and brand memory for dashboard 403 work", async () => {
    const cwd = await createWorkspace();
    await addProjectMemory(
      {
        title: "Partner dashboard 403 lesson",
        content: "Partner dashboard 403 can be expected under least privilege permission rules.",
        zone: "lesson",
        tags: ["partner", "dashboard", "403", "permission"],
        importance: 0.95
      },
      { cwd }
    );
    await addProjectMemory(
      {
        title: "Dashboard logo brand note",
        content: "Dashboard logo brand color should stay aligned.",
        zone: "codebase",
        tags: ["dashboard", "logo", "brand"],
        importance: 0.95
      },
      { cwd }
    );

    const result = await prepareCodexContext({ task: "fix partner dashboard 403 permission", cwd });

    expect(result.contextPacket.longMemory.map((memory) => memory.title)).toContain("Partner dashboard 403 lesson");
    expect(result.contextPacket.longMemory.map((memory) => memory.title)).not.toContain("Dashboard logo brand note");
    expect(result.rejectedMemory.some((memory) => memory.title === "Dashboard logo brand note")).toBe(true);
  });

  it("uses framework context to avoid unrelated framework memory", async () => {
    const cwd = await createWorkspace();
    await addProjectMemory(
      {
        title: "Next.js middleware auth lesson",
        content: "Next.js middleware.ts should guard app router auth routes.",
        zone: "codebase",
        tags: ["nextjs", "middleware", "auth"],
        importance: 0.98
      },
      { cwd }
    );
    await addProjectMemory(
      {
        title: "Laravel login middleware lesson",
        content: "Laravel login middleware lives in app/Http/Middleware and routes/web.php.",
        zone: "codebase",
        tags: ["laravel", "middleware", "auth", "artisan"],
        importance: 0.95
      },
      { cwd }
    );

    const result = await prepareAgentContext({
      cwd,
      task: "fix login middleware Laravel",
      frameworkContext: {
        primaryFramework: "laravel",
        secondaryFrameworks: [],
        language: "PHP",
        packageManager: "composer",
        isMonorepo: false,
        apps: [],
        confidence: 0.9,
        evidence: ["artisan found"]
      }
    });

    expect(result.framework?.primaryFramework).toBe("laravel");
    expect(result.contextPacket.longMemory.map((memory) => memory.title)).toContain("Laravel login middleware lesson");
    expect(result.contextPacket.longMemory.map((memory) => memory.title)).not.toContain("Next.js middleware auth lesson");
    expect(result.rejectedMemory.some((memory) => memory.reason.includes("nextjs"))).toBe(true);
  });

  it("rejects deployment memory for social content work", async () => {
    const cwd = await createWorkspace();
    await addProjectMemory(
      {
        title: "Production PM2 deploy flow",
        content: "Production deploy requires PM2 healthcheck, rollback and server verification.",
        zone: "deployment",
        tags: ["deploy", "production"],
        importance: 1
      },
      { cwd }
    );

    const result = await prepareCodexContext({ task: "write social post for sample-project", cwd });

    expect(result.contextPacket.longMemory.map((memory) => memory.title)).not.toContain("Production PM2 deploy flow");
    expect(result.rejectedMemory.some((memory) => memory.title === "Production PM2 deploy flow")).toBe(true);
  });

  it("does not include secret or do_not_prompt memory", async () => {
    const cwd = await createWorkspace();
    const rawSecret = "access_token=FAKE_TEST_TOKEN_VALUE_123456789012345678901234";
    await addProjectMemory(
      {
        title: "Secret dashboard token",
        content: `Never print this value. ${rawSecret}`,
        zone: "security",
        privacyLevel: "secret"
      },
      { cwd }
    );
    await addProjectMemory(
      {
        title: "Private key fixture",
        content: "PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----FAKE-----END RSA PRIVATE KEY-----",
        zone: "security",
        privacyLevel: "do_not_prompt"
      },
      { cwd }
    );

    const result = await prepareCodexContext({ task: "dashboard token permission", cwd, options: { includeReasoning: true } });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(rawSecret);
    expect(result.contextPacket.longMemory.map((memory) => memory.title)).not.toContain("Secret dashboard token");
    expect(result.contextPacket.longMemory.map((memory) => memory.title)).not.toContain("Private key fixture");
  });

  it("returns private memory as summary only", async () => {
    const cwd = await createWorkspace();
    await addProjectMemory(
      {
        title: "Private customer architecture",
        content: "Private customer note. Hidden raw implementation detail should not appear.",
        zone: "architecture",
        privacyLevel: "private",
        tags: ["customer", "architecture"],
        importance: 0.9
      },
      { cwd }
    );

    const result = await prepareCodexContext({ task: "customer architecture", cwd });
    const serialized = JSON.stringify(result.contextPacket);

    expect(serialized).toContain("Private customer architecture");
    expect(serialized).not.toContain("Hidden raw implementation detail");
  });

  it("respects context budget", async () => {
    const cwd = await createWorkspace();
    for (let index = 0; index < 8; index += 1) {
      await addProjectMemory(
        {
          title: `Permission lesson ${index}`,
          content: `Partner dashboard permission lesson ${index}. ${"Reusable least privilege context. ".repeat(20)}`,
          zone: "lesson",
          tags: ["partner", "permission", "403"],
          importance: 0.9
        },
        { cwd }
      );
    }

    const result = await prepareCodexContext({
      task: "partner dashboard permission 403",
      cwd,
      options: { maxContextChars: 900, maxLongMemories: 7 }
    });

    expect(JSON.stringify(result.contextPacket).length).toBeLessThanOrEqual(900);
    expect(result.rejectedMemory.some((memory) => memory.reason.includes("budget"))).toBe(true);
  });

  it("deduplicates near-identical memory", async () => {
    const cwd = await createWorkspace();
    for (let index = 0; index < 2; index += 1) {
      await addProjectMemory(
        {
          title: "Duplicate route rule",
          content: "Partner users must route through /partner under least privilege.",
          zone: "lesson",
          tags: ["partner", "route", "permission"],
          importance: 0.9
        },
        { cwd }
      );
    }

    const result = await prepareCodexContext({ task: "partner route permission", cwd });
    const selected = result.contextPacket.longMemory.filter((memory) => memory.title === "Duplicate route rule");

    expect(selected).toHaveLength(1);
    expect(result.rejectedMemory.some((memory) => memory.reason.includes("duplicate"))).toBe(true);
  });

  it("detects and warns about short versus long memory conflicts", async () => {
    const cwd = await createWorkspace();
    await addProjectMemory(
      {
        title: "Database decision",
        content: "Architecture decision: database should be PostgreSQL, not MongoDB.",
        zone: "decision",
        tags: ["database", "postgresql", "decision"],
        importance: 0.95
      },
      { cwd }
    );
    await createShortMemoryNote(
      {
        title: "Temporary database idea",
        content: "Current database task note: use MongoDB for current debug spike.",
        tags: ["database", "mongodb"],
        priority: "high"
      },
      { cwd }
    );

    const result = await prepareCodexContext({ task: "database decision mongodb postgres", cwd });

    expect(result.contextPacket.warnings.some((warning) => warning.includes("PostgreSQL"))).toBe(true);
  });

  it("keeps conflicting short and long memory visible for human review", async () => {
    const cwd = await createWorkspace();
    await addProjectMemory(
      {
        title: "Database platform decision",
        content: "Decision: PostgreSQL is the durable database platform for the project.",
        zone: "decision",
        tags: ["database", "postgresql"],
        importance: 0.95
      },
      { cwd }
    );
    await createShortMemoryNote(
      {
        title: "MongoDB investigation note",
        content: "Current database task note says MongoDB may be used for a temporary spike.",
        tags: ["database", "mongodb"],
        priority: "high"
      },
      { cwd }
    );

    const result = await prepareCodexContext({ task: "database mongodb postgresql decision", cwd });

    expect(result.contextPacket.shortMemory.some((memory) => memory.title === "MongoDB investigation note")).toBe(true);
    expect(result.contextPacket.longMemory.some((memory) => memory.title === "Database platform decision")).toBe(true);
  });

  it("adds deployment task hints", async () => {
    const cwd = await createWorkspace();
    const result = await prepareCodexContext({ task: "deploy production", cwd });

    expect(result.contextPacket.taskHints.join("\n")).toContain("healthcheck");
  });

  it("adds memory system task hints", async () => {
    const cwd = await createWorkspace();
    const result = await prepareCodexContext({ task: "upgrade short memory privacy gate", cwd });

    expect(result.contextPacket.taskHints.join("\n")).toContain("Privacy Gate");
  });

  it("reflects after task by proposing reusable lessons", async () => {
    const cwd = await createWorkspace();
    const durable = await reflectAfterTask({
      cwd,
      task: "fix dashboard 403 permission",
      summary: "Documented least privilege behavior.",
      bugsFound: ["403 was expected for partner under least privilege"],
      testsRun: ["npm test"]
    });
    const routine = await reflectAfterTask({
      cwd,
      task: "run tests",
      testsRun: ["npm test"]
    });

    const approvedMemory = await searchProjectMemory("dashboard 403 permission lesson", { cwd, privacyMode: "internal" });

    expect(durable.actions.some((action) => action.type === "lesson_candidate" && action.status === "created")).toBe(true);
    expect(approvedMemory.some((result) => result.item.sourceType === "lesson_candidate")).toBe(false);
    expect(routine.skipped.some((reason) => reason.includes("No reusable memory"))).toBe(true);
  });

  it("does not promote temporary short notes", async () => {
    const cwd = await createWorkspace();
    await createShortMemoryNote(
      {
        title: "Temporary scratch output",
        content: "Temporary one-time build output scratch note.",
        priority: "low"
      },
      { cwd }
    );

    const reflection = await reflectAfterTask({ cwd, task: "temporary scratch output" });

    expect(reflection.promotedShortMemories).toHaveLength(0);
    expect(reflection.actions.some((action) => action.type === "promotion" && action.status === "skipped")).toBe(true);
  });

  it("promotes important short notes into long memory", async () => {
    const cwd = await createWorkspace();
    const note = await createShortMemoryNote(
      {
        title: "Important permission lesson",
        content: "Remember important long-term lesson: partner dashboard 403 is a least privilege permission rule.",
        tags: ["partner", "permission", "lesson", "403"],
        priority: "critical"
      },
      { cwd }
    );

    const reflection = await reflectAfterTask({ cwd, task: "partner dashboard 403 permission lesson" });
    const longResults = await searchProjectMemory("partner dashboard 403 permission", { cwd, privacyMode: "internal" });

    expect(reflection.promotedShortMemories.some((entry) => entry.noteId === note.id)).toBe(true);
    expect(longResults.some((result) => result.item.source === `short-memory:${note.id}`)).toBe(true);
  });

  it("explain output does not leak secret material", async () => {
    const cwd = await createWorkspace();
    const rawSecret = "OPENAI_API_KEY=sk-proj-FAKE_TEST_VALUE_12345678901234567890";
    await addProjectMemory(
      {
        title: "Secret deployment key",
        content: `Never expose ${rawSecret}`,
        zone: "security",
        privacyLevel: "secret"
      },
      { cwd }
    );

    const result = await prepareCodexContext({
      task: "explain deployment security context",
      cwd,
      options: { includeReasoning: true }
    });

    expect(JSON.stringify(result)).not.toContain(rawSecret);
  });
});
