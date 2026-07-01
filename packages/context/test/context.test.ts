import { describe, expect, it } from "vitest";
import { DefaultContextLoader } from "../src/index";

describe("DefaultContextLoader", () => {
  it("loads app context with related memory", async () => {
    const loader = new DefaultContextLoader();
    const context = await loader.load({
      project: { projectId: "sample-project", name: "Sample Project" },
      user: { currentGoal: "fix packing label bug" },
      activeAgentId: "developer",
      securityPolicy: { id: "local", name: "Local", permissions: ["read"] },
      memorySearch: async () => []
    });

    expect(context.project.projectId).toBe("sample-project");
    expect(context.activeAgentId).toBe("developer");
  });
});
