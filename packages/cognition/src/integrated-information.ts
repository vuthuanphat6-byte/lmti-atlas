import type { IntegratedComponent, IntegratedInformationEstimate, IntegratedInformationInput } from "./types";

export function estimateIntegratedInformation(input: IntegratedInformationInput): IntegratedInformationEstimate {
  const components = input.components;
  const byId = new Map(components.map((component) => [component.id, component]));
  let crossKindLinks = 0;
  let memoryFileCoupling = 0;
  let intentMemoryCoupling = 0;
  let ruleRouteCoupling = 0;
  let workingLongTermCoupling = 0;
  let isolatedComponents = 0;

  const activeIntentTerms = new Set([input.activeIntent, ...(input.secondaryIntents ?? [])].filter(Boolean).map(normalize));

  for (const component of components) {
    const linked = component.connectedTo.map((id) => byId.get(id)).filter((item): item is IntegratedComponent => Boolean(item));
    if (linked.length === 0) {
      isolatedComponents += 1;
      continue;
    }

    for (const target of linked) {
      if (target.kind !== component.kind) {
        crossKindLinks += 1;
      }
      if (isMemory(component) && (target.kind === "file" || target.kind === "module")) {
        memoryFileCoupling += 1;
      }
      if (isMemory(target) && (component.kind === "file" || component.kind === "module")) {
        memoryFileCoupling += 1;
      }
      if (isRuleOrRoute(component) && isRuleOrRoute(target) && component.kind !== target.kind) {
        ruleRouteCoupling += 1;
      }
      if (isWorking(component) && isLongTerm(target)) {
        workingLongTermCoupling += 1;
      }
      if (isWorking(target) && isLongTerm(component)) {
        workingLongTermCoupling += 1;
      }
    }

    if (isMemory(component) && component.contextCues.some((cue) => activeIntentTerms.has(normalize(cue)))) {
      intentMemoryCoupling += 1;
    }
  }

  const isolatedComponentPenalty = isolatedComponents * 1.4;
  const conflictPenalty = (input.conflicts?.length ?? 0) * 2.2;
  const phi = round(
    crossKindLinks * 0.7
      + memoryFileCoupling * 1.2
      + intentMemoryCoupling * 1.4
      + ruleRouteCoupling * 1.5
      + workingLongTermCoupling * 1.1
      - isolatedComponentPenalty
      - conflictPenalty
  );
  const possibleLinks = Math.max(1, components.length * Math.max(1, components.length - 1));
  const actualLinks = components.reduce((sum, component) => sum + component.connectedTo.length, 0);
  const couplingStrength = round(clamp01(actualLinks / possibleLinks));
  const normalizedPhi = round(clamp01(phi / Math.max(1, components.length * 3)));
  const fragmentationRisk = round(clamp01(1 - normalizedPhi + isolatedComponents / Math.max(1, components.length) * 0.35 + (input.conflicts?.length ?? 0) * 0.12));
  const explanation = [
    `cross-kind links=${crossKindLinks}`,
    `memory-file coupling=${memoryFileCoupling}`,
    `intent-memory coupling=${intentMemoryCoupling}`,
    `rule-route coupling=${ruleRouteCoupling}`,
    `working-long-term coupling=${workingLongTermCoupling}`,
    `isolated components=${isolatedComponents}`,
    `conflicts=${input.conflicts?.length ?? 0}`
  ];

  if (fragmentationRisk > 0.55) {
    explanation.push("context is fragmented; gather more focused memory, files or rules before acting with high certainty");
  }

  return {
    phi: Math.max(0, phi),
    normalizedPhi,
    components,
    couplingStrength,
    fragmentationRisk,
    explanation
  };
}

function isMemory(component: IntegratedComponent): boolean {
  return component.kind === "memory" || component.sourceRefs.some((ref) => ref.startsWith("memory:"));
}

function isRuleOrRoute(component: IntegratedComponent): boolean {
  return component.kind === "rule" || component.kind === "route" || component.contextCues.some((cue) => ["rule", "route", "permission"].includes(normalize(cue)));
}

function isWorking(component: IntegratedComponent): boolean {
  return component.sourceRefs.some((ref) => ref.startsWith("working_memory:"));
}

function isLongTerm(component: IntegratedComponent): boolean {
  return component.sourceRefs.some((ref) => ref.startsWith("long_term_memory:"));
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
