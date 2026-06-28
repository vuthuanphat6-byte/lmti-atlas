import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AccessDecision,
  AccessRole,
  AuditEvent,
  PrivacyContext,
  PrivacyEvaluation,
  PrivacyPolicy,
  PrivacyProtectedRecord,
  SensitivityLevel
} from "@atlas/types";

export const PRIVACY_DIR = "privacy";
export const AUDIT_FILE = "audit.jsonl";

const POLICIES: Record<SensitivityLevel, PrivacyPolicy> = {
  public: {
    id: "privacy-public",
    name: "Public",
    description: "Public cognition may be exported by default.",
    sensitivity: "public",
    allowedRoles: ["owner", "maintainer", "developer", "agent", "readonly", "external_model"],
    defaultDecision: "allow",
    allowRawExport: true,
    allowContextExport: true,
    requireAudit: false,
    requireExplicitFlag: false
  },
  internal: {
    id: "privacy-internal",
    name: "Internal",
    description: "Internal cognition is visible to trusted project roles.",
    sensitivity: "internal",
    allowedRoles: ["owner", "maintainer", "developer", "agent"],
    defaultDecision: "deny",
    allowRawExport: true,
    allowContextExport: true,
    requireAudit: false,
    requireExplicitFlag: false
  },
  confidential: {
    id: "privacy-confidential",
    name: "Confidential",
    description: "Confidential cognition is summarized by default and audited.",
    sensitivity: "confidential",
    allowedRoles: ["owner", "maintainer", "developer", "agent", "readonly", "external_model"],
    defaultDecision: "summarize",
    allowRawExport: false,
    allowContextExport: true,
    requireAudit: true,
    requireExplicitFlag: false
  },
  secret: {
    id: "privacy-secret",
    name: "Secret",
    description: "Secret cognition is denied by default and requires owner opt-in.",
    sensitivity: "secret",
    allowedRoles: ["owner"],
    defaultDecision: "deny",
    allowRawExport: false,
    allowContextExport: false,
    requireAudit: true,
    requireExplicitFlag: true
  }
};

export function createPrivacyContext(input: Partial<PrivacyContext> = {}): PrivacyContext {
  return {
    role: input.role ?? "developer",
    projectId: input.projectId ?? "default",
    purpose: input.purpose ?? "local ATLAS command",
    includeSecret: input.includeSecret ?? false,
    includeRaw: input.includeRaw ?? false,
    command: input.command ?? "unknown",
    timestamp: input.timestamp ?? new Date().toISOString()
  };
}

export function evaluateAccess(record: PrivacyProtectedRecord, privacyContext: PrivacyContext): PrivacyEvaluation {
  const policy = POLICIES[record.sensitivity];

  if (record.sensitivity === "public") {
    return { decision: "allow", policy, reason: "Public cognition is allowed by default." };
  }

  if (record.sensitivity === "internal") {
    if (policy.allowedRoles.includes(privacyContext.role)) {
      return { decision: "allow", policy, reason: "Internal cognition allowed for trusted project role." };
    }
    return { decision: "deny", policy, reason: "Role is not allowed to read internal cognition." };
  }

  if (record.sensitivity === "confidential") {
    if (privacyContext.role === "external_model") {
      return { decision: "summarize", policy, reason: "External models cannot receive raw confidential cognition." };
    }
    if ((privacyContext.role === "owner" || privacyContext.role === "maintainer") && privacyContext.includeRaw) {
      return { decision: "allow", policy, reason: "Privileged role explicitly requested raw confidential cognition." };
    }
    return { decision: "summarize", policy, reason: "Confidential cognition is summarized by default." };
  }

  if (privacyContext.role === "owner" && privacyContext.includeSecret && privacyContext.includeRaw) {
    return { decision: "allow", policy, reason: "Owner explicitly requested secret cognition." };
  }

  return { decision: "deny", policy, reason: "Secret cognition is denied unless owner explicitly includes secrets." };
}

