import { redactText } from "@atlas/privacy";
import { clamp01, normalizeMemoryText, round, tokenizeMemoryText } from "./encode";

export const LIBRARY_ZONES = [
  "architecture",
  "codebase",
  "workflow",
  "deployment",
  "security",
  "decision",
  "lesson",
  "incident",
  "customer",
  "business",
  "prompting",
  "unknown"
] as const;

export type LibraryZone = (typeof LIBRARY_ZONES)[number];

export type LibraryPrivacyLevel = "public" | "internal" | "private" | "secret" | "do_not_prompt";

export interface LibraryAlgorithmInput {
  title?: string;
  content: string;
  source?: string;
  sourceType?: string;
  tags?: string[];
}

export interface LibraryClassification {
  zone: LibraryZone;
  tags: string[];
  privacyLevel: LibraryPrivacyLevel;
  confidence: number;
  importance: number;
  summary: string;
  reasons: string[];
  zoneScores: Record<LibraryZone, number>;
}

interface ZoneProfile {
  zone: LibraryZone;
  keywords: string[];
  weight: number;
}

const ZONE_PROFILES: ZoneProfile[] = [
  {
    zone: "architecture",
    weight: 1.1,
    keywords: [
      "architecture",
      "module",
      "service",
      "database",
      "api",
      "queue",
      "worker",
      "schema",
      "boundary",
      "data flow",
      "frontend",
      "backend"
    ]
  },
  {
    zone: "codebase",
    weight: 1,
    keywords: [
      "codebase",
      "directory",
      "folder",
      "component",
      "helper",
      "function",
      "class",
      "package",
      "src",
      "test",
      "convention"
    ]
  },
  {
    zone: "workflow",
    weight: 1.05,
    keywords: [
      "workflow",
      "quy trinh",
      "order",
      "packing",
      "dong goi",
      "shipping",
      "erp",
      "print",
      "in ao",
      "fulfillment",
      "operation"
    ]
  },
  {
    zone: "deployment",
    weight: 1.15,
    keywords: ["pm2", "deploy", "deployment", "build", "healthcheck", "nginx", "server", "release", "rollback", "production", "docker"]
  },
  {
    zone: "security",
    weight: 1.25,
    keywords: [
      "secret",
      ".env",
      "token",
      "permission",
      "privacy",
      "least privilege",
      "guardrail",
      "auth",
      "role",
      "access",
      "credential",
      "403"
    ]
  },
  {
    zone: "decision",
    weight: 1.05,
    keywords: ["decision", "quyet dinh", "trade-off", "tradeoff", "why", "vi sao", "chon", "khong dung", "use", "selected", "rationale"]
  },
  {
    zone: "lesson",
    weight: 1.2,
    keywords: ["lesson", "learned", "sau task", "lan sau", "bug nay", "avoid", "tranh", "da hoc", "anti-pattern", "post-task"]
  },
  {
    zone: "incident",
    weight: 1.15,
    keywords: ["incident", "production error", "prod error", "outage", "root cause", "rca", "hotfix", "resolved", "unresolved", "fix applied"]
  },
  {
    zone: "customer",
    weight: 0.95,
    keywords: ["customer", "client", "project", "tenant", "account", "stakeholder", "khach hang"]
  },
  {
    zone: "business",
    weight: 1.08,
    keywords: ["business", "pricing", "credit", "invoice", "billing", "permission rule", "policy", "logic", "tinh tien", "phan quyen"]
  },
  {
    zone: "prompting",
    weight: 0.95,
    keywords: ["prompt", "system prompt", "routing prompt", "qa prompt", "deploy prompt", "instruction", "model message"]
  }
];

const ZONE_TAGS: Record<LibraryZone, string[]> = {
  architecture: ["architecture"],
  codebase: ["codebase"],
  workflow: ["workflow"],
  deployment: ["deployment"],
  security: ["security"],
  decision: ["decision"],
  lesson: ["lesson"],
  incident: ["incident"],
  customer: ["customer"],
  business: ["business"],
  prompting: ["prompting"],
  unknown: ["review"]
};

const HIGH_IMPORTANCE_ZONES = new Set<LibraryZone>(["deployment", "security", "lesson", "incident", "decision", "business"]);

