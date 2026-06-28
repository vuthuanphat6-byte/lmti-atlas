import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditSensitiveAccess,
  createPrivacyContext,
  evaluateAccess,
  readAuditEvents,
  redactPII,
  redactSecrets
} from "../src/index";

const baseRecord = {
  id: "record-1",
  title: "Record",
  content: "content"
};

describe("Cognitive Privacy Layer", () => {
  it("allows public memory and internal memory for developer", () => {
    expect(evaluateAccess({ ...baseRecord, sensitivity: "public" }, createPrivacyContext({ role: "external_model" })).decision).toBe("allow");
    expect(evaluateAccess({ ...baseRecord, sensitivity: "internal" }, createPrivacyContext({ role: "developer" })).decision).toBe("allow");
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
    expect(redactSecrets("password=super-secret")).toContain("[REDACTED]");
    expect(redactSecrets("token: abcdefghijklmnop")).toContain("[REDACTED]");
    expect(redactPII("Contact admin@example.com or +1 415-555-1212")).not.toContain("admin@example.com");
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
  });
});
