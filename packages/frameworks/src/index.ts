import { promises as fs } from "node:fs";
import path from "node:path";
import { redactText, runEgressSecretScan } from "@atlas/privacy";

export type FrameworkRiskLevel = "low" | "medium" | "high" | "critical";
export type FrameworkLane = "fast" | "guarded" | "verified" | "blocked";

export interface FrameworkDetectionResult {
  primaryFramework: string;
  secondaryFrameworks: string[];
  language: string;
  packageManager?: string;
  buildTool?: string;
  testRunner?: string;
  lintTool?: string;
  isMonorepo: boolean;
  apps: FrameworkAppDetection[];
  confidence: number;
  evidence: string[];
  monorepo?: MonorepoMap;
  lastDetectedAt?: string;
}

export interface FrameworkAppDetection {
  name: string;
  path: string;
  framework: string;
  language: string;
}

export interface ProjectStructure {
  root: string;
  sourceDirs: string[];
  appDirs: string[];
  packageDirs: string[];
  configFiles: string[];
  testDirs: string[];
  publicDirs: string[];
}

export type FrameworkCommands = {
  install?: string;
  dev?: string;
  build?: string;
  test?: string;
  lint?: string;
  typecheck?: string;
  format?: string;
  migrate?: string;
  seed?: string;
  start?: string;
};

export interface RiskZone {
  name: string;
  riskLevel: FrameworkRiskLevel;
  lane: FrameworkLane;
  patterns: string[];
  reason: string;
}

export interface VerificationPlan {
  requiredChecks: string[];
  optionalChecks: string[];
  commands: string[];
  canMarkCompletedWithoutVerification: boolean;
  reason: string;
}

export interface DiffRiskSummary {
  filePath: string;
  riskLevel: FrameworkRiskLevel;
  lane: FrameworkLane;
  matchedZones: string[];
  reason: string;
}

export interface FrameworkAdapter {
  name: string;
  language: string;
  detect(repoRoot: string): Promise<FrameworkDetectionResult>;
  getProjectStructure(repoRoot: string): Promise<ProjectStructure>;
  getDefaultCommands(repoRoot: string): Promise<FrameworkCommands>;
  getRiskZones(repoRoot: string): Promise<RiskZone[]>;
  getVerificationPlan(input: {
    task: string;
    filesChanged: string[];
    riskLevel: string;
    repoRoot?: string;
  }): Promise<VerificationPlan>;
  summarizeDiffRisk(input: {
    filePath: string;
    diffSummary: string;
  }): Promise<DiffRiskSummary>;
}

export interface PackageManagerDetectionResult {
  packageManager?: string;
  buildTool?: string;
  testRunner?: string;
  lintTool?: string;
  evidence: string[];
}

export interface MonorepoProject {
  name: string;
  path: string;
  framework: string;
  language: string;
  packageManager?: string;
  packageName?: string;
}

export interface MonorepoDependencyEdge {
  from: string;
  to: string;
}

export interface MonorepoMap {
  root: string;
  packageManager: string;
  apps: MonorepoProject[];
  packages: MonorepoProject[];
  dependencyGraph: MonorepoDependencyEdge[];
  evidence: string[];
}

interface FrameworkDefinition {
  name: string;
  language: string;
  packageNames?: string[];
  composerPackages?: string[];
  pythonPackages?: string[];
  gemPackages?: string[];
  files?: string[];
  contentFiles?: string[];
  contentNeedles?: string[];
  buildTool?: string;
  testRunner?: string;
  lintTool?: string;
  riskZones: RiskZone[];
}

const IGNORED_DIRS = new Set([".git", ".lmti", ".atlas", "node_modules", "dist", "build", "coverage", ".next", ".turbo", ".cache", "vendor", "__pycache__"]);
const SECRET_FILE_NAMES = new Set([".env", "wp-config.php", "appsettings.json", "appsettings.production.json", "settings.local.py"]);
const DEFAULT_CONFIDENCE_THRESHOLD = 0.35;

const COMMON_RISK_ZONES: RiskZone[] = [
  {
    name: "secret-config",
    riskLevel: "critical",
    lane: "blocked",
    patterns: [".env", ".env.*", "wp-config.php", "appsettings*.json", "settings.py", "config/local.*"],
    reason: "Secret-bearing config requires privacy gate and human review."
  },
  {
    name: "deployment",
    riskLevel: "high",
    lane: "verified",
    patterns: ["Dockerfile", "docker-compose*.yml", ".github/workflows/**", "nginx/**", "vercel.json", "netlify.toml"],
    reason: "Deployment config can affect production runtime."
  }
];

const JS_AUTH_ZONES: RiskZone[] = [
  {
    name: "auth",
    riskLevel: "high",
    lane: "verified",
    patterns: ["middleware.ts", "middleware.js", "src/lib/auth/**", "src/app/api/auth/**", "src/modules/auth/**", "src/auth/**"],
    reason: "Authentication and permission files require least-privilege verification."
  },
  {
    name: "database",
    riskLevel: "high",
    lane: "verified",
    patterns: ["prisma/schema.prisma", "migrations/**", "drizzle/**", "src/db/**", "database/**"],
    reason: "Database schema or migration changes need focused verification."
  },
  ...COMMON_RISK_ZONES
];

const PHP_LARAVEL_ZONES: RiskZone[] = [
  {
    name: "auth",
    riskLevel: "high",
    lane: "verified",
    patterns: ["app/Http/Middleware/**", "app/Policies/**", "app/Providers/AuthServiceProvider.php"],
    reason: "Laravel auth and policy changes require permission tests."
  },
  {
    name: "database",
    riskLevel: "high",
    lane: "verified",
    patterns: ["database/migrations/**", "database/seeders/**", "app/Models/**"],
    reason: "Laravel database changes require migration/model verification."
  },
  {
    name: "routes",
    riskLevel: "medium",
    lane: "guarded",
    patterns: ["routes/web.php", "routes/api.php"],
    reason: "Route changes can alter public access."
  },
  {
    name: "config",
    riskLevel: "critical",
    lane: "blocked",
    patterns: ["config/**", ".env"],
    reason: "Laravel config may contain APP_KEY, database URLs or secrets."
  },
  ...COMMON_RISK_ZONES
];

