import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileProject } from "../src/index";

const compilerSecretFixture = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz123456"].join("-");

async function createFixtureProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-compiler-"));
  await mkdir(path.join(root, "src", "orders"), { recursive: true });
  await mkdir(path.join(root, "src", "labels"), { recursive: true });
  await mkdir(path.join(root, "src", "api"), { recursive: true });
  await mkdir(path.join(root, "database"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "ignored"), { recursive: true });

  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "fixture-project",
        private: true,
        dependencies: {
          zod: "^3.24.2"
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(root, "README.md"),
    "# Fixture Project\n\nBusiness rule: packing labels must include destination.\n",
    "utf8"
  );

  await writeFile(
    path.join(root, "src", "orders", "packing.ts"),
    [
      'import { printPackingLabel } from "../labels/printer";',
      "",
      "export function packOrder(destination: string): string {",
      "  return printPackingLabel(destination);",
      "}"
    ].join("\n"),
    "utf8"
  );

  const secretName = "api" + "_key";
  await writeFile(
    path.join(root, "src", "labels", "printer.ts"),
    [
      `const ${secretName} = "dummy-value-for-redaction-test";`,
      "",
      "export function printPackingLabel(destination: string): string {",
      '  return `DEST=${destination}`;',
      "}"
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    path.join(root, "src", "api", "packing.ts"),
    [
      "export function registerPackingRoutes(router: { post(path: string, handler: unknown): void }): void {",
      '  router.post("/packing/labels", printPackingLabel);',
      "}"
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    path.join(root, "database", "schema.sql"),
    [
      "CREATE TABLE packing_labels (",
      "  id INTEGER PRIMARY KEY,",
      "  destination TEXT NOT NULL",
      ");"
    ].join("\n"),
    "utf8"
  );

  await writeFile(path.join(root, "node_modules", "ignored", "index.ts"), "export const ignored = true;", "utf8");
  await writeFile(path.join(root, ".env"), `OPENAI_API_KEY=${compilerSecretFixture}`, "utf8");
  await writeFile(path.join(root, "tsconfig.tsbuildinfo"), "generated build cache", "utf8");

  return root;
}

describe("Knowledge Compiler v0", () => {
  it("compiles project structure into AMF without raw repository storage", async () => {
    const root = await createFixtureProject();
    const amf = await compileProject(root);

    expect(amf.version).toBe("0.1.0");
    expect(amf.project.name).toBe("fixture-project");
    expect(amf.files.map((file) => file.path)).toContain("src/orders/packing.ts");
    expect(amf.files.some((file) => file.path.includes("node_modules"))).toBe(false);
    expect(amf.files.some((file) => file.path === ".env")).toBe(false);
    expect(amf.files.some((file) => file.path.endsWith(".tsbuildinfo"))).toBe(false);
    expect(amf.modules.map((module) => module.name)).toContain("src/orders");
    expect(amf.dependencies.some((dependency) => dependency.specifier === "../labels/printer")).toBe(true);
    expect(amf.api.some((entry) => entry.route === "/packing/labels")).toBe(true);
    expect(amf.database.some((entry) => entry.name === "packing_labels")).toBe(true);
    expect(amf.architecture.length).toBeGreaterThan(0);
    expect(amf.unresolvedQuestions.length).toBeGreaterThan(0);
    expect(JSON.stringify(amf)).not.toContain("dummy-value-for-redaction-test");
    expect(JSON.stringify(amf)).not.toContain(compilerSecretFixture);
  });

  it("marks secret-like findings as protected risks", async () => {
    const root = await createFixtureProject();
    const amf = await compileProject(root);
    const secretRisk = amf.risks.find((risk) => risk.type === "secret");

    expect(secretRisk).toBeDefined();
    expect(secretRisk?.privacy).toBe("protected");
    expect(secretRisk?.evidence).toContain("redacted");
  });

  it("skips symlinks while compiling untrusted project input", async () => {
    const root = await createFixtureProject();
    const outside = await mkdtemp(path.join(os.tmpdir(), "atlas-compiler-outside-"));
    await writeFile(path.join(outside, "secret.ts"), "export const token='outside-secret-value';", "utf8");

    try {
      await symlink(path.join(outside, "secret.ts"), path.join(root, "src", "orders", "linked-secret.ts"), "file");
    } catch {
      return;
    }

    const amf = await compileProject(root);
    expect(amf.files.some((file) => file.path.endsWith("linked-secret.ts"))).toBe(false);
    expect(JSON.stringify(amf)).not.toContain("outside-secret-value");
  });
});
