import { describe, expect, it } from "vitest";
import { InMemoryStore, LongTermMemory, ShortTermMemory } from "@atlas/memory";
import { DeveloperAgent } from "../src/index";

describe("sample agents", () => {
  it("responds through runtime-provided tool callback", async () => {
    const store = new InMemoryStore();
    const response = await DeveloperAgent.respond("fix packing label bug", {
      sessionId: "session-1",
      projectId: "NOIR",
      shortTermMemory: new ShortTermMemory(store),
      longTermMemory: new LongTermMemory(store),
      executeTool: async () => ({ ok: true, data: [] })
    });

    expect(response.agentId).toBe("developer");
    expect(response.message).toContain("Developer analysis");
  });
});
