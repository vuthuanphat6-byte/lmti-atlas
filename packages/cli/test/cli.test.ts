import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMemory } from "@atlas/memory";
import { attachCodex, compileCommand, contextCommand, initCommand, thinkingExperimentCommand } from "../src/index";

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
});