export function classifyLibraryMemory(input: LibraryAlgorithmInput): LibraryClassification {
  const title = input.title?.trim() || "Untitled memory";
  const content = input.content.trim();
  const normalized = normalizeMemoryText([title, content, input.source, input.sourceType, ...(input.tags ?? [])].filter(Boolean).join(" "));
  const scores = createEmptyZoneScores();
  const reasons: string[] = [];

  for (const profile of ZONE_PROFILES) {
    let score = 0;
    const matched: string[] = [];
    for (const keyword of profile.keywords) {
      const normalizedKeyword = normalizeMemoryText(keyword);
      if (normalized.includes(normalizedKeyword)) {
        const keywordWeight = normalizedKeyword.includes(" ") ? 1.8 : 1;
        score += keywordWeight;
        matched.push(keyword);
      }
    }
    scores[profile.zone] = round(score * profile.weight);
    if (matched.length > 0) {
      reasons.push(`${profile.zone}: matched ${matched.slice(0, 4).join(", ")}`);
    }
  }

  const ranked = LIBRARY_ZONES
    .filter((zone) => zone !== "unknown")
    .map((zone) => ({ zone, score: scores[zone] }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0] ?? { zone: "unknown" as LibraryZone, score: 0 };
  const second = ranked[1]?.score ?? 0;
  const total = ranked.reduce((sum, entry) => sum + entry.score, 0);
  const confidence = best.score <= 0 ? 0 : round(clamp01((best.score + Math.max(0, best.score - second)) / Math.max(total, best.score)));
  const zone = best.score < 1.2 || confidence < 0.28 ? "unknown" : best.zone;

  if (zone === "unknown") {
    reasons.push("unknown: low classifier confidence; needs review");
  }

  const tags = normalizeLibraryTags([
    ...(input.tags ?? []),
    ...(ZONE_TAGS[zone] ?? []),
    ...tokenizeMemoryText(title).slice(0, 3),
    ...tokenizeMemoryText(content).slice(0, 5)
  ]);
  const privacyLevel = inferInitialPrivacyLevel(normalized);
  const importance = estimateImportance(zone, normalized, confidence);

  return {
    zone,
    tags,
    privacyLevel,
    confidence,
    importance,
    summary: createLibrarySummary(title, content),
    reasons,
    zoneScores: scores
  };
}

export function suggestZonesForTask(task: string, requested?: LibraryZone[]): LibraryZone[] {
  if (requested && requested.length > 0) {
    return uniqueZones(requested);
  }

  const classification = classifyLibraryMemory({ title: "task", content: task, sourceType: "task" });
  const normalized = normalizeMemoryText(task);
  const zones = new Set<LibraryZone>();

  if (normalized.includes("403") || normalized.includes("permission") || normalized.includes("forbidden") || normalized.includes("role")) {
    ["security", "workflow", "lesson", "codebase", "incident"].forEach((zone) => zones.add(zone as LibraryZone));
  }
  if (normalized.includes("deploy") || normalized.includes("production") || normalized.includes("release") || normalized.includes("rollback")) {
    ["deployment", "security", "lesson", "architecture"].forEach((zone) => zones.add(zone as LibraryZone));
  }
  if (normalized.includes("prompt")) {
    ["prompting", "workflow", "business", "customer"].forEach((zone) => zones.add(zone as LibraryZone));
  }
  if (normalized.includes("erp") || normalized.includes("order") || normalized.includes("credit") || normalized.includes("shipping") || normalized.includes("packing")) {
    ["workflow", "business", "customer", "lesson"].forEach((zone) => zones.add(zone as LibraryZone));
  }
  if (classification.zone !== "unknown") {
    zones.add(classification.zone);
  }

  zones.add("lesson");
  zones.add("security");
  return Array.from(zones).slice(0, 6);
}

export function isLibraryZone(value: string): value is LibraryZone {
  return (LIBRARY_ZONES as readonly string[]).includes(value);
}

export function isLibraryPrivacyLevel(value: string): value is LibraryPrivacyLevel {
  return ["public", "internal", "private", "secret", "do_not_prompt"].includes(value);
}

export function normalizeLibraryTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .flatMap((tag) => tag.split(/[, ]+/))
        .map((tag) => normalizeMemoryText(tag).trim())
        .filter(Boolean)
    )
  ).slice(0, 24);
}

function inferInitialPrivacyLevel(normalized: string): LibraryPrivacyLevel {
  if (normalized.includes("private key") || normalized.includes("begin rsa private key") || normalized.includes("begin openssh private key")) {
    return "do_not_prompt";
  }
  if (normalized.includes(".env") || normalized.includes("api_key") || normalized.includes("password") || normalized.includes("access_token")) {
    return "secret";
  }
  if (normalized.includes("customer") || normalized.includes("client") || normalized.includes("private") || normalized.includes("confidential")) {
    return "private";
  }
  if (normalized.includes("public")) {
    return "public";
  }
  return "internal";
}

function estimateImportance(zone: LibraryZone, normalized: string, confidence: number): number {
  let score = zone === "unknown" ? 0.35 : 0.45 + confidence * 0.25;
  if (HIGH_IMPORTANCE_ZONES.has(zone)) {
    score += 0.16;
  }
  if (/\b(production|security|secret|permission|deploy|incident|403|rollback)\b/i.test(normalized)) {
    score += 0.16;
  }
  return round(clamp01(score));
}

function createLibrarySummary(title: string, content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  const firstSentence = compact.split(/[.!?]\s/u)[0] || compact;
  const summary = `${redactText(title)}: ${redactText(firstSentence)}`.trim();
  return summary.length <= 320 ? summary : `${summary.slice(0, 319).trim()}...`;
}

function createEmptyZoneScores(): Record<LibraryZone, number> {
  return {
    architecture: 0,
    codebase: 0,
    workflow: 0,
    deployment: 0,
    security: 0,
    decision: 0,
    lesson: 0,
    incident: 0,
    customer: 0,
    business: 0,
    prompting: 0,
    unknown: 0
  };
}

function uniqueZones(zones: LibraryZone[]): LibraryZone[] {
  return Array.from(new Set(zones.filter(isLibraryZone)));
}