const PYTHON_WEB_ZONES: RiskZone[] = [
  {
    name: "auth",
    riskLevel: "high",
    lane: "verified",
    patterns: ["**/settings.py", "**/middleware.py", "**/permissions.py", "**/auth/**"],
    reason: "Python web auth/settings changes require strict verification."
  },
  {
    name: "database",
    riskLevel: "high",
    lane: "verified",
    patterns: ["**/models.py", "**/migrations/**", "alembic/**"],
    reason: "Model and migration changes require database checks."
  },
  {
    name: "routes",
    riskLevel: "medium",
    lane: "guarded",
    patterns: ["**/urls.py", "app/main.py", "**/routers/**"],
    reason: "Route changes can affect API behavior."
  },
  ...COMMON_RISK_ZONES
];

const WORDPRESS_ZONES: RiskZone[] = [
  {
    name: "wordpress-config",
    riskLevel: "critical",
    lane: "blocked",
    patterns: ["wp-config.php", "*.sql", "*.sql.gz"],
    reason: "WordPress config and database backups can contain raw credentials."
  },
  {
    name: "plugins",
    riskLevel: "high",
    lane: "verified",
    patterns: ["wp-content/plugins/**"],
    reason: "Plugin changes can execute arbitrary PHP in production."
  },
  {
    name: "themes",
    riskLevel: "high",
    lane: "verified",
    patterns: ["wp-content/themes/**", "functions.php"],
    reason: "Theme code can affect public rendering and PHP execution."
  },
  ...COMMON_RISK_ZONES
];

const DOTNET_ZONES: RiskZone[] = [
  {
    name: "dotnet-config",
    riskLevel: "critical",
    lane: "blocked",
    patterns: ["appsettings*.json"],
    reason: ".NET appsettings can contain connection strings and secrets."
  },
  {
    name: "auth",
    riskLevel: "high",
    lane: "verified",
    patterns: ["**/Authorization/**", "**/Authentication/**", "**/*Policy*.cs", "**/*Auth*.cs"],
    reason: ".NET authorization changes require security tests."
  },
  ...COMMON_RISK_ZONES
];

const SPRING_ZONES: RiskZone[] = [
  {
    name: "spring-config",
    riskLevel: "high",
    lane: "verified",
    patterns: ["src/main/resources/application*.yml", "src/main/resources/application*.properties"],
    reason: "Spring application config can alter security, datasource or profile behavior."
  },
  {
    name: "auth",
    riskLevel: "high",
    lane: "verified",
    patterns: ["**/SecurityConfig.java", "**/*Security*.java", "**/*Auth*.java"],
    reason: "Spring security changes require strict verification."
  },
  ...COMMON_RISK_ZONES
];

const DEFINITIONS: FrameworkDefinition[] = [
  {
    name: "nextjs",
    language: "TypeScript",
    packageNames: ["next"],
    files: ["next.config.js", "next.config.mjs", "next.config.ts"],
    testRunner: "jest/vitest",
    lintTool: "eslint",
    riskZones: JS_AUTH_ZONES
  },
  {
    name: "react-vite",
    language: "TypeScript",
    packageNames: ["vite", "react"],
    files: ["vite.config.js", "vite.config.ts", "vite.config.mjs"],
    buildTool: "vite",
    testRunner: "vitest",
    lintTool: "eslint",
    riskZones: JS_AUTH_ZONES
  },
  {
    name: "nestjs",
    language: "TypeScript",
    packageNames: ["@nestjs/core"],
    files: ["nest-cli.json"],
    testRunner: "jest",
    lintTool: "eslint",
    riskZones: JS_AUTH_ZONES
  },
  {
    name: "express",
    language: "JavaScript",
    packageNames: ["express"],
    testRunner: "jest/vitest",
    lintTool: "eslint",
    riskZones: JS_AUTH_ZONES
  },
  {
    name: "laravel",
    language: "PHP",
    composerPackages: ["laravel/framework"],
    files: ["artisan"],
    testRunner: "phpunit/pest",
    riskZones: PHP_LARAVEL_ZONES
  },
  {
    name: "django",
    language: "Python",
    pythonPackages: ["django"],
    files: ["manage.py", "wsgi.py", "asgi.py"],
    testRunner: "django-test/pytest",
    riskZones: PYTHON_WEB_ZONES
  },
  {
    name: "fastapi",
    language: "Python",
    pythonPackages: ["fastapi"],
    files: ["app/main.py", "main.py"],
    testRunner: "pytest",
    riskZones: PYTHON_WEB_ZONES
  },
  {
    name: "wordpress",
    language: "PHP",
    files: ["wp-config.php", "wp-content"],
    riskZones: WORDPRESS_ZONES
  },
  {
    name: "dotnet",
    language: "C#",
    files: ["Program.cs", "*.csproj", "*.sln"],
    testRunner: "dotnet test",
    riskZones: DOTNET_ZONES
  },
  {
    name: "spring-boot",
    language: "Java",
    files: ["pom.xml", "build.gradle", "settings.gradle", "src/main/java"],
    contentFiles: ["pom.xml", "build.gradle", "build.gradle.kts"],
    contentNeedles: ["spring-boot"],
    testRunner: "maven/gradle",
    riskZones: SPRING_ZONES
  },
  {
    name: "rails",
    language: "Ruby",
    gemPackages: ["rails"],
    files: ["Gemfile", "config/routes.rb", "bin/rails"],
    testRunner: "rails test/rspec",
    riskZones: [
      {
        name: "routes",
        riskLevel: "medium",
        lane: "guarded",
        patterns: ["config/routes.rb"],
        reason: "Rails routes can alter public access."
      },
      {
        name: "database",
        riskLevel: "high",
        lane: "verified",
        patterns: ["db/migrate/**", "app/models/**"],
        reason: "Rails migrations and models require DB verification."
      },
      ...COMMON_RISK_ZONES
    ]
  },
  {
    name: "flutter",
    language: "Dart",
    files: ["pubspec.yaml", "lib/main.dart"],
    buildTool: "flutter",
    testRunner: "flutter test",
    riskZones: [
      {
        name: "native-mobile",
        riskLevel: "high",
        lane: "verified",
        patterns: ["android/**", "ios/**", "pubspec.yaml"],
        reason: "Native mobile and dependency changes require platform checks."
      },
      ...COMMON_RISK_ZONES
    ]
  }
];

