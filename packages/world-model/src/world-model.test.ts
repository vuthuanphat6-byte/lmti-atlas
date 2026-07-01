import { describe, expect, it } from "vitest";
import {
  alignBeliefsWithObservations,
  checkRealityAlignment,
  createMarkovBlanketState,
  estimateComputeCost,
  estimateInformationDensity,
  proposeActiveInferenceActions,
  runWorldModelCycle,
  updateBeliefBayesian
} from "./index";
import type { BeliefState, ComputeCostEstimate, SensoryInput, WorldObservation } from "./types";

const now = new Date("2026-06-29T00:00:00.000Z");

function input(id: string, content: string, overrides: Partial<SensoryInput> = {}): SensoryInput {
  return {
    id,
    source: "user",
    content,
    sourceRefs: [`${id}.md`],
    timestamp: now.toISOString(),
    confidence: 0.8,
    sensitivity: "internal",
    promptPolicy: "summarize_only",
    ...overrides
  };
}

function belief(overrides: Partial<BeliefState> = {}): BeliefState {
  return {
    id: "belief:partner-route",
    statement: "Partner route is /partner.",
    prior: 0.7,
    likelihood: 0.7,
    posterior: 0.7,
    evidenceRefs: ["memory:partner-route"],
    confidence: 0.7,
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function observation(overrides: Partial<WorldObservation> = {}): WorldObservation {
  return {
    id: "observation:route",
    statement: "Current source route is /partner.",
    evidenceRefs: ["routes.ts"],
    source: "file",
    supports: ["belief:partner-route"],
    contradicts: [],
    confidence: 0.9,
    freshness: 1,
    sensitivity: "internal",
    promptPolicy: "summarize_only",
    ...overrides
  };
}

describe("@atlas/world-model", () => {
  it("creates Markov Blanket observations from sensory input", () => {
    const blanket = createMarkovBlanketState([input("route", "Current route supports: belief:partner-route")], {
      projectId: "atlas-test",
      now
    });

    expect(blanket.observations).toHaveLength(1);
    expect(blanket.observations[0]?.evidenceRefs).toContain("route.md");
    expect(blanket.confidence).toBeGreaterThan(0);
  });

  it("filters noise input", () => {
    const blanket = createMarkovBlanketState([
      input("noise", "ok", { confidence: 0.05 }),
      input("valid", "Source route evidence exists.", { confidence: 0.8 })
    ], { projectId: "atlas-test", now });

    expect(blanket.noiseFiltered).toBe(1);
    expect(blanket.observations).toHaveLength(1);
  });

  it("redacts secret sensory input and marks do_not_prompt", () => {
    const blanket = createMarkovBlanketState([
      input("secret", "token=FAKE_TEST_TOKEN_VALUE", { sensitivity: "internal", promptPolicy: "allow_raw" })
    ], { projectId: "atlas-test", now });

    expect(blanket.privacyFiltered).toBe(1);
    expect(blanket.sensoryInputs[0]?.promptPolicy).toBe("do_not_prompt");
    expect(JSON.stringify(blanket)).not.toContain("FAKE_TEST_TOKEN_VALUE");
  });

  it("increases information density for complex input", () => {
    const simple = estimateInformationDensity({ text: "fix bug" });
    const complex = estimateInformationDensity({
      text: "Fix permission routing route in src/routes.ts with dependency AuthGuard and risk secret production failure",
      sourceRefs: ["src/routes.ts", "src/auth.ts"],
      contradictionCount: 2,
      uncertaintyCount: 2
    });

    expect(complex).toBeGreaterThan(simple);
  });

  it("flags compute cost over budget and recommends safer mode", () => {
    const cost = estimateComputeCost({
      text: "Large task ".repeat(500),
      sourceRefs: Array.from({ length: 20 }, (_, index) => `file-${index}.ts`),
      riskSignalCount: 8
    }, { maxTokens: 100, maxFiles: 3, maxComputeCost: 10 });

    expect(cost.overBudget).toBe(true);
    expect(["summarize_first", "defer_to_ltm", "ask_for_focus", "background_review"]).toContain(cost.recommendedMode);
  });

  it("updates Bayesian belief upward when evidence supports it", () => {
    const posterior = updateBeliefBayesian(0.5, 0.9, 0.6);

    expect(posterior).toBeGreaterThan(0.5);
  });

  it("detects contradicted beliefs when observation conflicts", () => {
    const result = alignBeliefsWithObservations(
      [belief()],
      [observation({
        statement: "Current source route now uses /partners instead of /partner.",
        supports: [],
        contradicts: ["belief:partner-route"]
      })],
      now
    );

    expect(result.contradictedBeliefs).toHaveLength(1);
    expect(result.predictionError).toBeGreaterThan(0);
  });

  it("distinguishes memory belief from source evidence in reality check", () => {
    const result = checkRealityAlignment({
      task: "partner route",
      beliefs: [belief()],
      observations: [observation()]
    });

    expect(result.confirmedFacts[0]).toContain("routes.ts");
    expect(result.assumptions).toHaveLength(0);
  });

  it("detects missing evidence in reality check", () => {
    const result = checkRealityAlignment({
      task: "partner route",
      beliefs: [belief({ evidenceRefs: [] })],
      observations: []
    });

    expect(result.assumptions).toHaveLength(1);
    expect(result.missingEvidence).toHaveLength(1);
  });

  it("proposes active inference actions to reduce prediction error", () => {
    const blanket = createMarkovBlanketState([input("route", "Current route now differs.", { source: "file", sourceRefs: ["routes.ts"] })], {
      projectId: "atlas-test",
      now
    });
    const cost: ComputeCostEstimate = estimateComputeCost({ observations: blanket.observations });
    const actions = proposeActiveInferenceActions({
      blanket,
      cost,
      alignment: {
        updatedBeliefs: [belief()],
        contradictedBeliefs: [belief()],
        confirmedBeliefs: [],
        uncertainty: 0.5,
        predictionError: 0.7,
        explanation: []
      }
    });

    expect(actions.some((action) => action.kind === "read_file" || action.kind === "run_test")).toBe(true);
    expect(actions.find((action) => action.kind === "run_test")?.requiresPermission).toBe(true);
  });

  it("returns full world model cycle output", () => {
    const result = runWorldModelCycle({
      projectId: "atlas-test",
      task: "fix partner dashboard 403",
      inputs: [
        input("memory", "Partner route is /partner.", { source: "memory", sourceRefs: ["memory:partner-route"] }),
        input("file", "Current source route supports: belief:memory", { source: "file", sourceRefs: ["routes.ts"] })
      ],
      budget: { maxComputeCost: 80 },
      now
    });

    expect(result.blanket.observations.length).toBeGreaterThan(0);
    expect(result.cost.computeCost).toBeGreaterThanOrEqual(0);
    expect(result.alignment.updatedBeliefs.length).toBeGreaterThan(0);
    expect(result.realityCheck).toBeTruthy();
    expect(result.proposedActions.length).toBeGreaterThan(0);
  });

  it("does not expose raw secret in world model cycle output", () => {
    const result = runWorldModelCycle({
      projectId: "atlas-test",
      task: "observe secret",
      inputs: [input("secret", "password=FAKE_TEST_PASSWORD", { source: "cli", sensitivity: "internal" })],
      now
    });

    expect(JSON.stringify(result)).not.toContain("FAKE_TEST_PASSWORD");
    expect(result.blanket.privacyFiltered).toBe(1);
  });
});
