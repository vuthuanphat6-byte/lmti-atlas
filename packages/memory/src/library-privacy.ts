import { hasSecretLikeMaterial, redactText } from "@atlas/privacy";
import { normalizeMemoryText } from "./encode";
import type { LibraryPrivacyLevel } from "./library-algorithm";

export interface PrivacyGateInput {
  title: string;
  content: string;
  summary: string;
  privacyLevel: LibraryPrivacyLevel;
}

export interface PrivacyGateResult {
  title: string;
  content: string;
  summary: string;
  privacyLevel: LibraryPrivacyLevel;
  rawContentBlocked: boolean;
  redacted: boolean;
  findings: string[];
  events: Array<{
    eventType: "redacted" | "blocked_by_privacy_gate";
    payload: Record<string, unknown>;
  }>;
}

export interface PromptPrivacyResult<T> {
  allowed: boolean;
  item?: T;
  mode: "raw" | "summary" | "blocked";
  reason: string;
  findings: string[];
}

export interface PromptMemoryShape {
  id: string;
  title: string;
  content: string;
  summary: string;
  privacyLevel: LibraryPrivacyLevel;
}

const EXTRA_SECRET_PATTERNS: Array<{ id: string; regex: RegExp; level: LibraryPrivacyLevel }> = [
  { id: "env_file", regex: /(^|\s)\.env(?:\s|$|[./\\_-])/i, level: "do_not_prompt" },
  { id: "database_url_name", regex: /\bDATABASE_URL\b/i, level: "secret" },
  { id: "jwt_secret_name", regex: /\bJWT_SECRET\b/i, level: "secret" },
  { id: "api_key_name", regex: /\b(?:OPENAI_API_KEY|API_KEY)\b/i, level: "secret" },
  { id: "private_key_name", regex: /\bPRIVATE_KEY\b/i, level: "do_not_prompt" },
  { id: "rsa_private_key", regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/i, level: "do_not_prompt" },
  { id: "password_assignment", regex: /\bpassword\s*=/i, level: "secret" },
  { id: "access_token", regex: /\baccess_token\b/i, level: "secret" },
  { id: "refresh_token", regex: /\brefresh_token\b/i, level: "secret" },
  { id: "cookie", regex: /\bcookie\b\s*[:=]/i, level: "secret" },
  { id: "session", regex: /\bsession(?:[_-]?id|[_-]?secret)?\b\s*[:=]/i, level: "secret" },
  { id: "ssh_private_key", regex: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/i, level: "do_not_prompt" },
  { id: "connection_string", regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/i, level: "secret" },
  { id: "email_password_combo", regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}[\s\S]{0,80}\bpassword\b\s*[:=]/i, level: "secret" },
  { id: "long_token", regex: /\b[A-Za-z0-9_-]{48,}\b/, level: "secret" }
];

const PRIVACY_RANK: Record<LibraryPrivacyLevel, number> = {
  public: 0,
  internal: 1,
  private: 2,
  secret: 3,
  do_not_prompt: 4
};

export function applyLibraryWritePrivacyGate(input: PrivacyGateInput): PrivacyGateResult {
  const combined = `${input.title}\n${input.content}\n${input.summary}`;
  const findings = detectLibraryPrivacyFindings(combined);
  const secretLike = hasSecretLikeMaterial(combined);
  if (secretLike && !findings.includes("secret_like_material")) {
    findings.push("secret_like_material");
  }

  const detectedLevel = highestDetectedPrivacy(findings);
  const privacyLevel = maxPrivacy(input.privacyLevel, detectedLevel);
  const rawContentBlocked = privacyLevel === "secret" || privacyLevel === "do_not_prompt";
  const redactedContent = rawContentBlocked ? redactText(input.content) : redactText(input.content);
  const redactedSummary = redactText(input.summary);
  const redactedTitle = redactText(input.title);
  const redacted = redactedContent !== input.content || redactedSummary !== input.summary || redactedTitle !== input.title || rawContentBlocked;
  const events: PrivacyGateResult["events"] = [];

  if (rawContentBlocked) {
    events.push({
      eventType: "blocked_by_privacy_gate",
      payload: { phase: "write", privacyLevel, findings }
    });
  }
  if (redacted) {
    events.push({
      eventType: "redacted",
      payload: { phase: "write", privacyLevel, findings }
    });
  }

  return {
    title: redactedTitle,
    content: rawContentBlocked ? redactedContent : redactedContent,
    summary: privacyLevel === "do_not_prompt" ? "Sensitive memory withheld by privacy gate." : redactedSummary,
    privacyLevel,
    rawContentBlocked,
    redacted,
    findings,
    events
  };
}

export function filterLibraryMemoryForPrompt<T extends PromptMemoryShape>(
  item: T,
  options: { privacyMode?: "safe" | "internal" } = {}
): PromptPrivacyResult<T> {
  const findings = detectLibraryPrivacyFindings(`${item.title}\n${item.content}\n${item.summary}`);
  const privacyMode = options.privacyMode ?? "safe";

  if (item.privacyLevel === "secret" || item.privacyLevel === "do_not_prompt") {
    return {
      allowed: false,
      mode: "blocked",
      reason: `${item.privacyLevel} memory blocked by privacy gate`,
      findings
    };
  }

  if (item.privacyLevel === "private") {
    return {
      allowed: true,
      mode: "summary",
      reason: "private memory returned as redacted summary",
      findings,
      item: {
        ...item,
        content: "",
        summary: redactText(item.summary)
      }
    };
  }

  if (item.privacyLevel === "internal" && (privacyMode === "safe" || findings.length > 0)) {
    return {
      allowed: true,
      mode: "summary",
      reason: findings.length > 0 ? "internal memory had sensitive patterns and was summarized" : "internal memory summarized by safe mode",
      findings,
      item: {
        ...item,
        content: "",
        summary: redactText(item.summary)
      }
    };
  }

  return {
    allowed: true,
    mode: "raw",
    reason: "memory passed privacy gate",
    findings,
    item: {
      ...item,
      content: redactText(item.content),
      summary: redactText(item.summary)
    }
  };
}

export function detectLibraryPrivacyFindings(text: string): string[] {
  const findings = new Set<string>();
  const normalized = normalizeMemoryText(text);

  for (const pattern of EXTRA_SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text) || pattern.regex.test(normalized)) {
      findings.add(pattern.id);
    }
  }

  if (hasSecretLikeMaterial(text)) {
    findings.add("secret_like_material");
  }

  return Array.from(findings);
}

function highestDetectedPrivacy(findings: string[]): LibraryPrivacyLevel {
  let level: LibraryPrivacyLevel = "internal";
  for (const finding of findings) {
    const pattern = EXTRA_SECRET_PATTERNS.find((entry) => entry.id === finding);
    if (pattern) {
      level = maxPrivacy(level, pattern.level);
    }
  }
  if (findings.includes("secret_like_material")) {
    level = maxPrivacy(level, "secret");
  }
  return level;
}

function maxPrivacy(left: LibraryPrivacyLevel, right: LibraryPrivacyLevel): LibraryPrivacyLevel {
  return PRIVACY_RANK[left] >= PRIVACY_RANK[right] ? left : right;
}
