import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendAuditEvent,
  auditSensitiveAccess,
  createPrivacyContext,
  evaluateAccess,
  readAuditEvents,
  redactPII,
  redactSecrets,
  redactText,
  retainAuditEvents,
  runEgressSecretScan,
  verifyAuditIntegrity
} from "../src/index";

const baseRecord = {
  id: "record-1",
  title: "Record",
  content: "content"
};

const fixtureSecrets = {
  openai: ["sk", "proj", "abcdefghijklmnopqrstuvwxyz123456"].join("-"),
  anthropic: ["sk", "ant", "abcdefghijklmnopqrstuvwxyz123456"].join("-"),
  github: ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_"),
  aws: ["AKIA", "1234567890ABCDEF"].join(""),
  databaseUrl: ["postgres", "://user:pass@example.test:5432/app"].join(""),
  databaseUrlPrefix: ["postgres", "://user:pass"].join(""),
  privateKey: ["-----BEGIN", " PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"].join("")
};

describe("Cognitive Privacy Layer", () => {
  it("allows public memory and internal memory for developer", () => {
    expect(evaluateAccess({ ...baseRecord, sensitivity: "public" }, createPrivacyContext({ role: "external_model" })).decision).toBe("allow");
    expect(evaluateAccess({ ...baseRecord, sensitivity: "internal" }, createPrivacyContext({ role: "developer" })).decision).toBe("allow");
    expect(evaluateAccess({ ...baseRecord, sensitivity: "internal" }, createPrivacyContext({ role: "external_model" })).decision).toBe("summarize");
  });

  it("summarizes confidential memory for agent and external model", () => {
    expect(evaluateAccess({ ...baseRecord, sensitivity: "confidential" }, createPrivacyContext({ role: "agent" })).decision).toBe("summarize");
    expect(evaluateAccess({ ...baseRecord, sensitivity: "confidential" }, createPrivacyContext({ role: "external_model" })).decision).toBe("summarize");
  });

  it("denies secret memory by default and allows only owner with explicit secret flag", () => {
    expect(evaluateAccess({ ...baseRecord, sensitivity: "secret" }, createPrivacyContext({ role: "developer" })).decision).toBe("deny");
    expect(
      evaluateAccess(
        { ...baseRecord, sensitivity: "secret" },
        createPrivacyContext({ role: "owner", includeSecret: true, includeRaw: true })
      ).decision
    ).toBe("allow");
  });

  it("redacts secrets and PII", () => {
    expect(redactSecrets("Stripe key: sk_test_123456789")).not.toContain("sk_test_123456789");
    expect(redactSecrets(`OpenAI: ${fixtureSecrets.openai}`)).not.toContain(fixtureSecrets.openai);
    expect(redactSecrets(`Anthropic: ${fixtureSecrets.anthropic}`)).not.toContain(fixtureSecrets.anthropic);
    expect(redactSecrets(`GitHub: ${fixtureSecrets.github}`)).not.toContain(fixtureSecrets.github);
    expect(redactSecrets("cookie=sessionid1234567890")).not.toContain("sessionid1234567890");
    expect(redactSecrets("password=super-secret")).toContain("[REDACTED]");
    expect(redactSecrets("token: abcdefghijklmnop")).toContain("[REDACTED]");
    expect(redactPII("Contact admin@example.com or +1 415-555-1212")).not.toContain("admin@example.com");
  });

  it("preserves opaque UUID command handles while redacting PII", () => {
    const id = "34cbafe7-4155-493c-93c2-602d7fa7c482";
    const output = redactText(JSON.stringify({ id, contact: "+1 415-555-1212" }));

    expect(output).toContain(id);
    expect(output).not.toContain("+1 415-555-1212");
    expect(output).toContain("[REDACTED_PHONE]");
  });

  it("writes audit events for sensitive access", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "atlas-privacy-"));
    await auditSensitiveAccess(
      cwd,
      { ...baseRecord, sensitivity: "confidential" },
      createPrivacyContext({ role: "agent", command: "context" }),
      "summarize",
      "Confidential cognition is summarized."
    );

    const events = await readAuditEvents(cwd);
    expect(events[0]?.recordId).toBe("record-1");
    expect(events[0]?.sensitivity).toBe("confidential");
    expect(events[0]?.decision).toBe("summarize");
    expect(events[0]?.hash).toBeTruthy();
  });

  it("blocks broader egress secret fixtures", () => {
    const privateKey = fixtureSecrets.privateKey;
    const result = runEgressSecretScan({
      aws: fixtureSecrets.aws,
      jwt: "eyJaaaaaaaaaaa.bbbbbbbbbbbbb.ccccccccccccc",
      db: fixtureSecrets.databaseUrl,
      assignment: "api_key=abc123456",
      openai: fixtureSecrets.openai,
      anthropic: fixtureSecrets.anthropic,
      github: fixtureSecrets.github,
      cookie: "cookie=sessionid1234567890",
      privateKey
    });

    expect(result.blocked).toBe(true);
    expect(result.findings).toEqual(
      expect.arrayContaining(["private_key", "aws_access_key", "jwt", "database_url", "secret_assignment", "openai_api_key", "anthropic_api_key", "github_token", "cookie_or_session"])
    );
    expect(result.redactedPreview).not.toContain("abc123456");
    expect(result.redactedPreview).not.toContain(fixtureSecrets.databaseUrlPrefix);
  });

  it("verifies audit tamper evidence and supports retention", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "atlas-privacy-"));
    for (let index = 0; index < 3; index += 1) {
      await appendAuditEvent(cwd, {
        action: "test.audit",
        recordId: `record-${index}`,
        sensitivity: "internal",
        role: "agent",
        decision: "allow",
        command: "test",
        reason: `event ${index}`
      });
    }

    await expect(verifyAuditIntegrity(cwd)).resolves.toMatchObject({ valid: true, checked: 3 });

    const retention = await retainAuditEvents(cwd, 2);
    expect(retention.retained).toBe(2);
    expect(retention.archived).toBe(1);
    await expect(verifyAuditIntegrity(cwd)).resolves.toMatchObject({ valid: true, checked: 2 });

    const auditPath = path.join(cwd, ".lmti", "privacy", "audit.jsonl");
    const tampered = (await readFile(auditPath, "utf8")).replace("event 2", "event tampered");
    await writeFile(auditPath, tampered, "utf8");
    const integrity = await verifyAuditIntegrity(cwd);
    expect(integrity.valid).toBe(false);
    expect(integrity.failures.some((failure) => failure.reason === "hash_mismatch")).toBe(true);
  });
});