export function canReadRaw(record: PrivacyProtectedRecord, privacyContext: PrivacyContext): boolean {
  return evaluateAccess(record, privacyContext).decision === "allow";
}

export function canExportToContext(record: PrivacyProtectedRecord, privacyContext: PrivacyContext): boolean {
  const evaluation = evaluateAccess(record, privacyContext);
  if (evaluation.decision === "deny") {
    return false;
  }
  if (record.sensitivity === "secret") {
    return privacyContext.role === "owner" && privacyContext.includeSecret;
  }
  return evaluation.policy.allowContextExport;
}

export function shouldRedact(record: PrivacyProtectedRecord, privacyContext: PrivacyContext): boolean {
  const decision = evaluateAccess(record, privacyContext).decision;
  return decision === "redact" || decision === "deny";
}

export function shouldSummarize(record: PrivacyProtectedRecord, privacyContext: PrivacyContext): boolean {
  return evaluateAccess(record, privacyContext).decision === "summarize";
}

export function redactSecrets(text: string): string {
  return text
    .replace(/-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bsk_(?:test|live)_[A-Za-z0-9_]+\b/g, "[REDACTED_STRIPE_KEY]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\b(api[_-]?key|secret|token|password|passwd|private[_-]?key)\b\s*[:=]\s*["']?[^"'\s]+/gi, "$1=[REDACTED]")
    .replace(/\b([A-Z][A-Z0-9_]{2,})\s*=\s*["']?[^"'\s]+/g, "$1=[REDACTED]");
}

export function redactPII(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}\b/g, "[REDACTED_PHONE]");
}

export function redactText(text: string): string {
  return redactPII(redactSecrets(text));
}

export function redactBySensitivity<T extends PrivacyProtectedRecord>(record: T, privacyContext: PrivacyContext): T {
  const evaluation = evaluateAccess(record, privacyContext);
  if (evaluation.decision === "allow") {
    return {
      ...record,
      content: redactText(record.content ?? "")
    };
  }
  if (evaluation.decision === "summarize") {
    return {
      ...record,
      content: createSafeSummary(record)
    };
  }
  return {
    ...record,
    content: "[REDACTED]"
  };
}

export function createSafeSummary(record: PrivacyProtectedRecord): string {
  const title = record.title ? ` "${redactText(record.title)}"` : "";
  return `${record.sensitivity} memory${title}; raw content withheld by Cognitive Privacy Layer.`;
}

export async function appendAuditEvent(cwd: string, event: Omit<AuditEvent, "id" | "timestamp">): Promise<AuditEvent> {
  const audit = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event
  };
  await initPrivacyStorage(cwd);
  await fs.appendFile(auditPath(cwd), `${JSON.stringify(audit)}\n`, "utf8");
  return audit;
}

export async function readAuditEvents(cwd: string, limit = 50): Promise<AuditEvent[]> {
  await initPrivacyStorage(cwd);
  const content = await fs.readFile(auditPath(cwd), "utf8");
  const events = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEvent);
  return events.slice(Math.max(0, events.length - limit)).reverse();
}

export async function auditSensitiveAccess(
  cwd: string,
  record: PrivacyProtectedRecord,
  privacyContext: PrivacyContext,
  decision: AccessDecision,
  reason: string
): Promise<void> {
  if (record.sensitivity !== "confidential" && record.sensitivity !== "secret") {
    return;
  }
  await appendAuditEvent(cwd, {
    action: "memory.access",
    recordId: record.id,
    sensitivity: record.sensitivity,
    role: privacyContext.role,
    decision,
    command: privacyContext.command,
    reason
  });
}

async function initPrivacyStorage(cwd: string): Promise<void> {
  const directory = path.resolve(cwd, ".lmti", PRIVACY_DIR);
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.access(auditPath(cwd));
  } catch {
    await fs.writeFile(auditPath(cwd), "", "utf8");
  }
}

function auditPath(cwd: string): string {
  return path.resolve(cwd, ".lmti", PRIVACY_DIR, AUDIT_FILE);
}
