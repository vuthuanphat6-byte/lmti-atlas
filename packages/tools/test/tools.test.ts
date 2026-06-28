import { describe, expect, it } from "vitest";
import { SecurityGuard } from "@atlas/security";
import { echoTool, ToolRegistry } from "../src/index";

describe("ToolRegistry", () => {
  it("executes a tool after security approval", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    const guard = new SecurityGuard({ id: "test", name: "Test", permissions: ["execute"] });

    const result = await registry.execute("echo", { value: "hello" }, { securityGuard: guard });

    expect(result.ok).toBe(true);
    expect(guard.getAuditLogs()).toHaveLength(1);
  });

  it("blocks tools without required permission", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    const guard = new SecurityGuard({ id: "test", name: "Test", permissions: ["read"] });

    const result = await registry.execute("echo", { value: "hello" }, { securityGuard: guard });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not allowed");
  });
});