const adapters = new Map<string, FrameworkAdapter>();

for (const definition of DEFINITIONS) {
  registerFrameworkAdapter(createDefinitionAdapter(definition));
}
registerFrameworkAdapter(createGenericAdapter());

export function registerFrameworkAdapter(adapter: FrameworkAdapter): void {
  adapters.set(adapter.name, adapter);
}

export function getFrameworkAdapter(name: string): FrameworkAdapter | undefined {
  return adapters.get(normalizeFrameworkName(name));
}

export function listFrameworkAdapters(): FrameworkAdapter[] {
  return Array.from(adapters.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export async function detectFramework(input: { repoRoot: string }): Promise<FrameworkDetectionResult> {
  const repoRoot = path.resolve(input.repoRoot);
  const rootDetection = await detectAtPath(repoRoot, ".");
  const packageManager = await detectPackageManager({ repoRoot });
  const monorepo = await createMonorepoMap({ repoRoot });
  const isMonorepo = monorepo.apps.length + monorepo.packages.length > 0 || monorepo.evidence.length > 0;

  const apps = [...monorepo.apps, ...monorepo.packages].map((project) => ({
    name: project.name,
    path: project.path,
    framework: project.framework,
    language: project.language
  }));
  const appFrameworks = apps.map((app) => app.framework).filter((framework) => framework !== "generic" && framework !== "unknown");
  const secondary = new Set<string>(rootDetection.secondaryFrameworks);
  for (const framework of appFrameworks) {
    if (framework !== rootDetection.primaryFramework) {
      secondary.add(framework);
    }
  }

  const evidence = [
    ...rootDetection.evidence,
    ...packageManager.evidence,
    ...monorepo.evidence
  ];
  return sanitizeDetection({
    ...rootDetection,
    secondaryFrameworks: Array.from(secondary).slice(0, 12),
    packageManager: packageManager.packageManager ?? rootDetection.packageManager,
    buildTool: packageManager.buildTool ?? rootDetection.buildTool,
    testRunner: rootDetection.testRunner ?? packageManager.testRunner,
    lintTool: rootDetection.lintTool ?? packageManager.lintTool,
    isMonorepo,
    apps,
    evidence: unique(evidence),
    monorepo,
    lastDetectedAt: new Date().toISOString()
  });
}

export async function detectPackageManager(input: { repoRoot: string }): Promise<PackageManagerDetectionResult> {
  const repoRoot = path.resolve(input.repoRoot);
  const evidence: string[] = [];
  let packageManager: string | undefined;
  let buildTool: string | undefined;

  if (await exists(repoRoot, "pnpm-lock.yaml")) {
    packageManager = "pnpm";
    evidence.push("pnpm-lock.yaml found");
  } else if (await exists(repoRoot, "package-lock.json")) {
    packageManager = "npm";
    evidence.push("package-lock.json found");
  } else if (await exists(repoRoot, "yarn.lock")) {
    packageManager = "yarn";
    evidence.push("yarn.lock found");
  } else if (await exists(repoRoot, "bun.lockb") || await exists(repoRoot, "bun.lock")) {
    packageManager = "bun";
    evidence.push("bun lockfile found");
  } else if (await exists(repoRoot, "composer.lock") || await exists(repoRoot, "composer.json")) {
    packageManager = "composer";
    evidence.push(await exists(repoRoot, "composer.lock") ? "composer.lock found" : "composer.json found");
  } else if (await exists(repoRoot, "poetry.lock")) {
    packageManager = "poetry";
    evidence.push("poetry.lock found");
  } else if (await exists(repoRoot, "Pipfile.lock") || await exists(repoRoot, "Pipfile")) {
    packageManager = "pipenv";
    evidence.push("Pipfile found");
  } else if (await exists(repoRoot, "requirements.txt") || await exists(repoRoot, "pyproject.toml")) {
    packageManager = "pip";
    evidence.push(await exists(repoRoot, "requirements.txt") ? "requirements.txt found" : "pyproject.toml found");
  } else if (await exists(repoRoot, "Gemfile.lock") || await exists(repoRoot, "Gemfile")) {
    packageManager = "bundler";
    evidence.push("Gemfile found");
  } else if (await exists(repoRoot, "pom.xml")) {
    packageManager = "maven";
    buildTool = "maven";
    evidence.push("pom.xml found");
  } else if (await exists(repoRoot, "build.gradle") || await exists(repoRoot, "build.gradle.kts")) {
    packageManager = "gradle";
    buildTool = "gradle";
    evidence.push("build.gradle found");
  } else if ((await findFiles(repoRoot, 2, (relative) => relative.endsWith(".csproj") || relative.endsWith(".sln"), 1)).length > 0) {
    packageManager = "dotnet";
    buildTool = "dotnet";
    evidence.push("dotnet project file found");
  } else if (await exists(repoRoot, "pubspec.yaml")) {
    packageManager = "flutter";
    buildTool = "flutter";
    evidence.push("pubspec.yaml found");
  }

  const packageJson = await readJsonFile(path.join(repoRoot, "package.json"));
  if (!packageManager && packageJson && typeof packageJson.packageManager === "string") {
    packageManager = packageJson.packageManager.split("@")[0];
    evidence.push("package.json packageManager field found");
  }
  if (packageJson && hasScripts(packageJson)) {
    evidence.push("package.json scripts found");
  }

  return {
    packageManager,
    buildTool,
    testRunner: packageJson && hasScript(packageJson, "test") ? "package-script" : undefined,
    lintTool: packageJson && hasScript(packageJson, "lint") ? "package-script" : undefined,
    evidence: evidence.map(redactText)
  };
}

export async function createMonorepoMap(input: { repoRoot: string }): Promise<MonorepoMap> {
  const repoRoot = path.resolve(input.repoRoot);
  const packageManager = (await detectPackageManager({ repoRoot })).packageManager ?? "unknown";
  const evidence: string[] = [];
  const patterns: string[] = [];

  if (await exists(repoRoot, "pnpm-workspace.yaml")) {
    evidence.push("pnpm-workspace.yaml found");
    patterns.push(...parsePnpmWorkspace(await safeReadText(path.join(repoRoot, "pnpm-workspace.yaml"))));
  }
  if (await exists(repoRoot, "nx.json")) {
    evidence.push("nx.json found");
    patterns.push("apps/*", "packages/*", "libs/*");
  }
  if (await exists(repoRoot, "turbo.json")) {
    evidence.push("turbo.json found");
    patterns.push("apps/*", "packages/*");
  }
  if (await exists(repoRoot, "lerna.json")) {
    evidence.push("lerna.json found");
    patterns.push("packages/*");
  }

  const packageJson = await readJsonFile(path.join(repoRoot, "package.json"));
  const workspacePatterns = parsePackageWorkspaces(packageJson);
  if (workspacePatterns.length > 0) {
    evidence.push("package.json workspaces found");
    patterns.push(...workspacePatterns);
  }

  const candidateDirs = unique([...patterns, "apps/*", "packages/*"].flatMap((pattern) => expandWorkspacePattern(repoRoot, pattern)));
  const projects: MonorepoProject[] = [];
  const packageNames = new Map<string, string>();
  for (const projectPath of candidateDirs) {
    if (path.resolve(projectPath) === repoRoot) {
      continue;
    }
    const relativePath = toRelative(repoRoot, projectPath);
    const detection = await detectAtPath(projectPath, relativePath);
    const manager = await detectPackageManager({ repoRoot: projectPath });
    const manifest = await readJsonFile(path.join(projectPath, "package.json"));
    const packageName = typeof manifest?.name === "string" ? redactText(manifest.name) : undefined;
    if (packageName) {
      packageNames.set(packageName, relativePath);
    }
    if (detection.primaryFramework !== "unknown" || packageName || await exists(projectPath, "package.json")) {
      projects.push({
        name: packageName ?? path.basename(projectPath),
        path: relativePath,
        framework: detection.primaryFramework === "unknown" ? "generic" : detection.primaryFramework,
        language: detection.language,
        packageManager: manager.packageManager ?? packageManager,
        packageName
      });
    }
  }

  const dependencyGraph: MonorepoDependencyEdge[] = [];
  for (const project of projects) {
    const manifest = await readJsonFile(path.join(repoRoot, project.path, "package.json"));
    const deps = manifest ? dependencyNames(manifest) : [];
    for (const dep of deps) {
      const target = packageNames.get(dep);
      if (target && target !== project.path) {
        dependencyGraph.push({ from: project.path, to: target });
      }
    }
  }

  return {
    root: repoRoot,
    packageManager,
    apps: projects.filter((project) => project.path.startsWith("apps/")),
    packages: projects.filter((project) => !project.path.startsWith("apps/")),
    dependencyGraph,
    evidence: unique(evidence).map(redactText)
  };
}

export async function createFrameworkVerificationPlan(input: {
  framework: string;
  task: string;
  filesChanged: string[];
  riskLevel: string;
  repoRoot?: string;
}): Promise<VerificationPlan> {
  const adapter = getFrameworkAdapter(input.framework) ?? getFrameworkAdapter("generic");
  if (!adapter) {
    return genericVerificationPlan(input, { evidence: [] });
  }
  return adapter.getVerificationPlan(input);
}

export async function getFrameworkRiskForFiles(input: {
  framework: string;
  filesChanged: string[];
  repoRoot?: string;
}): Promise<DiffRiskSummary[]> {
  const adapter = getFrameworkAdapter(input.framework) ?? getFrameworkAdapter("generic");
  const zones = adapter ? await adapter.getRiskZones(input.repoRoot ?? process.cwd()) : COMMON_RISK_ZONES;
  return input.filesChanged.map((filePath) => summarizeRiskFromZones(filePath, "", zones));
}

export async function ensureFrameworkConfig(repoRoot: string): Promise<string> {
  const lmtiDir = path.join(repoRoot, ".lmti");
  await fs.mkdir(lmtiDir, { recursive: true });
  const configPath = path.join(lmtiDir, "frameworks.yml");
  if (!(await fileExists(configPath))) {
    await fs.writeFile(configPath, DEFAULT_FRAMEWORK_CONFIG, "utf8");
  }
  return configPath;
}

export function formatFrameworkDetection(result: FrameworkDetectionResult): string {
  const lines = [
    `Primary framework: ${result.primaryFramework}`,
    `Language: ${result.language}`,
    `Package manager: ${result.packageManager ?? "unknown"}`,
    `Monorepo: ${result.isMonorepo}`,
    "Apps:",
    ...(result.apps.length > 0 ? result.apps.map((app) => `- ${app.path}: ${app.framework}`) : ["- none"]),
    `Confidence: ${result.confidence}`,
    "Evidence:",
    ...(result.evidence.length > 0 ? result.evidence.map((entry) => `- ${entry}`) : ["- none"])
  ];
  return redactText(lines.join("\n"));
}

export function renderFrameworkDetectionHtml(result: FrameworkDetectionResult): string {
  return htmlPage("LMTI Framework Detection", [
    `<p><strong>Primary:</strong> ${escapeHtml(result.primaryFramework)}</p>`,
    `<p><strong>Language:</strong> ${escapeHtml(result.language)}</p>`,
    `<p><strong>Package manager:</strong> ${escapeHtml(result.packageManager ?? "unknown")}</p>`,
    `<p><strong>Confidence:</strong> ${escapeHtml(String(result.confidence))}</p>`,
    table(["App", "Framework", "Language"], result.apps.map((app) => [app.path, app.framework, app.language])),
    table(["Evidence"], result.evidence.map((entry) => [entry]))
  ].join("\n"));
}

export function renderFrameworkCommandsHtml(input: { framework: string; commands: FrameworkCommands }): string {
  return htmlPage("LMTI Framework Commands", table(["Command", "Value"], Object.entries(input.commands).map(([key, value]) => [key, value ?? ""])));
}

export function renderFrameworkRiskZonesHtml(input: { framework: string; zones: RiskZone[] }): string {
  return htmlPage("LMTI Framework Risk Zones", table(["Zone", "Risk", "Lane", "Patterns"], input.zones.map((zone) => [zone.name, zone.riskLevel, zone.lane, zone.patterns.join(", ")])));
}

export function renderFrameworkVerificationHtml(plan: VerificationPlan): string {
  return htmlPage("LMTI Framework Verification", [
    table(["Required checks"], plan.requiredChecks.map((check) => [check])),
    table(["Commands"], plan.commands.map((command) => [command])),
    `<p>${escapeHtml(plan.reason)}</p>`
  ].join("\n"));
}

export function renderMonorepoMapHtml(map: MonorepoMap): string {
  return htmlPage("LMTI Monorepo Map", [
    table(["App", "Framework", "Language"], map.apps.map((app) => [app.path, app.framework, app.language])),
    table(["Package", "Framework", "Language"], map.packages.map((pkg) => [pkg.path, pkg.framework, pkg.language])),
    table(["From", "To"], map.dependencyGraph.map((edge) => [edge.from, edge.to]))
  ].join("\n"));
}

function createDefinitionAdapter(definition: FrameworkDefinition): FrameworkAdapter {
  return {
    name: definition.name,
    language: definition.language,
    detect: async (repoRoot: string) => detectDefinition(repoRoot, ".", definition),
    getProjectStructure: inferProjectStructure,
    getDefaultCommands: async (repoRoot: string) => commandsFor(definition.name, await detectPackageManager({ repoRoot })),
    getRiskZones: async () => definition.riskZones,
    getVerificationPlan: async (input) => verificationPlanFor(definition.name, input, definition.riskZones, input.repoRoot),
    summarizeDiffRisk: async (input) => summarizeRiskFromZones(input.filePath, input.diffSummary, definition.riskZones)
  };
}

function createGenericAdapter(): FrameworkAdapter {
  return {
    name: "generic",
    language: "unknown",
    detect: async (repoRoot: string) => {
      const packageManager = await detectPackageManager({ repoRoot });
      return sanitizeDetection({
        primaryFramework: "unknown",
        secondaryFrameworks: [],
        language: inferGenericLanguage(repoRoot),
        packageManager: packageManager.packageManager,
        buildTool: packageManager.buildTool,
        testRunner: packageManager.testRunner,
        lintTool: packageManager.lintTool,
        isMonorepo: false,
        apps: [],
        confidence: 0.2,
        evidence: packageManager.evidence.length > 0 ? packageManager.evidence : ["No known framework evidence found"]
      });
    },
    getProjectStructure: inferProjectStructure,
    getDefaultCommands: async (repoRoot: string) => commandsFor("generic", await detectPackageManager({ repoRoot })),
    getRiskZones: async () => COMMON_RISK_ZONES,
    getVerificationPlan: async (input) => genericVerificationPlan(input, await detectPackageManager({ repoRoot: input.repoRoot ?? process.cwd() })),
    summarizeDiffRisk: async (input) => summarizeRiskFromZones(input.filePath, input.diffSummary, COMMON_RISK_ZONES)
  };
}

async function detectAtPath(repoRoot: string, relativeRoot: string): Promise<FrameworkDetectionResult> {
  const detections = (await Promise.all(DEFINITIONS.map((definition) => detectDefinition(repoRoot, relativeRoot, definition))))
    .filter((result) => result.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence);
  const packageManager = await detectPackageManager({ repoRoot });
  const primary = detections[0];

  if (!primary || primary.confidence < DEFAULT_CONFIDENCE_THRESHOLD) {
    const generic = await createGenericAdapter().detect(repoRoot);
    return {
      ...generic,
      packageManager: packageManager.packageManager ?? generic.packageManager,
      buildTool: packageManager.buildTool ?? generic.buildTool,
      evidence: unique([...generic.evidence, ...packageManager.evidence])
    };
  }

  return sanitizeDetection({
    ...primary,
    secondaryFrameworks: detections.slice(1).filter((result) => result.confidence >= DEFAULT_CONFIDENCE_THRESHOLD).map((result) => result.primaryFramework),
    packageManager: packageManager.packageManager,
    buildTool: packageManager.buildTool ?? primary.buildTool,
    testRunner: primary.testRunner ?? packageManager.testRunner,
    lintTool: primary.lintTool ?? packageManager.lintTool,
    isMonorepo: false,
    apps: [],
    evidence: unique([...primary.evidence, ...packageManager.evidence])
  });
}

async function detectDefinition(repoRoot: string, relativeRoot: string, definition: FrameworkDefinition): Promise<FrameworkDetectionResult> {
  const evidence: string[] = [];
  let score = 0;
  const packageJson = await readJsonFile(path.join(repoRoot, "package.json"));
  const dependencies = packageJson ? dependencyNames(packageJson) : [];

  for (const packageName of definition.packageNames ?? []) {
    if (dependencies.includes(packageName)) {
      score += packageName === "react" && definition.name === "react-vite" ? 0.22 : 0.45;
      evidence.push(`package.json contains ${packageName}`);
    }
  }
  for (const packageName of definition.composerPackages ?? []) {
    const composer = await readJsonFile(path.join(repoRoot, "composer.json"));
    if (composer && dependencyNames(composer).includes(packageName)) {
      score += 0.55;
      evidence.push(`composer.json contains ${packageName}`);
    }
  }
  for (const packageName of definition.pythonPackages ?? []) {
    if (await textFileContainsAny(repoRoot, ["requirements.txt", "pyproject.toml"], [packageName])) {
      score += 0.55;
      evidence.push(`python manifest contains ${packageName}`);
    }
  }
  for (const packageName of definition.gemPackages ?? []) {
    if (await textFileContainsAny(repoRoot, ["Gemfile"], [packageName])) {
      score += 0.55;
      evidence.push(`Gemfile contains ${packageName}`);
    }
  }
  for (const filePattern of definition.files ?? []) {
    if (await hasPathPattern(repoRoot, filePattern)) {
      score += filePattern.includes("*") ? 0.25 : 0.35;
      evidence.push(`${prefixRelative(relativeRoot, filePattern)} found`);
    }
  }
  if (definition.contentFiles && definition.contentNeedles) {
    if (await textFileContainsAny(repoRoot, definition.contentFiles, definition.contentNeedles)) {
      score += 0.35;
      evidence.push(`${definition.contentNeedles[0]} marker found in build metadata`);
    }
  }

  const confidence = round(Math.min(1, score));
  return sanitizeDetection({
    primaryFramework: definition.name,
    secondaryFrameworks: [],
    language: definition.language,
    buildTool: definition.buildTool,
    testRunner: definition.testRunner,
    lintTool: definition.lintTool,
    isMonorepo: false,
    apps: [],
    confidence,
    evidence
  });
}

async function inferProjectStructure(repoRoot: string): Promise<ProjectStructure> {
  const dirs = await listImmediateDirs(repoRoot);
  const files = await listImmediateFiles(repoRoot);
  return {
    root: path.resolve(repoRoot),
    sourceDirs: dirs.filter((dir) => ["src", "app", "lib"].includes(dir) || dir.startsWith("src/")),
    appDirs: dirs.filter((dir) => ["apps", "app"].includes(dir)),
    packageDirs: dirs.filter((dir) => ["packages", "libs"].includes(dir)),
    configFiles: files.filter((file) => /(config|json|yaml|yml|toml|gradle|csproj|sln)$/i.test(file) && !isSecretFile(file)),
    testDirs: dirs.filter((dir) => /(test|tests|__tests__|spec)/i.test(dir)),
    publicDirs: dirs.filter((dir) => ["public", "static", "wwwroot"].includes(dir))
  };
}

function commandsFor(framework: string, manager: PackageManagerDetectionResult): FrameworkCommands {
  const pm = manager.packageManager ?? "npm";
  if (["nextjs", "react-vite", "nestjs", "express", "generic"].includes(framework) && ["npm", "pnpm", "yarn", "bun"].includes(pm)) {
    const run = pm === "npm" ? "npm run" : pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : "bun run";
    return {
      install: pm === "npm" ? "npm install" : pm === "pnpm" ? "pnpm install" : pm === "yarn" ? "yarn install" : "bun install",
      dev: `${run} dev`,
      build: `${run} build`,
      test: pm === "npm" ? "npm test" : `${run} test`,
      lint: `${run} lint`,
      typecheck: `${run} typecheck`,
      start: `${run} start`
    };
  }
  if (framework === "laravel") {
    return { install: "composer install", test: "php artisan test", migrate: "php artisan migrate", seed: "php artisan db:seed", start: "php artisan serve" };
  }
  if (framework === "django") {
    return { install: "python -m pip install -r requirements.txt", test: "python manage.py test", migrate: "python manage.py migrate", start: "python manage.py runserver" };
  }
  if (framework === "fastapi") {
    return { install: "python -m pip install -r requirements.txt", test: "python -m pytest", start: "uvicorn app.main:app --reload" };
  }
  if (framework === "wordpress") {
    return { test: "php -l <changed-php-file>" };
  }
  if (framework === "dotnet") {
    return { build: "dotnet build", test: "dotnet test", start: "dotnet run" };
  }
  if (framework === "spring-boot") {
    const gradle = manager.packageManager === "gradle";
    return gradle
      ? { build: "./gradlew build", test: "./gradlew test", start: "./gradlew bootRun" }
      : { build: "./mvnw package", test: "./mvnw test", start: "./mvnw spring-boot:run" };
  }
  if (framework === "rails") {
    return { install: "bundle install", test: "bundle exec rails test", migrate: "bundle exec rails db:migrate", start: "bin/rails server" };
  }
  if (framework === "flutter") {
    return { install: "flutter pub get", build: "flutter build", test: "flutter test", start: "flutter run" };
  }
  return {};
}

async function verificationPlanFor(framework: string, input: { task: string; filesChanged: string[]; riskLevel: string; repoRoot?: string }, zones: RiskZone[], repoRoot?: string): Promise<VerificationPlan> {
  const manager = await detectPackageManager({ repoRoot: repoRoot ?? process.cwd() });
  const commands = commandsFor(framework, manager);
  const riskSummaries = input.filesChanged.map((file) => summarizeRiskFromZones(file, "", zones));
  const maxRisk = maxRiskLevel([input.riskLevel as FrameworkRiskLevel, ...riskSummaries.map((risk) => risk.riskLevel)]);
  const normalizedTask = normalizeText(input.task);
  const touched = input.filesChanged.join(" ");
  const requiredChecks = new Set<string>();
  const optionalChecks = new Set<string>();
  const planCommands = new Set<string>();

  if (isUiChange(normalizedTask, touched)) {
    optionalChecks.add("Run targeted build or typecheck for UI surface.");
    addIf(planCommands, commands.typecheck);
    addIf(planCommands, commands.build);
  }
  if (isAuthChange(normalizedTask, touched) || maxRisk === "high" || maxRisk === "critical") {
    requiredChecks.add("Verify auth/permission behavior and least privilege.");
    addIf(planCommands, commands.test);
    addIf(planCommands, commands.build);
  }
  if (isDatabaseChange(touched)) {
    requiredChecks.add("Verify migration/schema safety.");
    addIf(planCommands, commands.migrate);
    addIf(planCommands, commands.test);
  }
  if (isDeployChange(touched)) {
    requiredChecks.add("Run build and prepare healthcheck/rollback plan.");
    addIf(planCommands, commands.build);
  }
  if (framework === "wordpress") {
    requiredChecks.add("Run PHP syntax check on changed PHP files.");
    addIf(planCommands, commands.test);
  }
  if (requiredChecks.size === 0 && optionalChecks.size === 0) {
    optionalChecks.add("Run lightweight smoke check for changed files.");
    addIf(planCommands, commands.test);
  }

  const blocked = maxRisk === "critical";
  return {
    requiredChecks: Array.from(requiredChecks).map(redactText),
    optionalChecks: Array.from(optionalChecks).map(redactText),
    commands: Array.from(planCommands).filter(Boolean).map(redactText),
    canMarkCompletedWithoutVerification: requiredChecks.size === 0 && !blocked,
    reason: redactText(blocked ? "Critical/secret-bearing files require privacy gate and human review." : `Framework-aware ${framework} plan for ${maxRisk} risk.`)
  };
}

function genericVerificationPlan(input: { task: string; filesChanged: string[]; riskLevel: string }, manager: PackageManagerDetectionResult): VerificationPlan {
  const commands = commandsFor("generic", manager);
  const highRisk = input.riskLevel === "high" || input.riskLevel === "critical" || input.filesChanged.some((file) => summarizeRiskFromZones(file, "", COMMON_RISK_ZONES).riskLevel !== "low");
  return {
    requiredChecks: highRisk ? ["Inspect high-risk files and run available tests/build before completion."] : [],
    optionalChecks: ["Run available lightweight verification."],
    commands: [commands.test, commands.build, commands.lint].filter((command): command is string => Boolean(command)).map(redactText),
    canMarkCompletedWithoutVerification: !highRisk,
    reason: highRisk ? "Generic adapter found high-risk metadata." : "Generic adapter could not identify a specific framework but remained safe."
  };
}

function summarizeRiskFromZones(filePath: string, diffSummary: string, zones: RiskZone[]): DiffRiskSummary {
  const matches = zones.filter((zone) => zone.patterns.some((pattern) => matchesPattern(filePath, pattern)));
  const riskLevel = matches.length > 0 ? maxRiskLevel(matches.map((zone) => zone.riskLevel)) : hasSecretLikePath(filePath) || runEgressSecretScan(diffSummary).blocked ? "critical" : "low";
  const lane = riskToLane(riskLevel);
  return {
    filePath: safePath(filePath),
    riskLevel,
    lane,
    matchedZones: matches.map((zone) => zone.name),
    reason: matches[0]?.reason ?? (riskLevel === "critical" ? "Secret-like path or diff summary requires privacy gate." : "No framework risk zone matched.")
  };
}

function maxRiskLevel(levels: FrameworkRiskLevel[]): FrameworkRiskLevel {
  const order: Record<FrameworkRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  return levels.reduce((max, level) => order[level] > order[max] ? level : max, "low");
}

function riskToLane(level: FrameworkRiskLevel): FrameworkLane {
  if (level === "critical") {
    return "blocked";
  }
  if (level === "high") {
    return "verified";
  }
  if (level === "medium") {
    return "guarded";
  }
  return "fast";
}

async function hasPathPattern(repoRoot: string, pattern: string): Promise<boolean> {
  if (!pattern.includes("*")) {
    return exists(repoRoot, pattern);
  }
  const files = await findFiles(repoRoot, 3, (relative) => matchesPattern(relative, pattern), 1);
  return files.length > 0;
}

function matchesPattern(filePath: string, pattern: string): boolean {
  const file = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern === file) {
    return true;
  }
  if (normalizedPattern.startsWith("**/")) {
    return file.endsWith(normalizedPattern.slice(3)) || file.includes(`/${normalizedPattern.slice(3)}`);
  }
  if (normalizedPattern.endsWith("/**")) {
    return file.startsWith(normalizedPattern.slice(0, -3));
  }
  if (!normalizedPattern.includes("*")) {
    return file.endsWith(`/${normalizedPattern}`) || file === normalizedPattern;
  }
  const regex = new RegExp(`^${escapeRegExp(normalizedPattern).replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*")}$`, "i");
  return regex.test(file);
}

async function textFileContainsAny(repoRoot: string, relativeFiles: string[], needles: string[]): Promise<boolean> {
  for (const relativeFile of relativeFiles) {
    if (isSecretFile(relativeFile)) {
      continue;
    }
    const text = await safeReadText(path.join(repoRoot, relativeFile));
    const normalized = normalizeText(text);
    if (needles.some((needle) => normalized.includes(normalizeText(needle)))) {
      return true;
    }
  }
  return false;
}

async function safeReadText(filePath: string): Promise<string> {
  if (isSecretFile(path.basename(filePath)) || isSecretFile(filePath)) {
    return "";
  }
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile() || stats.size > 512_000) {
      return "";
    }
    return fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | undefined> {
  if (isSecretFile(path.basename(filePath)) || isSecretFile(filePath)) {
    return undefined;
  }
  try {
    const text = await safeReadText(filePath);
    return text ? JSON.parse(text) as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function dependencyNames(manifest: Record<string, unknown>): string[] {
  const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "require", "require-dev"];
  const names = new Set<string>();
  for (const section of sections) {
    const value = manifest[section];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        names.add(key);
      }
    }
  }
  return Array.from(names);
}

