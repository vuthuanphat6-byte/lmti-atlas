import type { InferredIntent, MemorySensitivity, PromptPolicy } from "@atlas/types";

export type CognitiveSource =
  | "working_memory"
  | "long_term_memory"
  | "context_pack"
  | "preflight"
  | "agent"
  | "tool"
  | "privacy"
  | "runtime"
  | "amf";

export type BlackboardKind =
  | "goal"
  | "observation"
  | "prediction"
  | "risk"
  | "constraint"
  | "memory"
  | "file"
  | "module"
  | "insight"
  | "decision";

export interface CognitiveGoal {
  id: string;
  title: string;
  description: string;
  priority: number;
  successCriteria: string[];
  constraints: string[];
}

export interface IntegratedComponent {
  id: string;
  kind: BlackboardKind | "intent" | "rule" | "route";
  label: string;
  sourceRefs: string[];
  connectedTo: string[];
  contextCues: string[];
  weight: number;
  sensitivity: MemorySensitivity;
  promptPolicy: PromptPolicy;
  privacyDecision: string;
}

export interface IntegratedInformationEstimate {
  phi: number;
  normalizedPhi: number;
  components: IntegratedComponent[];
  couplingStrength: number;
  fragmentationRisk: number;
  explanation: string[];
}

export interface IntegratedInformationInput {
  components: IntegratedComponent[];
  activeIntent?: string;
  secondaryIntents?: string[];
  conflicts?: string[];
}

export interface CognitivePrediction {
  id: string;
  statement: string;
  expectedEvidence: string[];
  confidence: number;
  source: "memory" | "amf" | "agent" | "user" | "rule" | "runtime";
}

export interface CognitiveObservation {
  id: string;
  statement: string;
  evidenceRefs: string[];
  supportsPredictionIds: string[];
  contradictsPredictionIds: string[];
  confidence: number;
}

export interface PredictionState {
  predictions: CognitivePrediction[];
  observations: CognitiveObservation[];
  freeEnergyEstimate: number;
  uncertainty: number;
  nextBestObservation?: string;
}

export interface PredictionErrorEstimate {
  error: number;
  contradictions: string[];
  missingEvidence: string[];
  recommendedAction: string[];
}

export interface PredictionStateInput {
  task: string;
  goal?: CognitiveGoal;
  contextItems?: CognitiveContextItem[];
  predictions?: CognitivePrediction[];
  observations?: CognitiveObservation[];
}

export interface CognitiveContextItem {
  id: string;
  source: CognitiveSource;
  kind: BlackboardKind;
  content: string;
  summary?: string;
  priority: number;
  activation?: number;
  confidence: number;
  contextCues: string[];
  sourceRefs: string[];
  sensitivity: MemorySensitivity;
  promptPolicy: PromptPolicy;
  privacyDecision?: string;
  createdAt?: string;
  expiresAt?: string;
}

export interface BlackboardEntry {
  id: string;
  source: CognitiveSource;
  kind: BlackboardKind;
  content: string;
  summary: string;
  priority: number;
  activation: number;
  confidence: number;
  contextCues: string[];
  sensitivity: MemorySensitivity;
  promptPolicy: PromptPolicy;
  privacyDecision: string;
  sourceRefs: string[];
  createdAt: string;
  expiresAt?: string;
}

export interface BlackboardQuery {
  source?: CognitiveSource;
  kind?: BlackboardKind;
  minPriority?: number;
  cues?: string[];
  now?: Date;
}

export interface WorkspaceWinner {
  entry: BlackboardEntry;
  score: number;
  reason: string[];
  safeContent: string;
  privacyDecision: string;
}

export interface GlobalWorkspaceState {
  entries: BlackboardEntry[];
  winner?: WorkspaceWinner;
  broadcastCount: number;
  attentionTrace: Array<{ id: string; score: number; reason: string[] }>;
}

export type BroadcastSubscriber =
  | "context_builder"
  | "runtime_session"
  | "agent_response_planner"
  | "memory_consolidation"
  | "insight_engine"
  | "privacy_audit";

export interface BroadcastTarget {
  id: BroadcastSubscriber;
  role?: "local" | "external_model";
}

export interface BroadcastResult {
  subscriber: BroadcastSubscriber;
  delivered: boolean;
  mode: "raw" | "summary" | "metadata_only" | "blocked";
  payload: string;
  sensitivity: MemorySensitivity;
  promptPolicy: PromptPolicy;
  privacyDecision: string;
  reason: string[];
}

export interface RejectedFocusCandidate {
  id: string;
  source: CognitiveSource;
  reason: string;
  score: number;
}

export interface CognitiveFocusDecision {
  focusId: string;
  selectedFocus: string;
  selectedSourceRefs: string[];
  rejectedCandidates: RejectedFocusCandidate[];
  reason: string[];
  confidence: number;
  recommendedNextAction: string[];
}

export interface CognitivePrivacySummary {
  sensitivity: MemorySensitivity;
  promptPolicy: PromptPolicy;
  privacyDecision: string;
  blockedEvidenceCount: number;
  summarizedEvidenceCount: number;
  notes: string[];
}

export interface CognitiveExplanation {
  selectedFocus: string;
  focusReasons: string[];
  memoryInfluence: string[];
  fileModuleInfluence: string[];
  missingEvidence: string[];
  highRisks: string[];
  fragmentation: string[];
  privacy: string[];
  recommendedActions: string[];
}

export interface CognitiveState {
  id: string;
  projectId: string;
  task: string;
  createdAt: string;
  updatedAt: string;
  currentGoal: CognitiveGoal;
  activeIntent: string;
  secondaryIntents: string[];
  workingMemoryIds: string[];
  longTermMemoryIds: string[];
  activeContextCues: string[];
  integratedInformation: IntegratedInformationEstimate;
  predictionState: PredictionState;
  workspace: GlobalWorkspaceState;
  privacySummary: CognitivePrivacySummary;
  explanation: CognitiveExplanation;
}

export interface CognitiveCycleInput {
  projectId: string;
  task: string;
  inferredIntent?: InferredIntent;
  goal?: Partial<CognitiveGoal>;
  workingMemory?: CognitiveContextItem[];
  longTermMemory?: CognitiveContextItem[];
  contextItems?: CognitiveContextItem[];
  predictions?: CognitivePrediction[];
  observations?: CognitiveObservation[];
  privacyBlocks?: string[];
  subscribers?: BroadcastTarget[];
  now?: Date;
}

export interface CognitiveCycleResult {
  state: CognitiveState;
  focus: CognitiveFocusDecision;
  broadcasts: BroadcastResult[];
  predictionError: PredictionErrorEstimate;
  recommendedActions: string[];
}
