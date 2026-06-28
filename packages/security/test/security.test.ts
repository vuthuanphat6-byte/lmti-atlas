import { describe, expect, it } from "vitest";
import { SecurityGuard } from "../src/index";

describe("SecurityGuard", () => {
  it("allows read permissions and writes audit logs", () => {
    const guard = new SecurityGuard({
      id: "test",
      name: "Test",
      permissions: ["read"]
    });

    const result = guard.checkToolExecution({
      action: "tool.execute",
      toolName: "memory.search",
      permissionRequired: "read"
    });

    expect(result.allowed).toBe(true);
    expect(guard.getAuditLogs()).toHaveLength(1);
  });

  it("blocks admin permissions when policy does not allow them", () => {
    const guard = new SecurityGuard({
      id: "test",
      name: "Test",
      permissions: ["read", "execute"]
    });

    const result = guard.checkToolExecution({
      action: "tool.execute",
      toolName: "dangerous.admin",
      permissionRequired: "admin"
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not allowed");
  });
});