function hasScripts(manifest: Record<string, unknown>): boolean {
  return Boolean(manifest.scripts && typeof manifest.scripts === "object" && !Array.isArray(manifest.scripts));
}

function hasScript(manifest: Record<string, unknown>, script: string): boolean {
  return Boolean(hasScripts(manifest) && (manifest.scripts as Record<string, unknown>)[script]);
}

async function exists(repoRoot: string, relativePath: string): Promise<boolean> {
  return fileExists(path.join(repoRoot, relativePath));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listImmediateDirs(repoRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(repoRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !IGNORED_DIRS.has(entry.name)).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function listImmediateFiles(repoRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(repoRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function findFiles(repoRoot: string, maxDepth: number, predicate: (relativePath: string) => boolean, limit: number): Promise<string[]> {
  const root = path.resolve(repoRoot);
  const found: string[] = [];
  async function walk(current: string, depth: number): Promise<void> {
    if (found.length >= limit || depth > maxDepth) {
      return;
    }
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) {
        return;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }
      const absolute = path.join(current, entry.name);
      const relative = toRelative(root, absolute);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await walk(absolute, depth + 1);
        }
        continue;
      }
      if (entry.isFile() && !isSecretFile(relative) && predicate(normalizePath(relative))) {
        found.push(normalizePath(relative));
      }
    }
  }
  await walk(root, 0);
  return found;
}

