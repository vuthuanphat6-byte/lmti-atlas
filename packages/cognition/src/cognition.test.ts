import { describe, expect, it } from "vitest";
import {
  arbitrateCognitiveFocus,
  broadcastWorkspace,
  CognitiveBlackboard,
  createPredictionState,
  estimateIntegratedInformation,
  estimatePredictionError,
  explainCognitiveState,
  runCognitiveCycle,
  selectWorkspaceWinner
} from "./index";
import type { BlackboardEntry, CognitiveContextItem, CognitiveGoal, IntegratedComponent } from "./types";

const goal: CognitiveGoal = {
  id: "goal:dashboard-permission",
  title: "Fix permission routing issue",
  description: "Diagnose permission routing and route permission behavior.",
  priority: 0.9,
  successCriteria: ["inspect permission guard", "verify route"],
  constraints: ["do not expose secret memory"]
};

function component(id: string, kind: IntegratedComponent["kind"], connectedTo: string[], cues: string[] = []): IntegratedComponent {
  return {
    id,
    kind,
    label: id,
    sourceRefs: [id],
    connectedTo,
    contextCues: cues,
    weight: 1,
    sensitivity: "internal",
    promptPolicy: "summarize_only",
    privacyDecision: "summary: test"
  };
}

function entry(id: string, overrides: Partial<BlackboardEntry> = {}): BlackboardEntry {
  return {
    id,
    source: "context_pack",
    kind: "memory",
    content: `Dashboard permission route evidence ${id}`,
    summary: `Dashboard permission route evidence ${id}`,
    priority: 0.6,
    activation: 0.6,
    confidence: 0.7,
    contextCues: ["dashboard", "permission", "route"],
    sensitivity: "internal",
    promptPolicy: "summarize_only",
    privacyDecision: "summary: test",
    sourceRefs: [id],
    createdAt: "2026-06-29T00:00:00.000Z",
    ...overrides
  };
}

function contextItem(id: string, overrides: Partial<CognitiveContextItem> = {}): CognitiveContextItem {
  return {
    id,
    source: "long_term_memory",
    kind: "memory",
    content: `Partner dashboard permission route lesson ${id}`,
    summary: `Partner dashboard permission route lesson ${id}`,
    priority: 0.8,
    activation: 0.8,
    confidence: 0.85,
    contextCues: ["partner", "dashboard", "permission", "route"],
    sourceRefs: [`memory:${id}`],
    sensitivity: "internal",
    promptPolicy: "summarize_only",
    privacyDecision: "summary: memory selected",
    ...overrides
  };
}

