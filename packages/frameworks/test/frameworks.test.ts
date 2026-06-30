import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createFrameworkVerificationPlan,
  createMonorepoMap,
  detectFramework,
  detectPackageManager,
  ensureFrameworkConfig,
  getFrameworkAdapter,
  renderFrameworkDetectionHtml
} from "../src/index";

async function createWorkspace(name = "atlas-frameworks-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), name));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

describe("Universal Framework Support Layer", () => {
  it("detects Next.js", async () => {
    const root = await createWorkspace();
    await writeJson(path.join(root, "package.json"), { dependencies: { next: "latest", react: "latest" } });
    await writeFile(path.join(root, "next.config.ts"), "export default {};", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("nextjs");
    expect(result.language).toBe("TypeScript");
    expect(result.evidence.join("\n")).toContain("next");
  });

  it("detects React Vite", async () => {
    const root = await createWorkspace();
    await writeJson(path.join(root, "package.json"), { dependencies: { react: "latest", vite: "latest" } });
    await writeFile(path.join(root, "vite.config.ts"), "export default {};", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("react-vite");
    expect(result.buildTool).toBe("vite");
  });

  it("detects NestJS", async () => {
    const root = await createWorkspace();
    await writeJson(path.join(root, "package.json"), { dependencies: { "@nestjs/core": "latest" } });
    await writeFile(path.join(root, "nest-cli.json"), "{}", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("nestjs");
  });

  it("detects Laravel", async () => {
    const root = await createWorkspace();
    await writeJson(path.join(root, "composer.json"), { require: { "laravel/framework": "^11.0" } });
    await writeFile(path.join(root, "artisan"), "#!/usr/bin/env php", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("laravel");
    expect(result.language).toBe("PHP");
  });

  it("detects Django", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "manage.py"), "print('manage')", "utf8");
    await writeFile(path.join(root, "requirements.txt"), "Django==5.0\n", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("django");
  });

  it("detects FastAPI", async () => {
    const root = await createWorkspace();
    await mkdir(path.join(root, "app"), { recursive: true });
    await writeFile(path.join(root, "app", "main.py"), "from fastapi import FastAPI\n", "utf8");
    await writeFile(path.join(root, "requirements.txt"), "fastapi==0.1\n", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("fastapi");
  });

  it("detects WordPress without reading raw config", async () => {
    const root = await createWorkspace();
    await mkdir(path.join(root, "wp-content", "plugins"), { recursive: true });
    await writeFile(path.join(root, "wp-config.php"), "<?php define('DB_PASSWORD', 'fixture-secret');", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("wordpress");
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });

  it("detects .NET", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "Program.cs"), "var builder = WebApplication.CreateBuilder(args);", "utf8");
    await writeFile(path.join(root, "Example.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk.Web\" />", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("dotnet");
  });

  it("detects Spring Boot", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "pom.xml"), "<project><artifactId>spring-boot-starter-web</artifactId></project>", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("spring-boot");
  });

  it("detects pnpm monorepo apps and packages", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - \"apps/*\"\n  - \"packages/*\"\n", "utf8");
    await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    await writeJson(path.join(root, "apps", "web", "package.json"), { name: "@fixture/web", dependencies: { next: "latest" } });
    await writeFile(path.join(root, "apps", "web", "next.config.ts"), "export default {};", "utf8");
    await writeJson(path.join(root, "packages", "api", "package.json"), { name: "@fixture/api", dependencies: { "@nestjs/core": "latest", "@fixture/web": "workspace:*" } });
    await writeFile(path.join(root, "packages", "api", "nest-cli.json"), "{}", "utf8");

    const result = await detectFramework({ repoRoot: root });
    const map = await createMonorepoMap({ repoRoot: root });

    expect(result.isMonorepo).toBe(true);
    expect(result.apps.some((app) => app.path === "apps/web" && app.framework === "nextjs")).toBe(true);
    expect(map.packages.some((pkg) => pkg.path === "packages/api" && pkg.framework === "nestjs")).toBe(true);
    expect(map.packageManager).toBe("pnpm");
  });

  it("detects package manager correctly", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "poetry.lock"), "# lock", "utf8");

    const result = await detectPackageManager({ repoRoot: root });

    expect(result.packageManager).toBe("poetry");
  });

  it("marks Next.js auth zone as high risk", async () => {
    const adapter = getFrameworkAdapter("nextjs");
    const risk = await adapter?.summarizeDiffRisk({ filePath: "src/app/api/auth/login/route.ts", diffSummary: "changed auth" });

    expect(risk?.riskLevel).toBe("high");
    expect(risk?.lane).toBe("verified");
  });

  it("marks Laravel migration as high risk", async () => {
    const adapter = getFrameworkAdapter("laravel");
    const risk = await adapter?.summarizeDiffRisk({ filePath: "database/migrations/2026_01_01_create_users.php", diffSummary: "create table" });

    expect(risk?.riskLevel).toBe("high");
  });

  it("marks WordPress wp-config as critical privacy risk", async () => {
    const adapter = getFrameworkAdapter("wordpress");
    const risk = await adapter?.summarizeDiffRisk({ filePath: "wp-config.php", diffSummary: "changed config" });

    expect(risk?.riskLevel).toBe("critical");
    expect(risk?.lane).toBe("blocked");
  });

  it("creates lightweight verification for UI changes", async () => {
    const root = await createWorkspace();
    await writeJson(path.join(root, "package.json"), { scripts: { build: "vite build", typecheck: "tsc" } });
    await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");

    const plan = await createFrameworkVerificationPlan({
      framework: "react-vite",
      task: "adjust button layout",
      filesChanged: ["src/components/Button.tsx"],
      riskLevel: "low",
      repoRoot: root
    });

    expect(plan.requiredChecks).toHaveLength(0);
    expect(plan.optionalChecks.join("\n")).toContain("UI");
    expect(plan.canMarkCompletedWithoutVerification).toBe(true);
  });

  it("creates strict verification for auth changes", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "package-lock.json"), "{}", "utf8");

    const plan = await createFrameworkVerificationPlan({
      framework: "nextjs",
      task: "fix login middleware",
      filesChanged: ["middleware.ts"],
      riskLevel: "high",
      repoRoot: root
    });

    expect(plan.requiredChecks.join("\n")).toContain("auth");
    expect(plan.canMarkCompletedWithoutVerification).toBe(false);
  });

  it("generic adapter does not crash on unknown framework", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "README.md"), "# Unknown", "utf8");

    const result = await detectFramework({ repoRoot: root });

    expect(result.primaryFramework).toBe("unknown");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("renders framework view without leaking secret-like config", async () => {
    const root = await createWorkspace();
    const rawSecret = "OPENAI_API_KEY=sk-proj-FAKE_TEST_VALUE_12345678901234567890";
    await writeJson(path.join(root, "package.json"), { dependencies: { next: "latest" } });
    await writeFile(path.join(root, "next.config.ts"), `// ${rawSecret}`, "utf8");
    await writeFile(path.join(root, ".env"), rawSecret, "utf8");

    const html = renderFrameworkDetectionHtml(await detectFramework({ repoRoot: root }));

    expect(html).toContain("LMTI Framework Detection");
    expect(html).not.toContain(rawSecret);
  });

  it("creates default framework config", async () => {
    const root = await createWorkspace();
    const configPath = await ensureFrameworkConfig(root);

    expect(configPath.endsWith(path.join(".lmti", "frameworks.yml"))).toBe(true);
  });
});