function expandWorkspacePattern(repoRoot: string, pattern: string): string[] {
  const normalized = normalizePath(pattern).replace(/^!/, "");
  if (!normalized.endsWith("/*")) {
    return [];
  }
  const base = normalized.slice(0, -2);
  const absoluteBase = path.join(repoRoot, base);
  try {
    return require("node:fs").readdirSync(absoluteBase, { withFileTypes: true })
      .filter((entry: import("node:fs").Dirent) => entry.isDirectory() && !IGNORED_DIRS.has(entry.name))
      .map((entry: import("node:fs").Dirent) => path.join(absoluteBase, entry.name));
  } catch {
    return [];
  }
}

function parsePnpmWorkspace(text: string): string[] {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => /^-\s+["']?([^"']+)["']?$/.exec(line)?.[1])
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && !entry.startsWith("!"));
}

function parsePackageWorkspaces(manifest?: Record<string, unknown>): string[] {
  const workspaces = manifest?.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces.filter((entry): entry is string => typeof entry === "string");
  }
  if (workspaces && typeof workspaces === "object" && Array.isArray((workspaces as Record<string, unknown>).packages)) {
    return ((workspaces as Record<string, unknown>).packages as unknown[]).filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function inferGenericLanguage(repoRoot: string): string {
  const syncFs = require("node:fs") as typeof import("node:fs");
  if (syncFs.existsSync(path.join(repoRoot, "package.json"))) return "JavaScript";
  if (syncFs.existsSync(path.join(repoRoot, "composer.json"))) return "PHP";
  if (syncFs.existsSync(path.join(repoRoot, "pyproject.toml")) || syncFs.existsSync(path.join(repoRoot, "requirements.txt"))) return "Python";
  if (syncFs.existsSync(path.join(repoRoot, "Gemfile"))) return "Ruby";
  if (syncFs.existsSync(path.join(repoRoot, "pom.xml")) || syncFs.existsSync(path.join(repoRoot, "build.gradle"))) return "Java";
  try {
    if (syncFs.readdirSync(repoRoot).some((file) => file.endsWith(".csproj") || file.endsWith(".sln"))) return "C#";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function normalizeFrameworkName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "next" || normalized === "next.js") return "nextjs";
  if (normalized === "vite" || normalized === "react") return "react-vite";
  if (normalized === "spring") return "spring-boot";
  if (normalized === "aspnet" || normalized === "asp.net-core") return "dotnet";
  return normalized;
}

function isUiChange(task: string, files: string): boolean {
  return /(ui|ux|layout|component|page|style|css|tsx|jsx|vue|svelte)/i.test(`${task} ${files}`);
}

function isAuthChange(task: string, files: string): boolean {
  return /(auth|permission|policy|middleware|login|403|forbidden)/i.test(`${task} ${files}`);
}

function isDatabaseChange(files: string): boolean {
  return /(migration|schema|models?\.|prisma|database|db\/|migrations\/)/i.test(files);
}

function isDeployChange(files: string): boolean {
  return /(docker|deploy|nginx|workflow|vercel|netlify|appsettings|application\.)/i.test(files);
}

function addIf(set: Set<string>, value?: string): void {
  if (value) {
    set.add(value);
  }
}

function hasSecretLikePath(filePath: string): boolean {
  return isSecretFile(filePath) || /(secret|token|password|passwd|credential|connectionstring)/i.test(filePath);
}

function isSecretFile(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const base = path.basename(normalized);
  return SECRET_FILE_NAMES.has(base.toLowerCase()) || /^\.env(?:\..*)?$/i.test(base) || /\.(pem|key|p12|pfx|crt|cer|token)$/i.test(base);
}

function sanitizeDetection(result: FrameworkDetectionResult): FrameworkDetectionResult {
  return {
    ...result,
    primaryFramework: redactText(result.primaryFramework),
    secondaryFrameworks: result.secondaryFrameworks.map(redactText),
    language: redactText(result.language),
    packageManager: result.packageManager ? redactText(result.packageManager) : undefined,
    buildTool: result.buildTool ? redactText(result.buildTool) : undefined,
    testRunner: result.testRunner ? redactText(result.testRunner) : undefined,
    lintTool: result.lintTool ? redactText(result.lintTool) : undefined,
    apps: result.apps.map((app) => ({
      name: redactText(app.name),
      path: safePath(app.path),
      framework: redactText(app.framework),
      language: redactText(app.language)
    })),
    confidence: round(result.confidence),
    evidence: unique(result.evidence.map(redactText)).slice(0, 50)
  };
}

function safePath(filePath: string): string {
  return redactText(normalizePath(filePath)).replace(/\.\.\//g, "");
}

function prefixRelative(relativeRoot: string, value: string): string {
  return relativeRoot === "." ? value : `${relativeRoot}/${value}`;
}

function toRelative(root: string, target: string): string {
  return normalizePath(path.relative(root, target));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function htmlPage(title: string, body: string): string {
  return [
    "<!doctype html>",
    "<html><head>",
    `<meta charset="utf-8"><title>${escapeHtml(title)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;margin:24px;color:#17202a}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{background:#f6f8fa}</style>",
    "</head><body>",
    `<h1>${escapeHtml(title)}</h1>`,
    body,
    "</body></html>"
  ].join("\n");
}

function table(headers: string[], rows: string[][]): string {
  return [
    "<table>",
    `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`,
    "</table>"
  ].join("");
}

function escapeHtml(value: string): string {
  return redactText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DEFAULT_FRAMEWORK_CONFIG = [
  "frameworks:",
  "  enabled:",
  "    - nextjs",
  "    - react",
  "    - nestjs",
  "    - laravel",
  "    - django",
  "    - fastapi",
  "    - rails",
  "    - spring",
  "    - dotnet",
  "    - wordpress",
  "    - flutter",
  "",
  "detection:",
  "  confidence_threshold: 0.65",
  "  allow_multiple_frameworks: true",
  "",
  "verification:",
  "  prefer_targeted_checks: true",
  "  avoid_full_monorepo_build_if_possible: true",
  "",
  "risk:",
  "  framework_default_risk: medium",
  ""
].join("\n");
