import type { MemorySensitivity, PromptPolicy } from "@atlas/types";

export type SensorySource =
  | "user"
  | "file"
  | "test"
  | "cli"
  | "tool"
  | "runtime"
  | "agent"
  | "memory"
  | "amf"
  | "unknown";

export interface SensoryInput {
  id: string;
  source: SensorySource;
  content: string;
  summary?: string;
  sourceRefs: string[];
  timestamp: string;
  confidence: number;
  sensitivity: MemorySensitivity;
  promptPolicy: PromptPolicy;
}

export interface WorldObservation {
  id: string;
  statement: string;
  evidenceRefs: string[];
  source: SensoryInput["source"];
  supports: string[];
  contradicts: string[];
  confidence: number;
  freshness: number;
  sensitivity: MemorySensitivity;
  promptPolicy: PromptPolicy;
}

export interface MarkovBlanketState {
  id: string;
  projectId: string;
  createdAt: string;
  sensoryInputs: SensoryInput[];
  observations: WorldObservation[];
  internalStateRefs: string[];
  externalStateRefs: string[];
  noiseFiltered: number;
  privacyFiltered: number;
  confidence: number;
  explanation: string[];
}

export interface MarkovBlanketOptions {
  projectId: string;
  now?: Date;
  internalStateRefs?: string[];
  externalStateRefs?: string[];
  noiseThreshold?: number;
}

export interface ResourceBudget {
  maxTokens?: number;
  maxFiles?: number;
  maxMemoryItems?: number;
  maxLatencyMs?: number;
  maxToolCalls?: number;
  maxComputeCost?: number;
}

export interface ComputeCostEstimate {
  informationDensity: number;
  estimatedTokens: number;
  estimatedFiles: number;
  estimatedMemoryItems: number;
  estimatedToolCalls: number;
  estimatedLatencyMs: number;
  computeCost: number;
  overBudget: boolean;
  reasons: string[];
  recommendedMode: "process_now" | "summarize_first" | "defer_to_ltm" | "background_review" | "ask_for_focus";
}

export interface InformationDensityInput {
  text?: string;
  inputs?: SensoryInput[];
  observations?: WorldObservation[];
  sourceRefs?: string[];
  dependencyCount?: number;
  riskSignalCount?: number;
  contradictionCount?: number;
  uncertaintyCount?: number;
}

export interface BeliefState {
  id: string;
  statement: string;
  prior: number;
  likelihood: number;
  posterior: number;
  evidenceRefs: string[];
  confidence: number;
  updatedAt: string;
}

export interface BayesianAlignmentResult {
  updatedBeliefs: BeliefState[];
  contradictedBeliefs: BeliefState[];
  confirmedBeliefs: BeliefState[];
  uncertainty: number;
  predictionError: number;
  explanation: string[];
}

export interface ActiveInferenceAction {
  id: string;
  kind:
    | "read_file"
    | "run_test"
    | "inspect_memory"
    | "ask_clarifying_question"
    | "build_context"
    | "defer_to_ltm"
    | "consolidate_memory"
    | "do_nothing";
  title: string;
  rationale: string;
  expectedPredictionErrorReduction: number;
  estimatedCost: ComputeCostEstimate;
  requiresPermission: boolean;
  permissionRequired?: string;
  riskLevel: "low" | "medium" | "high";
}

export interface ActiveInferenceInput {
  blanket: MarkovBlanketState;
  cost: ComputeCostEstimate;
  alignment: BayesianAlignmentResult;
  budget?: ResourceBudget;
  task?: string;
}

export interface RealityCheckInput {
  task: string;
  beliefs: BeliefState[];
  observations: WorldObservation[];
  cost?: ComputeCostEstimate;
}

export interface RealityCheckResult {
  aligned: boolean;
  assumptions: string[];
  confirmedFacts: string[];
  contradictions: string[];
  staleMemoryIds: string[];
  missingEvidence: string[];
  recommendedActions: ActiveInferenceAction[];
  confidence: number;
}

export interface WorldModelCycleInput {
  projectId: string;
  task: string;
  inputs: SensoryInput[];
  beliefs?: BeliefState[];
  budget?: ResourceBudget;
  now?: Date;
}

export interface WorldModelCycleResult {
  blanket: MarkovBlanketState;
  cost: ComputeCostEstimate;
  alignment: BayesianAlignmentResult;
  realityCheck: RealityCheckResult;
  proposedActions: ActiveInferenceAction[];
  explanation: string[];
}
