import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeCodexRisk,
  analyzeCodexRiskWithFramework,
  endCodexSession,
  evaluateCodexScope,
  getCodexActionStats,
  getCodexReplay,
  getCodexSessionDetail,
  initCodexActionViewStorage,
  listCodexRiskItems,
  listCodexSessions,
  logCodexAction,
  logCodexCommandEvent,
  logCodexDecision,
  logCodexFileEvent,
  logCodexMemoryUsage,
  logCodexReflection,
  renderCodexActionDashboardHtml,
  renderCodexSessionDetailHtml,
  startCodexSession
} from "../src/index";

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "atlas-actions-"));
}

describe("Codex Action View", () => {
  it("creates codex session storage and starts a session", async () => {
    const cwd = await createWorkspace();
    const storage = await initCodexActionViewStorage(cwd);
    const session = await startCodexSession({ cwd, task: "Fix dashboard 403", branch: "main" });

    expect(storage.dbPath.endsWith("codex-actions.sqlite")).toBe(true);
    expect(session.status).toBe("running");
    expect(session.intent).toBe("security");
  });

  it("logs action timeline", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Fix dashboard 403" });
    await logCodexAction({
      cwd,
      sessionId: session.id,
      actionType: "decision_made",
      title: "Decided to inspect auth middleware",
      detail: "Need source evidence before changing route."
    });

    const detail = await getCodexSessionDetail(session.id, { cwd });
    expect(detail.timeline.map((action) => action.title)).toContain("Decided to inspect auth middleware");
  });

  it("logs file read and modified events", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Fix dashboard 403" });
    await logCodexFileEvent({ cwd, sessionId: session.id, filePath: "src/auth/middleware.ts", eventType: "read" });
    const modified = await logCodexFileEvent({
      cwd,
      sessionId: session.id,
      filePath: "src/auth/middleware.ts",
      eventType: "modified",
      beforeContent: "export const allow = false;\n",
      afterContent: "export const allow = true;\n"
    });

    const detail = await getCodexSessionDetail(session.id, { cwd });
    expect(detail.fileEvents).toHaveLength(2);
    expect(modified.linesAdded).toBe(1);
    expect(modified.linesRemoved).toBe(1);
  });

  it("logs command and exit code", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Run tests" });
    const command = await logCodexCommandEvent({ cwd, sessionId: session.id, command: "npm test", exitCode: 0, durationMs: 1200, output: "tests passed" });

    expect(command.exitCode).toBe(0);
    expect(command.outputSummary).toContain("tests passed");
  });

  it("marks dangerous command as critical risk", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Clean project" });
    const command = await logCodexCommandEvent({ cwd, sessionId: session.id, command: "git reset --hard", exitCode: 0 });

    expect(command.riskLevel).toBe("critical");
    const detail = await getCodexSessionDetail(session.id, { cwd });
    expect(detail.timeline.some((action) => action.actionType === "risk_warning")).toBe(true);
  });

  it("marks dangerous files as high risk", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Edit config" });
    const file = await logCodexFileEvent({ cwd, sessionId: session.id, filePath: ".env.production", eventType: "modified" });

    expect(file.riskLevel).toBe("critical");
  });

  it("scope guard detects out-of-scope edits", () => {
    const result = evaluateCodexScope({
      task: "write social post",
      intendedFiles: ["content/post.md"],
      touchedFiles: ["content/post.md", "src/auth/middleware.ts"],
      commandsRun: []
    });

    expect(result.scopeStatus).not.toBe("inside_scope");
    expect(result.warnings.join("\n")).toContain("auth");
  });

  it("risk analyzer raises risk for auth/database/deploy edits", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Fix permission" });
    const auth = await logCodexFileEvent({ cwd, sessionId: session.id, filePath: "src/auth/middleware.ts", eventType: "modified" });
    const db = await logCodexFileEvent({ cwd, sessionId: session.id, filePath: "database/migrations/001.sql", eventType: "modified" });
    const deploy = await logCodexFileEvent({ cwd, sessionId: session.id, filePath: "Dockerfile", eventType: "modified" });
    const risk = analyzeCodexRisk({ task: session.task, actions: [], fileEvents: [auth, db, deploy], commandEvents: [], decisions: [] });

    expect(risk.riskLevel).toBe("high");
    expect(risk.requiredVerification.length).toBeGreaterThan(0);
  });

  it("framework-aware risk analyzer adds adapter verification", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Add Laravel migration" });
    const migration = await logCodexFileEvent({ cwd, sessionId: session.id, filePath: "database/migrations/2026_01_01_create_users.php", eventType: "modified" });
    const risk = await analyzeCodexRiskWithFramework({
      cwd,
      task: session.task,
      actions: [],
      fileEvents: [migration],
      commandEvents: [],
      decisions: [],
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

    expect(risk.riskLevel).toBe("high");
    expect(risk.requiredVerification.join("\n")).toContain("migration");
    expect(risk.requiredVerification.join("\n")).toContain("php artisan");
  });

  it("links memory usage to session", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Use memory" });
    await logCodexMemoryUsage({ cwd, sessionId: session.id, memoryId: "mem-1", memoryType: "long", reason: "least privilege lesson", usedInDecision: true });

    const detail = await getCodexSessionDetail(session.id, { cwd });
    expect(detail.memoryUsage[0]?.memoryId).toBe("mem-1");
    expect(detail.memoryUsage[0]?.usedInDecision).toBe(true);
  });

  it("links decision log to memory and file", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Decide route" });
    await logCodexDecision({
      cwd,
      sessionId: session.id,
      decision: "Do not bypass role guard",
      reason: "Least privilege memory says 403 is expected.",
      relatedFiles: ["src/auth/middleware.ts"],
      relatedMemoryIds: ["mem-1"],
      confidence: 0.9
    });

    const detail = await getCodexSessionDetail(session.id, { cwd });
    expect(detail.decisions[0]?.relatedFiles).toContain("src/auth/middleware.ts");
    expect(detail.decisions[0]?.relatedMemoryIds).toContain("mem-1");
  });

  it("tracks reflection lessons, notes and memory ids", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Finish task" });
    await logCodexReflection({
      cwd,
      sessionId: session.id,
      taskSummary: "Fixed route safely.",
      lessonsCreated: ["lesson-1"],
      shortNotesCreated: ["short-1"],
      longMemoriesCreated: ["long-1"],
      risksRemaining: ["manual QA needed"]
    });

    const detail = await getCodexSessionDetail(session.id, { cwd });
    expect(detail.reflections[0]?.lessonsCreated).toContain("lesson-1");
    expect(detail.reflections[0]?.risksRemaining).toContain("manual QA needed");
  });

  it("renders session list dashboard html", async () => {
    const cwd = await createWorkspace();
    await startCodexSession({ cwd, task: "Fix dashboard 403" });
    const html = renderCodexActionDashboardHtml({
      stats: await getCodexActionStats({ cwd }),
      sessions: await listCodexSessions({ cwd })
    });

    expect(html).toContain("LMTI Codex Action View");
    expect(html).toContain("Fix dashboard 403");
  });

  it("renders session detail with timeline files commands and decisions", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Fix dashboard 403" });
    await logCodexFileEvent({ cwd, sessionId: session.id, filePath: "src/auth/middleware.ts", eventType: "modified" });
    await logCodexCommandEvent({ cwd, sessionId: session.id, command: "npm test", exitCode: 0 });
    await logCodexDecision({ cwd, sessionId: session.id, decision: "Keep least privilege", relatedFiles: ["src/auth/middleware.ts"] });

    const html = renderCodexSessionDetailHtml(await getCodexSessionDetail(session.id, { cwd }));

    expect(html).toContain("Timeline");
    expect(html).toContain("src/auth/middleware.ts");
    expect(html).toContain("npm test");
    expect(html).toContain("Keep least privilege");
  });

  it("UI and API sanitizers do not expose raw secrets", async () => {
    const cwd = await createWorkspace();
    const rawSecret = "OPENAI_API_KEY=sk-proj-FAKE_TEST_VALUE_12345678901234567890";
    const session = await startCodexSession({ cwd, task: `Investigate secret ${rawSecret}` });
    await logCodexCommandEvent({ cwd, sessionId: session.id, command: "npm test", output: `leaked ${rawSecret}` });
    await logCodexFileEvent({ cwd, sessionId: session.id, filePath: ".env", eventType: "modified", diffSummary: `secret ${rawSecret}` });
    const detail = await getCodexSessionDetail(session.id, { cwd });
    const html = renderCodexSessionDetailHtml(detail);

    expect(JSON.stringify(detail)).not.toContain(rawSecret);
    expect(html).not.toContain(rawSecret);
  });

  it("replay returns timeline in order", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Replay task" });
    await logCodexAction({ cwd, sessionId: session.id, actionType: "file_read", title: "Read file" });
    await logCodexAction({ cwd, sessionId: session.id, actionType: "decision_made", title: "Made decision" });

    const replay = await getCodexReplay(session.id, { cwd });

    expect(replay.map((step) => step.action.title)).toEqual(expect.arrayContaining(["Task received", "Read file", "Made decision"]));
    expect(replay[0]?.index).toBe(0);
  });

  it("flags sessions without tests", async () => {
    const cwd = await createWorkspace();
    const session = await startCodexSession({ cwd, task: "Modify auth" });
    await logCodexFileEvent({ cwd, sessionId: session.id, filePath: "src/auth/middleware.ts", eventType: "modified" });
    await endCodexSession({ cwd, sessionId: session.id, status: "completed", summary: "Done without tests" });
    const stats = await getCodexActionStats({ cwd });

    expect(stats.sessionsWithoutTests).toBe(1);
    const risks = await listCodexRiskItems({ cwd });
    expect(risks.some((item) => item.sessionId === session.id)).toBe(true);
  });
});