describe("@atlas/cognition", () => {
  it("estimates higher integrated information when components have cross-links", () => {
    const linked = estimateIntegratedInformation({
      activeIntent: "permission",
      components: [
        component("memory:route", "memory", ["file:route"], ["permission"]),
        component("file:route", "file", ["memory:route", "module:dashboard"], ["route"]),
        component("module:dashboard", "module", ["file:route"], ["dashboard"])
      ]
    });
    const isolated = estimateIntegratedInformation({
      activeIntent: "permission",
      components: [
        component("memory:route", "memory", [], ["permission"]),
        component("file:route", "file", [], ["route"]),
        component("module:dashboard", "module", [], ["dashboard"])
      ]
    });

    expect(linked.normalizedPhi).toBeGreaterThan(isolated.normalizedPhi);
    expect(linked.fragmentationRisk).toBeLessThan(isolated.fragmentationRisk);
  });

  it("reports high fragmentation risk for disconnected context", () => {
    const estimate = estimateIntegratedInformation({
      activeIntent: "permission",
      components: [component("a", "memory", []), component("b", "file", []), component("c", "module", [])]
    });

    expect(estimate.fragmentationRisk).toBeGreaterThan(0.7);
    expect(estimate.explanation.join(" ")).toContain("fragmented");
  });

  it("creates predictions from memory/context and flags missing evidence", () => {
    const state = createPredictionState({
      task: "dashboard permission",
      goal,
      contextItems: [contextItem("partner-route", { sourceRefs: [] })]
    });
    const error = estimatePredictionError(state);

    expect(state.predictions.length).toBeGreaterThan(0);
    expect(error.missingEvidence.length).toBeGreaterThan(0);
    expect(error.recommendedAction.join(" ")).toContain("evidence");
  });

  it("detects prediction contradictions", () => {
    const state = createPredictionState({
      task: "route",
      predictions: [{
        id: "prediction:route",
        statement: "Partner route is /partner.",
        expectedEvidence: ["routes.ts"],
        confidence: 0.8,
        source: "memory"
      }],
      observations: [{
        id: "observation:route-v2",
        statement: "Current route points to /partner-v2.",
        evidenceRefs: ["routes.ts:10"],
        supportsPredictionIds: [],
        contradictsPredictionIds: ["prediction:route"],
        confidence: 0.9
      }]
    });

    expect(estimatePredictionError(state).contradictions[0]).toContain("/partner-v2");
  });

  it("writes, reads and clears expired blackboard entries", () => {
    const board = new CognitiveBlackboard();
    board.write(entry("active", { kind: "risk", priority: 0.9 }));
    board.write(entry("expired", { expiresAt: "2026-06-28T00:00:00.000Z" }));

    expect(board.read({ kind: "risk" })).toHaveLength(1);
    expect(board.clearExpired(new Date("2026-06-29T00:00:00.000Z"))).toBe(1);
    expect(board.read()).toHaveLength(1);
  });

  it("selects the highest scoring global workspace entry", () => {
    const winner = selectWorkspaceWinner(
      [
        entry("low", { priority: 0.2, activation: 0.2, contextCues: ["logo"] }),
        entry("high", { priority: 0.95, activation: 0.9, kind: "constraint" })
      ],
      goal,
      { now: new Date("2026-06-29T00:05:00.000Z") }
    );

    expect(winner.entry.id).toBe("high");
    expect(winner.score).toBeGreaterThan(1);
  });

  it("does not broadcast raw secret workspace content", () => {
    const winner = selectWorkspaceWinner([entry("secret", {
      content: "token=FAKE_TEST_TOKEN_VALUE",
      summary: "secret metadata",
      sensitivity: "secret",
      promptPolicy: "do_not_prompt",
      priority: 1,
      activation: 1
    })], goal);
    const broadcasts = broadcastWorkspace(winner, [{ id: "agent_response_planner", role: "external_model" }]);

    expect(broadcasts[0]?.delivered).toBe(false);
    expect(broadcasts[0]?.mode).toBe("blocked");
    expect(JSON.stringify(broadcasts)).not.toContain("FAKE_TEST_TOKEN_VALUE");
  });

  it("arbitrates focus and rejects noisy candidates", () => {
    const focus = arbitrateCognitiveFocus({
      task: "permission routing",
      goal,
      entries: [
        entry("permission", { priority: 0.9, activation: 0.9, summary: "dashboard runtime/permission issue" }),
        entry("logo", { priority: 0.7, activation: 0.2, summary: "dashboard logo asset", contextCues: ["dashboard", "logo", "asset"] })
      ],
      integratedInformation: estimateIntegratedInformation({
        activeIntent: "permission",
        components: [component("permission", "memory", ["logo"], ["permission"]), component("logo", "memory", ["permission"], ["logo"])]
      }),
      predictionError: { error: 0.2, contradictions: [], missingEvidence: [], recommendedAction: [] }
    });

    expect(focus.selectedFocus).toContain("permission");
    expect(focus.rejectedCandidates.some((candidate) => candidate.reason.includes("asset"))).toBe(true);
  });

  it("runs a cognitive cycle with focus, broadcasts and explanation", () => {
    const result = runCognitiveCycle({
      projectId: "atlas-test",
      task: "permission routing issue",
      inferredIntent: {
        primaryIntent: "permission",
        secondaryIntents: ["dashboard", "routing"],
        keywords: ["dashboard", "403", "permission", "route"],
        negativeKeywords: ["logo"],
        confidence: 0.9
      },
      workingMemory: [contextItem("working-route", { source: "working_memory" })],
      longTermMemory: [contextItem("long-term-permission")],
      contextItems: [contextItem("route-file", { source: "context_pack", kind: "file", sourceRefs: ["routes.ts"] })],
      privacyBlocks: ["1 secret memory withheld"]
    });

    expect(result.focus.selectedFocus).toContain("permission");
    expect(result.broadcasts.length).toBeGreaterThan(0);
    expect(result.state.explanation.recommendedActions.length).toBeGreaterThan(0);
    expect(result.state.privacySummary.blockedEvidenceCount).toBeGreaterThan(0);
  });

  it("explains cognitive state with recommended actions and privacy notes", () => {
    const result = runCognitiveCycle({
      projectId: "atlas-test",
      task: "partner route",
      longTermMemory: [contextItem("partner-route")],
      privacyBlocks: ["Some evidence was withheld by Cognitive Privacy Layer."]
    });
    const explanation = explainCognitiveState(result.state);

    expect(explanation.selectedFocus).toBeTruthy();
    expect(explanation.recommendedActions.length).toBeGreaterThan(0);
    expect(explanation.privacy.join(" ")).toContain("withheld");
  });

  it("keeps privacy metadata on entries, broadcasts and state", () => {
    const result = runCognitiveCycle({
      projectId: "atlas-test",
      task: "privacy-safe cognition",
      contextItems: [contextItem("confidential", { sensitivity: "confidential", privacyDecision: "summary: confidential" })]
    });

    expect(result.state.privacySummary.privacyDecision).toBeTruthy();
    expect(result.state.workspace.entries.every((item) => item.privacyDecision && item.promptPolicy && item.sensitivity)).toBe(true);
    expect(result.broadcasts.every((item) => item.privacyDecision && item.promptPolicy && item.sensitivity)).toBe(true);
  });
});
