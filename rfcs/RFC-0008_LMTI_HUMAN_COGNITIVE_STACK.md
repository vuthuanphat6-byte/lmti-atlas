# RFC-0008: LMTI Human Cognitive Stack

Status: Draft  
Sprint: 0 architecture proposal  
Audience: Coding Agent MVP, CLI, runtime, memory, privacy, kernel

## 0. Product Thesis

LMTI is not memory retrieval. It is a cognitive preflight layer for AI agents. It helps models attend, remember, filter, predict, act, learn, and forget like an organized intelligence.

LMTI không phải công cụ tìm trí nhớ. LMTI là lớp kiểm tra nhận thức trước hành động cho AI Agent, giúp model biết chú ý, nhớ, lọc, dự đoán, hành động, học và quên như một trí tuệ có tổ chức.

This RFC does not claim that AI has consciousness, personhood, soul, emotion, or human agency. Brain terms below are engineering metaphors converted into buildable modules, data contracts, dashboards, tests, and metrics.

### Hard Boundaries

* Local-first by default. No cloud, no external model dependency, no vendor lock-in.
* Knowledge is not ordinary data. Sensitive knowledge is permission-aware and never leaked raw.
* LMTI stores compiled understanding, not raw prompt history.
* Context is selected by intent, risk, role, freshness, source confidence, and salience.
* Every durable memory needs source, privacy tag, confidence, decay policy, and approval state.
* Every task should leave one of three outcomes: no lesson, proposed lesson, or approved memory.
* Einstein-inspired terms are design constraints only. They are not scientific proof, not physics claims, and never override privacy enforcement.

[CẢNH BÁO BẢO MẬT] The demo includes a `Secret API key` memory as hostile test input. The correct behavior is to block it from model context, log the block, and never print the raw value in dashboards, tests, traces, or prompt packages.

## 1. Human Function To LMTI Module Map

| # | Brain-like function | Human meaning | AI Agent problem | LMTI module | Real feature to build | Data to store | API/function | Dashboard | Practical test | Metric | Priority | Technical risk | Privacy/ethics risk | Simplest first version |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Attention system | Selects what matters now | Agent pulls irrelevant memories | Attention Router | Rank focus and ignore sets by intent | `AttentionFocus`, rejected reasons | `createAttentionFocus` | Attention Viewer | Debug task must ignore logo memory | `attention_accuracy` | MVP | Over-filtering useful context | Hidden bias in focus rules | Keyword plus intent weights |
| 2 | Working memory | Keeps active task state | Agent turns temporary notes into permanent memory | Task Working Memory | TTL task board with cleanup and summary | `WorkingMemoryItem` | `writeWorkingMemory`, `clearWorkingMemory` | Working Memory Board | Task assumptions expire after completion | `context_noise_ratio` | MVP | State drift across sessions | Temporary sensitive data retained | File-backed TTL records |
| 3 | Long-term memory | Durable knowledge | Agent forgets rules, bugs, decisions | Structured Long-term Memory | Typed memories for user, project, technical, bug, lesson, decision, policy | `LongTermMemory`, `MemoryTag` | `retrieveLongTermMemory` | Long-term Memory Graph | Retrieve permission rule for dashboard bug | `wrong_context_rate` | MVP | Memory schema too generic | Raw confidential memory exposed | JSON records with strict types |
| 4 | Hippocampus-like consolidation | Converts experience into stable memory | Agent stores every event or learns nothing | Memory Consolidation Engine | Propose, merge, approve, reject memories | `Lesson`, `MemoryConsolidationRun` | `proposeMemoryConsolidation`, `approveMemory` | Lesson Inbox | After a fixed bug, propose one lesson only | `lesson_acceptance_rate` | MVP | Spammy lesson proposals | Unapproved sensitive lesson enters context | Human approval gate |
| 5 | Prefrontal executive control | Plans and inhibits bad action | Agent makes unsafe fixes | Executive Control Layer | Generate task constraints before action | `ExecutiveConstraint` | `generateExecutiveConstraints` | Executive Constraints Panel | 403 bug cannot be fixed by changing 403 to 200 blindly | `permission_mistake_reduction` | MVP | Constraints too broad | Constraint hides accountability | Rule templates from risk signals |
| 6 | Amygdala/risk detection | Detects danger | Agent misses destructive, privacy, permission risk | Risk & Safety Detector | Risk signals from task, memory, role, operation | `RiskSignal` | `detectRiskSignals` | Risk Console | Detect permission escalation risk | `privacy_violation_rate` | MVP | False positives block progress | Risk labels reveal sensitive facts | Deterministic risk rules |
| 7 | Basal ganglia/habit | Learns repeated workflows | Agent repeats project setup | Agent Habit Engine | Reusable project workflows and preferred tests | `SuccessPattern`, habit tags | `retrieveLongTermMemory` with habit domain | Cognitive Map | Known project test command appears for code tasks | `time_to_correct_context` | V1 | Bad habit fossilization | User preference over-personalized | Store approved workflow patterns |
| 8 | Cerebellum/error correction | Corrects behavior after mismatch | Agent repeats same mistake | Error Correction Memory | Compare predicted vs actual outcome | `TaskOutcome`, `NegativeLesson` | `observeTaskOutcome`, `extractLessonsFromOutcome` | Outcome Observer | Prediction says stale route risk, outcome confirms it | `repeated_error_reduction` | V1 | Weak outcome instrumentation | Logging sensitive failure detail | Outcome summaries only |
| 9 | Thalamus/routing gate | Routes signals | Agent searches wrong memory domain | Cognitive Router | Route intent to memory domains | `TaskIntent`, route decisions | `parseIntent`, `retrieveLongTermMemory` | Cognitive Map | Contract task does not load code routes | `wrong_context_rate` | MVP | Intent taxonomy gaps | Role route bypass | Intent-domain matrix |
| 10 | Default mode/self model | Maintains operational identity | Agent loses project role and tone | Agent Self Model | Stable operational identity, boundaries, response style | `AgentSelfModel` | `compileContextForModel` | Cognitive Map | Codex retains security-first role | `agent_continuity_score` | MVP | Identity text becomes prompt bloat | Treating identity as personhood | Small policy summary |
| 11 | Emotional salience | Prioritizes high-meaning memories | Critical lessons rank equal to trivia | Importance & Salience Score | Salience scoring by impact, recency, risk, usage | salience fields on memory | `scoreMemorySalience` | Long-term Memory Graph | Prior 403 incident outranks UI color | `attention_accuracy` | MVP | Score gaming | Sensitive high-salience leakage | Weighted score with caps |
| 12 | Forgetting system | Decays stale memories | Agent uses deprecated route | Forgetting & Decay Engine | TTL, deprecation, archive, compression | `expiresAt`, `deprecatedAt`, decay reason | `deprecateMemory` | Offline Reflection Center | Deprecated `/dashboard` partner route rejected | `stale_memory_usage_rate` | MVP | Forgetting useful knowledge | Hiding audit trails | Deprecate before delete |
| 13 | Dream/offline reprocessing | Reorganizes memory offline | Memory graph accumulates contradictions | Offline Reflection Job | Merge duplicates, detect conflicts, compress lessons | `OfflineReflectionRun`, `MemoryConflict` | `runOfflineReflection`, `detectMemoryContradictions` | Offline Reflection Center | Merge duplicate dashboard lessons | `contradiction_resolution_rate` | V1 | Bad auto-merge | Cross-project data bleed | Dry-run recommendations |
| 14 | Prediction system | Forecasts failures | Agent chooses risky context | Failure Forecast Engine | Predict failure per context package | `PredictedFailure`, `PreflightRun` | `predictAgentFailures`, `runContextPreflight` | Context Preflight Battle | Keyword package wrongly picks logo | `prediction_accuracy` | MVP | Shallow predictions | Prediction stores sensitive rationale | Template failure catalog |
| 15 | Pain/negative reinforcement | Learns what not to do | Agent only remembers positive rules | Negative Lesson Memory | Store prohibited patterns and anti-fixes | `NegativeLesson` | `extractLessonsFromOutcome` | Lesson Inbox | Do not fix permission bug by widening role | `repeated_error_reduction` | MVP | Too many prohibitions | Shame-like wording in user profile | Neutral "avoid pattern" records |
| 16 | Reward system | Reinforces successful behavior | Good workflows are not reused | Success Pattern Memory | Store effective context packages and workflows | `SuccessPattern` | `observeTaskOutcome` | Evaluation Lab | Hybrid package reduced revisions | `task_revision_reduction` | V1 | Premature optimization | Overfitting to one user | Store only measured successes |
| 17 | Language/narrative memory | Maintains project story | Agent answers off-product | Project Narrative Memory | Direction, major decisions, why they exist | `ProjectOperatingMemory` | `retrieveLongTermMemory` | Cognitive Map | Architecture task recalls "build cognition" | `agent_continuity_score` | V1 | Narrative becomes vague | Strategic info exposed externally | Concise project operating summary |
| 18 | Social cognition | Models counterpart preferences | Agent ignores user working style | User Operating Profile | Response preferences and artifact preferences | `UserProfile` | `compileContextForModel` | Cognitive Map | Use direct product-first tone | `user_repeated_instruction_reduction` | MVP | Stereotyping user | Personalization without consent | Explicit approved preferences |
| 19 | Sensory integration | Fuses multiple signals | Agent trusts one stale source | Multi-source Context Fusion | Source confidence across chat, code, docs, commits, logs, files, outcomes | `MemorySource`, confidence | `generateContextCandidates` | Cognitive Map | Stale memory loses to current route file | `model_agnostic_transfer_score` | V1 | Conflicting source arbitration | Pulling secrets from logs | Source scoring and redaction |
| 20 | Immune system | Blocks harmful input | Memory poisoning and secret leakage | Memory Immune System | Prompt injection, secret, hallucinated, unsourced, over-permission blocks | immune findings on memory/source | `enforceMemoryPrivacy` | Memory Immune Log | Secret API key blocked from context | `secret_block_rate` | MVP | Missed injection patterns | Unsafe dashboard display | Pattern rules plus allowlist |

## 2. Overall Architecture

Runtime flow:

```text
Input
  -> Intent Parser
  -> Cognitive Router
  -> Attention Router
  -> Working Memory
  -> Long-term Memory Graph
  -> Einstein Cognitive Principles Layer
  -> Privacy Firewall
  -> Risk Detector
  -> Context Preflight Engine
  -> Context Compiler
  -> Executive Constraint Layer
  -> Agent Runtime Adapter
  -> Outcome Observer
  -> Lesson Extractor
  -> Memory Consolidation Engine
  -> Offline Reflection Job
  -> Evaluation Harness
```

Package alignment for the current repo:

* `packages/types`: shared schema contracts.
* `packages/memory`: working memory, long-term memory, lessons, events.
* `packages/privacy`: sensitivity, prompt policy, role-based enforcement.
* `packages/kernel`: intent, scoring, context pack selection.
* `packages/security`: runtime permissions and audit guard.
* `packages/runtime`: session orchestration and agent adapter.
* `packages/cli`: MVP developer interface and evaluation commands.
* `packages/mcp`: model/runtime integration surface.

| Layer | Mission | Input | Output | Dependency | API | Data stored | Common failure |
|---|---|---|---|---|---|---|---|
| Input Layer | Normalize task input and role | raw prompt, projectId, userId, role | normalized request | CLI/runtime/MCP | `submitTask` | raw input hash, not raw secret payload | storing prompt with secrets |
| Intent Parser | Classify task | normalized request | `TaskIntent` | kernel/types | `parseIntent` | intent, confidence, unknowns | keyword-only misclassification |
| Attention Router | Select focus and ignore sets | intent, project profile | `AttentionFocus` | kernel/memory | `createAttentionFocus` | focus terms, ignored terms, reasons | pulling noisy memory |
| Working Memory | Hold active task state | taskId, assumptions, findings | task-local memory | memory | `writeWorkingMemory`, `clearWorkingMemory` | TTL items | leaking temporary sensitive data |
| Long-term Memory Graph | Retrieve durable knowledge | focus, domains, role | candidate memories | memory/graph | `retrieveLongTermMemory` | typed memory, relations, sources | stale memory outranks source-of-truth |
| Einstein Cognitive Principles Layer | Apply observer, spacetime, cognitive mass, bandwidth, consistency, gravity, simulation, simplicity, invariance, and causality checks | intent, observer, memory candidates, role, model target | interpreted and ranked memory frames plus preflight constraints | kernel/memory/privacy | `interpretMemoryByObserver`, `runCognitiveThoughtExperiment` | observer frame, spacetime index, mass score, causal ledger | treating physics metaphors as authority instead of testable product rules |
| Privacy Firewall | Enforce sensitivity and prompt policy | memories, policy, role | allowed, summarized, blocked | privacy/security | `enforceMemoryPrivacy` | privacy audit events | raw confidential/secret leak |
| Risk Detector | Identify risky task/memory combinations | intent, memories, role | `RiskSignal[]` | privacy/security | `detectRiskSignals` | risk signals, evidence refs | weak destructive-action detection |
| Context Preflight Engine | Compare candidate packages before prompt | candidates, risk signals | `PreflightRun` | kernel/privacy | `runContextPreflight` | package scores, predicted failures | selecting first plausible package |
| Context Compiler | Build minimal model context | selected package, constraints | model context | kernel/types | `compileContextForModel` | context manifest, token estimate | prompt bloat |
| Executive Constraint Layer | Generate action boundaries | intent, risks, policy | constraints | security/runtime | `generateExecutiveConstraints` | constraints, severity, ack status | constraints not shown to agent |
| Agent Runtime Adapter | Hand context to agent/runtime | compiled context, constraints | agent run request | runtime/mcp | `runAgentTask` | adapter trace | bypassing security guard |
| Outcome Observer | Capture what happened | agent actions, diffs, tests, result | `TaskOutcome` | runtime/security | `observeTaskOutcome` | outcome summary and violations | unstructured result cannot teach |
| Lesson Extractor | Turn outcome into candidate lessons | outcome | `Lesson[]` | memory/kernel | `extractLessonsFromOutcome` | candidate lessons | generic lessons with no source |
| Memory Consolidation Engine | Approve, merge, reject durable learning | lessons, existing memory | consolidation run | memory/privacy | `proposeMemoryConsolidation`, `approveMemory` | approval decisions | auto-saving junk |
| Offline Reflection Job | Clean and reorganize memory | project memory graph | reflection run | memory/graph | `runOfflineReflection` | conflicts, merges, deprecations | unsafe auto-delete |
| Evaluation Harness | Measure LMTI vs baseline | evaluation cases | evaluation run | cli/kernel/runtime | `evaluateLMTI` | metrics, traces, deltas | vanity metrics only |

## 2.1 Einstein Cognitive Principles Layer

Purpose: add physics-inspired cognitive discipline to LMTI without turning Einstein into decoration, authority theater, or fake science. Each principle below is a product rule that must become schema, API, dashboard state, tests, and metrics.

This layer is cross-cutting:

* Before memory ranking, it interprets memory relative to observer, task, project, role, time, and target model.
* Before context compilation, it checks bandwidth, simplicity, model-invariant rules, and causal evidence.
* During preflight, it runs thought experiments over candidate context packages.
* During outcome observation, it logs whether the predicted failure, gravity rule, and invariants were correct.
* It cannot allow secret, `do_not_prompt`, unapproved, or over-permission memory into context. Privacy still wins.

### Principle Map

| Einstein principle | Original meaning | Correct LMTI interpretation | Product module | Feature to build | Data to store | API/function | Dashboard | Test case | Metric | MVP/V1/V2/Future | Risk if misunderstood | Simplest first build |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Relativity Principle | Observation depends on frame of reference | Context relevance depends on observer: user, role, project, task, time, permissions, agent persona, action goal | Observer-aware Context Engine | Observer profile, context frame, role-aware memory interpretation, relative relevance | `ObserverFrame`, `ContextFrame`, role interpretation notes | `interpretMemoryByObserver(memory, observer, taskIntent)` | Observer Frame panel inside Context Preflight Battle | `Partner bị 403` is bug-like for admin, least-privilege-like for partner | `observer_context_accuracy`, `role_misinterpretation_rate`, `permission_context_error_rate` | MVP | Treating "relative" as "anything goes" and weakening security | Add role/project/task/time fields to context scoring |
| Spacetime Principle | Events need position and time to be meaningful | Memory must live in project/module/file/route/time/status space | Memory Spacetime Index | Valid-from/valid-to, route/module index, replacement chain, source event | `MemorySpacetime`, source event, related task, status | `resolveMemorySpacetime(memoryId)`, `findMemoriesInSpacetime(projectId, module, timeRange)` | Spacetime strip on Long-term Memory Graph | Deprecated partner `/dashboard` route is blocked for current task | `stale_memory_usage_rate`, `temporal_context_accuracy`, `deprecated_memory_block_rate` | MVP | Using old memory as timeless truth | Add `validFrom`, `validUntil`, `supersededBy`, `route` |
| Mass-Energy Equivalence | Mass and energy are physically related | Memory has cognitive weight based on action impact, not equal priority | Cognitive Mass Score + Memory Gravity Ranking | Score security, permission, repeated user instruction, prior incident, source trust, decision impact | `CognitiveMassScore`, impact factors, successful reuse count | `calculateCognitiveMass(memory)`, `rankByMemoryGravity(memories, taskIntent)` | Memory Gravity view | 403 negative lesson outranks logo guideline in dashboard debug | `high_impact_memory_recall_rate`, `critical_memory_miss_rate`, `cognitive_mass_precision` | MVP | Treating metaphor as physics proof or making every scary item high priority | Weighted score capped by privacy policy |
| Speed of Light Limit | Information transfer has limits | Context has token, latency, compute, and attention bandwidth limits | Context Bandwidth Optimizer | Token budget, latency budget, compression, priority ordering, noisy-memory block | `ContextBandwidthPlan`, token estimate, latency estimate | `optimizeContextBandwidth(contextCandidates, tokenBudget, latencyBudget)` | Bandwidth meter in Context Preflight Battle | Hybrid context keeps role/permission lesson and drops company profile | `context_token_efficiency`, `latency_to_context_package`, `useful_context_per_token`, `context_noise_ratio` | MVP | Using "limit" to omit required safety rules | Hard minimum safety rule set plus budget optimizer |
| Equivalence Principle | Similar physical conditions should behave consistently | Same intent/project/role should not produce random context packages | Context Consistency Engine | Find equivalent tasks, compare packages, check outcome deltas | `ContextConsistencyCheck`, equivalent task refs | `findEquivalentTasks(taskIntent, projectId)`, `compareContextConsistency(currentPackage, historicalPackages)` | Consistency lane in Evaluation Lab | Two partner dashboard 403 tasks select similar permission context | `equivalent_task_consistency_score`, `context_drift_rate`, `repeated_task_success_rate` | V1 | Freezing bad historical behavior | Use only approved successful or reviewed historical packages |
| General Relativity | Strong mass curves spacetime | High-mass memory bends future decisions toward safer attention, risk, and constraints | Memory Gravity Field | Activate risk checks and constraints around high-mass lessons | `MemoryGravityField`, activation radius, affected domains | `generateMemoryGravityField(projectId, taskIntent)`, `applyGravityFieldToRanking(memories, gravityField)` | Gravity Field overlay on Cognitive Map | Permission negative lesson activates for dashboard/role/403 tasks | `gravity_recall_accuracy`, `safety_lesson_activation_rate`, `risky_action_prevention_rate` | V1 | Over-bending every task into fear mode | Domain/tag radius around high-mass memory |
| Thought Experiment Method | Simulate consequences before formal action | Preflight context package behavior before sending it to the model | AI Thought Experiment Simulator | Simulate failure modes for each candidate package | `CognitiveThoughtExperiment`, predicted action, predicted failure | `runCognitiveThoughtExperiment(task, contextPackage)`, `predictAgentBehavior(task, contextPackage)` | Thought Experiment tab in Context Preflight Battle | Package lacking permission memory predicts unsafe 403->200 fix | `preflight_prediction_accuracy`, `prevented_failure_rate`, `hallucinated_fix_reduction` | MVP | Treating prediction as certainty | Deterministic failure-mode templates first |
| Simplicity Principle | As simple as possible, but not simpler | Context must be compact without losing critical rules | Context Simplicity Optimizer | Compactness/completeness review, safety-rule retention | `ContextSimplicityReview`, required safety rules | `simplifyContextPackage(contextPackage, minimumSafetyRules)` | Simplicity gauge in Context Compiler | Short final package still keeps "do not widen partner to admin" | `compactness_score`, `completeness_score`, `safety_rule_retention_rate`, `model_followability_score` | MVP | Oversimplifying away the rule that prevents damage | Executive summary plus mandatory safety rule checklist |
| Invariance | Valid laws hold across frames | Core privacy, permission, project rules, lessons, and constraints survive model changes | Model-Invariant Context Contract | Compile neutral contract for GPT/Claude/Gemini/local model adapters | `ModelInvariantContextContract`, invariant rule ids | `compileModelInvariantContext(contextPackage, targetModel)`, `validateContextInvariantAcrossModels(testCase)` | Invariance panel in Evaluation Lab | Same constraints appear across model-targeted packages | `model_agnostic_transfer_score`, `invariant_rule_preservation_rate`, `cross_model_behavior_consistency` | V1 | Assuming identical model behavior from identical text | Validate contract fields, not prose style |
| Causality | Events need cause/evidence chains | No memory should be trusted without source, reason, outcome, and causal relation | Causal Memory Ledger | Evidence validation, source chain, confidence, created-from-task | `CausalMemoryLedgerEntry`, evidence refs, causal relation | `traceMemoryCause(memoryId)`, `validateMemoryEvidence(memoryId)` | Causal Ledger drawer on memory nodes | Unsourced dashboard memory is blocked or low-ranked | `unsourced_memory_usage_rate`, `evidence_backed_context_rate`, `hallucinated_memory_block_rate` | MVP | Trusting confident unsourced memories | Require source metadata for approved memory |

### Data Additions

These structures extend the core schema. They can start as optional fields on existing memory/context records, then become first-class types once the MVP stabilizes.

```ts
export interface ObserverFrame {
  id: ID;
  taskId: ID;
  userId: ID;
  role: Role;
  projectId: ID;
  agentPersona: string;
  actionGoal: string;
  accessScope: string[];
  createdAt: Timestamp;
}

export interface ContextFrame {
  id: ID;
  taskId: ID;
  observerFrameId: ID;
  taskIntentId: ID;
  projectSpace: string;
  moduleSpace?: string;
  routeSpace?: string;
  timeFrame: { now: Timestamp; relevantFrom?: Timestamp; relevantUntil?: Timestamp };
}

export interface MemorySpacetime {
  memoryId: ID;
  projectId: ID;
  module?: string;
  filePath?: string;
  route?: string;
  createdAt: Timestamp;
  validFrom: Timestamp;
  validUntil?: Timestamp;
  supersededByMemoryId?: ID;
  status: "active" | "deprecated" | "expired" | "superseded";
}

export interface CognitiveMassScore {
  memoryId: ID;
  total: number;
  securityImpact: number;
  permissionImpact: number;
  priorFailureImpact: number;
  userRepetitionImpact: number;
  sourceTrustImpact: number;
  decisionImpact: number;
  successfulReuseImpact: number;
  privacyCapApplied: boolean;
  calculatedAt: Timestamp;
}

export interface ContextBandwidthPlan {
  id: ID;
  taskId: ID;
  tokenBudget: number;
  latencyBudgetMs: number;
  requiredMemoryIds: ID[];
  compressedMemoryIds: ID[];
  droppedMemoryIds: ID[];
  usefulTokenEstimate: number;
  noiseTokenEstimate: number;
}

export interface ContextConsistencyCheck {
  id: ID;
  taskId: ID;
  equivalentTaskIds: ID[];
  historicalPackageIds: ID[];
  driftScore: number;
  recommendation: "reuse_pattern" | "adapt_pattern" | "ignore_history";
}

export interface MemoryGravityField {
  id: ID;
  projectId: ID;
  taskId: ID;
  anchorMemoryIds: ID[];
  affectedDomains: string[];
  activatedRiskKinds: RiskSignal["kind"][];
  activatedConstraintTemplates: string[];
  strength: number;
}

export interface CognitiveThoughtExperiment {
  id: ID;
  taskId: ID;
  contextPackageId: ID;
  scenario: string;
  predictedAction: string;
  predictedFailure?: PredictedFailure["failureMode"];
  mitigation: string;
  confidence: number;
}

export interface ContextSimplicityReview {
  id: ID;
  contextPackageId: ID;
  compactnessScore: number;
  completenessScore: number;
  safetyRuleRetentionRate: number;
  missingRequiredRuleIds: ID[];
  recommendation: "ship" | "compress" | "add_required_rules" | "split";
}

export interface ModelInvariantContextContract {
  id: ID;
  contextPackageId: ID;
  targetModel: "gpt" | "claude" | "gemini" | "llama" | "local" | "unknown";
  invariantRuleIds: ID[];
  invariantConstraints: string[];
  privacyContract: string[];
  permissionContract: string[];
  validationStatus: "pending" | "passed" | "failed";
}

export interface CausalMemoryLedgerEntry {
  id: ID;
  memoryId: ID;
  createdBy: string;
  createdFromTaskId?: ID;
  reason: string;
  outcomeId?: ID;
  evidenceSourceIds: ID[];
  causalRelationIds: ID[];
  confidence: number;
  validatedAt?: Timestamp;
}

export interface EinsteinPrinciplesRun {
  id: ID;
  taskId: ID;
  observerFrameId: ID;
  spacetimeMemoryIds: ID[];
  highMassMemoryIds: ID[];
  gravityFieldId?: ID;
  thoughtExperimentIds: ID[];
  simplicityReviewId?: ID;
  invariantContractIds: ID[];
  causalLedgerEntryIds: ID[];
  metricLog: Record<string, number>;
  createdAt: Timestamp;
}
```

### API Additions

```ts
export async function interpretMemoryByObserver(
  memory: LongTermMemory,
  observer: ObserverFrame,
  taskIntent: TaskIntent
): Promise<{ interpretation: string; relativeRelevance: number; riskNotes: string[] }>;

export async function resolveMemorySpacetime(memoryId: ID): Promise<MemorySpacetime>;

export async function findMemoriesInSpacetime(
  projectId: ID,
  module: string | undefined,
  timeRange: { from?: Timestamp; to?: Timestamp }
): Promise<LongTermMemory[]>;

export async function calculateCognitiveMass(memory: LongTermMemory): Promise<CognitiveMassScore>;

export async function rankByMemoryGravity(
  memories: LongTermMemory[],
  taskIntent: TaskIntent
): Promise<Array<{ memory: LongTermMemory; mass: CognitiveMassScore; gravityAdjustedScore: number }>>;

export async function optimizeContextBandwidth(
  contextCandidates: ContextCandidate[],
  tokenBudget: number,
  latencyBudget: number
): Promise<ContextBandwidthPlan>;

export async function findEquivalentTasks(taskIntent: TaskIntent, projectId: ID): Promise<TaskOutcome[]>;

export async function compareContextConsistency(
  currentPackage: ContextPackage,
  historicalPackages: ContextPackage[]
): Promise<ContextConsistencyCheck>;

export async function generateMemoryGravityField(
  projectId: ID,
  taskIntent: TaskIntent
): Promise<MemoryGravityField>;

export async function applyGravityFieldToRanking(
  memories: LongTermMemory[],
  gravityField: MemoryGravityField
): Promise<LongTermMemory[]>;

export async function runCognitiveThoughtExperiment(
  task: TaskIntent,
  contextPackage: ContextPackage
): Promise<CognitiveThoughtExperiment[]>;

export async function predictAgentBehavior(
  task: TaskIntent,
  contextPackage: ContextPackage
): Promise<{ likelyAction: string; likelyFailures: PredictedFailure[] }>;

export async function simplifyContextPackage(
  contextPackage: ContextPackage,
  minimumSafetyRules: ExecutiveConstraint[]
): Promise<{ package: ContextPackage; review: ContextSimplicityReview }>;

export async function compileModelInvariantContext(
  contextPackage: ContextPackage,
  targetModel: ModelInvariantContextContract["targetModel"]
): Promise<ModelInvariantContextContract>;

export async function validateContextInvariantAcrossModels(testCase: EvaluationCase): Promise<EvaluationRun>;

export async function traceMemoryCause(memoryId: ID): Promise<CausalMemoryLedgerEntry[]>;

export async function validateMemoryEvidence(memoryId: ID): Promise<{ valid: boolean; missing: string[] }>;
```

Security rules for the Einstein layer:

* `interpretMemoryByObserver` may lower or raise relevance, but cannot change sensitivity, prompt policy, or access rights.
* `calculateCognitiveMass` must apply a privacy cap. A secret can be high impact and still blocked.
* `optimizeContextBandwidth` must preserve mandatory safety rules before optimizing token count.
* `compileModelInvariantContext` must compile structured constraints before model-specific prose.
* `validateMemoryEvidence` must fail closed for unsourced memory in high-risk tasks.

### Demo Overlay: "dashboard Agent lỗi"

Input:

```text
dashboard Agent lỗi
```

Einstein layer output:

```json
{
  "parsed_intent": {
    "task_type": "debug",
    "target_area": ["dashboard", "agent"],
    "entity": ["dashboard Agent"],
    "action_needed": ["diagnose", "verify route", "verify permission", "avoid unsafe access-control patch"],
    "risk_level": "high"
  },
  "observer_frame": {
    "observer": "developer agent acting for project maintainer",
    "role_candidates": ["admin", "partner", "staff"],
    "active_role_unknown": true,
    "interpretation_rule": "Do not decide whether 403 is bug or correct until observer role and route are known."
  },
  "spacetime_validation": {
    "valid_current_memories": [
      "Route /dashboard/summary",
      "Partner route /partner",
      "Admin route /admin",
      "Permission rule partner/admin/staff",
      "API dashboard summary"
    ],
    "deprecated_or_invalid": [
      "Deprecated memory: partner uses /dashboard"
    ],
    "status": "reject deprecated route before context compile"
  },
  "selected_high_mass_memories": [
    {
      "memory": "Lesson: 403 can be correct under least privilege",
      "reason": "permission impact high, prior bug impact high, safety impact high"
    },
    {
      "memory": "Permission rule partner/admin/staff",
      "reason": "directly controls safe fix boundary"
    },
    {
      "memory": "Previous bug: partner got 403",
      "reason": "equivalent task signal"
    }
  ],
  "rejected_low_relevance_memories": [
    "Logo guideline",
    "Dashboard UI color",
    "Company profile"
  ],
  "privacy_enforcement": {
    "blocked": ["Secret API key"],
    "rule": "High cognitive mass never bypasses secret blocking."
  },
  "predicted_failure": [
    {
      "scenario": "Agent sees 403 and patches backend to return 200",
      "failure": "permission_escalation",
      "impact": "critical",
      "mitigation": "verify role and route before changing access-control behavior"
    },
    {
      "scenario": "Agent uses deprecated partner /dashboard memory",
      "failure": "stale_memory",
      "impact": "high",
      "mitigation": "use /partner for partner route validation"
    }
  ],
  "executive_constraints": [
    "Do not change 403 to 200 before verifying observer role.",
    "Check /partner for partner users and /admin for admin users.",
    "Do not widen partner permissions into admin permissions.",
    "Do not use deprecated partner /dashboard memory.",
    "Do not inject or display Secret API key.",
    "Keep final context compact, but retain permission and least-privilege rules."
  ],
  "final_context_package": {
    "observer_relative_summary": "A dashboard 403 can mean different things for admin, partner, staff, or dev-agent observer. Treat role as unknown until verified.",
    "technical_context": [
      "Route /dashboard/summary",
      "Partner route /partner",
      "Admin route /admin",
      "Permission rule partner/admin/staff",
      "API dashboard summary"
    ],
    "high_mass_lessons": [
      "403 may be correct under least privilege.",
      "Do not fix access-control by broadening role permission without evidence."
    ],
    "blocked_context": [
      "Secret API key blocked",
      "Deprecated partner /dashboard memory rejected",
      "Logo/color/company profile dropped as noise"
    ],
    "next_action": "Reproduce failing role and route, inspect API status, then patch only the exact route/permission/UI handling proven wrong."
  },
  "explanation": "The layer treats context as observer-relative, validates memory in project/time/route space, ranks permission lessons by cognitive mass, compresses within bandwidth, compares equivalent 403 tasks, applies gravity from negative lessons, simulates unsafe fixes, preserves safety rules across model targets, and requires causal evidence for memory use.",
  "metric_log": {
    "observer_context_accuracy": 1,
    "deprecated_memory_block_rate": 1,
    "high_impact_memory_recall_rate": 1,
    "context_noise_ratio": 0.18,
    "preflight_prediction_accuracy": 0.75,
    "safety_rule_retention_rate": 1,
    "invariant_rule_preservation_rate": 1,
    "evidence_backed_context_rate": 0.9
  }
}
```

### Einstein Layer Product Positioning

LMTI brings physics-inspired cognitive discipline to AI memory: context is relative, memory has weight, information has limits, and every action must pass a preflight thought experiment before the model acts.

LMTI đưa kỷ luật nhận thức lấy cảm hứng từ Einstein vào trí nhớ AI: context là tương đối theo người dùng và nhiệm vụ, memory có trọng lượng, thông tin có giới hạn, và mỗi hành động phải qua một mô phỏng rủi ro trước khi model chạy.

## 3. Minimal Data Schema

These are implementation-ready TypeScript contracts. Storage can start as JSON files and later move to SQLite or encrypted local storage without changing the domain model.

```ts
export type ID = string;
export type Timestamp = string;
export type Sensitivity = "public" | "internal" | "confidential" | "secret";
export type PromptPolicy = "allow_raw" | "summarize_only" | "do_not_prompt";
export type Role = "owner" | "maintainer" | "developer" | "agent" | "readonly" | "external_model";
export type ApprovalState = "draft" | "proposed" | "approved" | "rejected" | "deprecated" | "archived";
export type MemoryKind =
  | "user_preference"
  | "project_rule"
  | "technical_fact"
  | "bug"
  | "lesson"
  | "decision"
  | "policy"
  | "habit"
  | "success_pattern"
  | "negative_lesson";

export interface UserProfile {
  id: ID;
  userId: ID;
  preferredTone: string[];
  artifactPreferences: string[];
  repeatedInstructions: string[];
  consent: { personalizationAllowed: boolean; lastConfirmedAt: Timestamp };
  sensitivity: Sensitivity;
  promptPolicy: PromptPolicy;
  sourceIds: ID[];
  updatedAt: Timestamp;
}

export interface AgentSelfModel {
  id: ID;
  agentId: ID;
  projectId: ID;
  role: string;
  operatingPrinciples: string[];
  hardBoundaries: string[];
  responseStyle: string[];
  nonClaims: string[];
  continuityRules: string[];
  updatedAt: Timestamp;
}

export interface ProjectOperatingMemory {
  id: ID;
  projectId: ID;
  mission: string;
  currentScope: string[];
  architecturalPrinciples: string[];
  productDirection: string[];
  knownRisks: ID[];
  activeRFCs: string[];
  sourceIds: ID[];
  updatedAt: Timestamp;
}

export interface TaskIntent {
  id: ID;
  taskId: ID;
  projectId: ID;
  userId: ID;
  rawInputHash: string;
  taskType: "debug" | "feature" | "research" | "architecture" | "security" | "docs" | "unknown";
  targetArea: string[];
  entity: string[];
  actionNeeded: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  confidence: number;
  unknowns: string[];
  createdAt: Timestamp;
}

export interface AttentionFocus {
  id: ID;
  taskId: ID;
  focusOn: string[];
  ignore: Array<{ term: string; reason: string }>;
  memoryDomains: MemoryKind[];
  sourcePreferences: string[];
  maxContextTokens: number;
  confidence: number;
  createdAt: Timestamp;
}

export interface WorkingMemoryItem {
  id: ID;
  taskId: ID;
  kind: "assumption" | "finding" | "constraint" | "unknown" | "step" | "result";
  content: string;
  sourceId?: ID;
  sensitivity: Sensitivity;
  promptPolicy: PromptPolicy;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export interface LongTermMemory {
  id: ID;
  projectId: ID;
  kind: MemoryKind;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  salience: number;
  confidence: number;
  sensitivity: Sensitivity;
  promptPolicy: PromptPolicy;
  approvalState: ApprovalState;
  sourceIds: ID[];
  relationIds: ID[];
  expiresAt?: Timestamp;
  deprecatedAt?: Timestamp;
  deprecatedReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemoryRelation {
  id: ID;
  fromMemoryId: ID;
  toMemoryId: ID;
  relation:
    | "supports"
    | "contradicts"
    | "supersedes"
    | "duplicates"
    | "caused_by"
    | "fixes"
    | "derived_from";
  confidence: number;
  createdAt: Timestamp;
}

export interface MemorySource {
  id: ID;
  projectId: ID;
  sourceType: "chat" | "code" | "doc" | "commit" | "log" | "dashboard" | "test" | "user_feedback" | "outcome";
  sourceRef: string;
  sourceHash?: string;
  trustLevel: "low" | "medium" | "high";
  capturedAt: Timestamp;
}

export interface MemoryTag {
  id: ID;
  name: string;
  domain: "product" | "technical" | "privacy" | "security" | "workflow" | "user" | "project";
  description: string;
}

export interface PrivacyPolicy {
  id: ID;
  projectId: ID;
  role: Role;
  allowRaw: Sensitivity[];
  summarizeOnly: Sensitivity[];
  deny: Sensitivity[];
  denyPromptPolicies: PromptPolicy[];
  auditRequiredFor: Sensitivity[];
  updatedAt: Timestamp;
}

export interface RiskSignal {
  id: ID;
  taskId: ID;
  kind:
    | "privacy"
    | "secret"
    | "permission_escalation"
    | "destructive_change"
    | "stale_memory"
    | "prompt_injection"
    | "wrong_context"
    | "repeated_error";
  severity: "low" | "medium" | "high" | "critical";
  evidenceRefs: ID[];
  message: string;
  mitigation: string;
  createdAt: Timestamp;
}

export interface ContextCandidate {
  id: ID;
  taskId: ID;
  strategy: "keyword" | "intent" | "role_permission" | "lesson" | "hybrid";
  memoryIds: ID[];
  includedSourceIds: ID[];
  blockedMemoryIds: ID[];
  score: number;
  tokenEstimate: number;
  rationale: string;
}

export interface ContextPackage {
  id: ID;
  taskId: ID;
  candidateId: ID;
  summary: string;
  projectRules: string[];
  technicalMemories: string[];
  lessons: string[];
  blockedContextSummary: string[];
  constraints: string[];
  nextActionSuggestion: string;
  tokenEstimate: number;
  privacyAuditIds: ID[];
  createdAt: Timestamp;
}

export interface PreflightRun {
  id: ID;
  taskId: ID;
  candidateIds: ID[];
  riskSignalIds: ID[];
  predictedFailureIds: ID[];
  selectedPackageId?: ID;
  selectedReason?: string;
  createdAt: Timestamp;
}

export interface PredictedFailure {
  id: ID;
  contextCandidateId: ID;
  failureMode:
    | "wrong_route"
    | "permission_bypass"
    | "stale_memory"
    | "secret_leak"
    | "noise_overload"
    | "missing_source"
    | "overbroad_fix";
  probability: number;
  impact: "low" | "medium" | "high" | "critical";
  mitigation: string;
}

export interface ExecutiveConstraint {
  id: ID;
  taskId: ID;
  severity: "advisory" | "must" | "blocker";
  text: string;
  sourceRiskIds: ID[];
  acknowledgedByAgent: boolean;
  createdAt: Timestamp;
}

export interface TaskOutcome {
  id: ID;
  taskId: ID;
  actionsTaken: string[];
  filesTouched: string[];
  testsRun: string[];
  result: "success" | "partial" | "failed" | "blocked";
  constraintViolations: string[];
  predictionMatches: Array<{ predictedFailureId: ID; matched: boolean; note: string }>;
  userFeedback?: string;
  createdAt: Timestamp;
}

export interface Lesson {
  id: ID;
  projectId: ID;
  taskOutcomeId: ID;
  type: "positive" | "negative" | "risk" | "workflow" | "technical" | "privacy";
  text: string;
  sourceIds: ID[];
  confidence: number;
  sensitivity: Sensitivity;
  promptPolicy: PromptPolicy;
  approvalState: ApprovalState;
  createdAt: Timestamp;
}

export interface MemoryConsolidationRun {
  id: ID;
  projectId: ID;
  lessonIds: ID[];
  proposedMemoryIds: ID[];
  mergedMemoryIds: ID[];
  rejectedLessonIds: ID[];
  approverRole?: Role;
  status: "proposed" | "approved" | "rejected" | "partial";
  createdAt: Timestamp;
}

export interface OfflineReflectionRun {
  id: ID;
  projectId: ID;
  mergedMemoryIds: ID[];
  deprecatedMemoryIds: ID[];
  compressedMemoryIds: ID[];
  conflictIds: ID[];
  suggestedOperatingRules: string[];
  status: "dry_run" | "applied" | "failed";
  createdAt: Timestamp;
}

export interface MemoryConflict {
  id: ID;
  projectId: ID;
  memoryIds: ID[];
  conflictType: "contradiction" | "stale_vs_current" | "duplicate" | "privacy_mismatch";
  evidenceRefs: ID[];
  recommendedAction: "merge" | "deprecate" | "manual_review" | "split";
  status: "open" | "resolved" | "ignored";
  createdAt: Timestamp;
}

export interface SuccessPattern {
  id: ID;
  projectId: ID;
  title: string;
  workflowSteps: string[];
  effectiveContextStrategy: string;
  evidenceOutcomeIds: ID[];
  measuredImpact: Record<string, number>;
  approvalState: ApprovalState;
}

export interface NegativeLesson {
  id: ID;
  projectId: ID;
  avoidPattern: string;
  saferAlternative: string;
  sourceOutcomeIds: ID[];
  severity: "low" | "medium" | "high" | "critical";
  sensitivity: Sensitivity;
  approvalState: ApprovalState;
}

export interface EvaluationCase {
  id: ID;
  projectId: ID;
  name: string;
  input: string;
  memoryPoolIds: ID[];
  expectedFocus: string[];
  expectedBlocked: string[];
  expectedConstraints: string[];
  expectedOutcomeChecks: string[];
}

export interface EvaluationRun {
  id: ID;
  evaluationCaseId: ID;
  baselineResult: Record<string, unknown>;
  lmtiResult: Record<string, unknown>;
  metrics: Record<string, number>;
  passed: boolean;
  createdAt: Timestamp;
}
```

## 4. API And Function Design

```ts
export async function parseIntent(input: string, projectId: ID, userId: ID): Promise<TaskIntent>;

export async function createAttentionFocus(intent: TaskIntent, projectId: ID): Promise<AttentionFocus>;

export async function writeWorkingMemory(
  taskId: ID,
  data: Omit<WorkingMemoryItem, "id" | "taskId" | "createdAt">
): Promise<WorkingMemoryItem>;

export async function clearWorkingMemory(taskId: ID): Promise<{ taskId: ID; cleared: number; summary?: string }>;

export async function retrieveLongTermMemory(attentionFocus: AttentionFocus): Promise<LongTermMemory[]>;

export function scoreMemorySalience(memory: LongTermMemory, intent: TaskIntent): number;

export async function detectRiskSignals(
  intent: TaskIntent,
  memories: LongTermMemory[],
  role: Role
): Promise<RiskSignal[]>;

export async function enforceMemoryPrivacy(
  memories: LongTermMemory[],
  policy: PrivacyPolicy,
  role: Role
): Promise<{ allowed: LongTermMemory[]; summarized: LongTermMemory[]; blocked: LongTermMemory[]; auditIds: ID[] }>;

export async function generateContextCandidates(
  memories: LongTermMemory[],
  intent: TaskIntent
): Promise<ContextCandidate[]>;

export async function runContextPreflight(
  candidates: ContextCandidate[],
  riskSignals: RiskSignal[]
): Promise<PreflightRun>;

export async function predictAgentFailures(contextPackage: ContextPackage): Promise<PredictedFailure[]>;

export function selectBestContextPackage(packages: ContextPackage[]): ContextPackage;

export async function compileContextForModel(selectedPackage: ContextPackage): Promise<string>;

export async function generateExecutiveConstraints(
  intent: TaskIntent,
  riskSignals: RiskSignal[]
): Promise<ExecutiveConstraint[]>;

export async function observeTaskOutcome(taskId: ID, result: unknown): Promise<TaskOutcome>;

export async function extractLessonsFromOutcome(outcome: TaskOutcome): Promise<Lesson[]>;

export async function proposeMemoryConsolidation(lessons: Lesson[]): Promise<MemoryConsolidationRun>;

export async function approveMemory(memoryId: ID): Promise<LongTermMemory>;

export async function deprecateMemory(memoryId: ID): Promise<LongTermMemory>;

export async function runOfflineReflection(projectId: ID): Promise<OfflineReflectionRun>;

export async function detectMemoryContradictions(projectId: ID): Promise<MemoryConflict[]>;

export async function evaluateLMTI(testCaseId: ID): Promise<EvaluationRun>;
```

Security behavior required by these APIs:

* `enforceMemoryPrivacy` must run before `compileContextForModel`.
* `compileContextForModel` must never receive blocked memory raw content.
* `approveMemory` must require an allowed role and write an audit event.
* `deprecateMemory` must preserve audit history before hiding memory from selection.
* `runOfflineReflection` defaults to dry-run until a maintainer approves changes.

## 5. Dashboard Design

| Screen | Purpose | Data displayed | User actions | Main metric |
|---|---|---|---|---|
| Cognitive Map | Show full flow from intent to lesson | intent, attention, memory, risk, preflight, context, outcome, lesson | inspect run, open node, compare baseline | `agent_continuity_score` |
| Attention Viewer | Explain what LMTI focuses on and ignores | focus terms, ignored memories, reasons, scores | mark false positive/negative | `attention_accuracy` |
| Working Memory Board | Show temporary task state | assumptions, findings, unknowns, TTL | clear, summarize, promote proposal | `context_noise_ratio` |
| Long-term Memory Graph | Show durable memory relations | user/project/task/lesson/decision/bug/rule nodes | approve relation, deprecate node | `wrong_context_rate` |
| Risk Console | Show safety and privacy risks | privacy, permission, destructive, repeated bug risk | accept mitigation, block run | `privacy_violation_rate` |
| Context Preflight Battle | Compare context packages | package A-E scores, predicted failures, token estimate | select package, override with reason | `prediction_accuracy` |
| Executive Constraints Panel | Show constraints sent to agent | must/advisory/blocker constraints | require acknowledgment, edit template | `permission_mistake_reduction` |
| Outcome Observer | Compare actual action with prediction | actions, files, tests, violations, prediction matches | mark outcome quality | `task_revision_reduction` |
| Lesson Inbox | Approve or reject learning | proposed lessons, source, confidence, privacy tag | approve, reject, edit, merge | `lesson_acceptance_rate` |
| Offline Reflection Center | Show cleanup suggestions | merged, deprecated, compressed, conflict memories | apply dry-run, open conflict | `contradiction_resolution_rate` |
| Memory Immune Log | Show blocked memory/input | secret, `do_not_prompt`, injection, low confidence blocks | inspect metadata, update pattern | `secret_block_rate` |
| Evaluation Lab | Compare baseline vs LMTI | test cases, traces, metric deltas | run suite, export report | `model_agnostic_transfer_score` |

## 6. Mandatory Demo: "dashboard Agent lỗi"

### Memory Pool

1. Logo guideline
2. Dashboard UI color
3. Route `/dashboard/summary`
4. Partner route `/partner`
5. Admin route `/admin`
6. Permission rule partner/admin/staff
7. Previous bug: partner bị 403
8. Lesson: 403 có thể đúng theo least privilege
9. Company profile
10. API dashboard summary
11. Coding convention
12. User preference: luôn bám sản phẩm, nói thẳng, không văn mẫu
13. Secret API key
14. Deprecated memory: partner dùng `/dashboard`

### A. Intent Parser

```json
{
  "task_type": "debug",
  "target_area": ["dashboard", "agent-runtime-or-ui"],
  "entity": ["Agent", "dashboard"],
  "action_needed": ["diagnose", "verify route", "verify permission", "propose safe fix"],
  "risk_level": "high"
}
```

Reason: "lỗi" is underspecified. Dashboard plus agent can touch routes, permissions, API data, and role-based access.

### B. Attention Router

Focus on:

* Route `/dashboard/summary`
* Partner route `/partner`
* Admin route `/admin`
* Permission rule partner/admin/staff
* Previous bug: partner bị 403
* Lesson: 403 có thể đúng theo least privilege
* API dashboard summary
* Coding convention
* User preference: bám sản phẩm, nói thẳng

Ignore:

* Logo guideline: unrelated to debug unless UI asset is explicitly broken.
* Dashboard UI color: cosmetic, not first-pass failure cause.
* Company profile: low task relevance.
* Deprecated memory: partner dùng `/dashboard`: stale and dangerous.
* Secret API key: blocked by privacy firewall.

### C. Working Memory

```json
{
  "current_task_state": "Debug dashboard Agent issue, likely route/permission/API interaction.",
  "temporary_assumptions": [
    "User has not specified exact role, URL, stack trace, or status code.",
    "403 may be correct for partner if endpoint is admin-only."
  ],
  "unknowns": [
    "Which role saw the failure?",
    "Which route was opened?",
    "Was the failure 403, 404, 500, blank UI, or API error?",
    "Which dashboard component calls /dashboard/summary?"
  ]
}
```

### D. Long-term Memory Retrieval

Selected memories:

| Memory | Reason |
|---|---|
| Route `/dashboard/summary` | likely API/route target |
| Partner route `/partner` | role-specific routing |
| Admin route `/admin` | role-specific routing |
| Permission rule partner/admin/staff | prevents unsafe permission widening |
| Previous bug: partner bị 403 | relevant repeated bug |
| Lesson: 403 có thể đúng theo least privilege | negative lesson and safety rule |
| API dashboard summary | likely backend contract |
| Coding convention | needed only after diagnosis |
| User preference | controls response style, not technical logic |

Rejected memories:

| Memory | Reason |
|---|---|
| Logo guideline | context noise |
| Dashboard UI color | context noise |
| Company profile | context noise |
| Secret API key | secret, never prompt |
| Deprecated partner `/dashboard` | stale, actively dangerous |

### E. Risk Detector

```json
{
  "permission_escalation_risk": "high: dashboard failure may tempt agent to broaden partner/admin access",
  "stale_memory_risk": "high: deprecated partner /dashboard memory conflicts with /partner route",
  "privacy_risk": "critical: memory pool contains Secret API key",
  "wrong_context_risk": "medium: logo/color/company memories are keyword-adjacent but irrelevant"
}
```

### F. Privacy Firewall

Actions:

* Block Secret API key completely.
* Block any `do_not_prompt` memory if present.
* Summarize confidential memory as metadata only.
* Write audit: `secret_blocked`, `deprecated_memory_rejected`, `low_relevance_rejected`.

No raw secret value appears in model context or dashboard.

### G. Context Preflight

| Package | Strategy | Included | Predicted failure | Score |
|---|---|---|---|---|
| A | keyword | dashboard UI color, logo, `/dashboard/summary` | cosmetic noise, may debug wrong layer | 0.42 |
| B | intent | routes, API dashboard summary, coding convention | may miss role-specific permission issue | 0.71 |
| C | role/permission | `/partner`, `/admin`, permission rule, prior 403 | may under-use API contract | 0.82 |
| D | lesson | previous 403, least privilege lesson, negative rule | may become too defensive without route check | 0.77 |
| E | hybrid | routes, permission rule, API summary, prior bug, least privilege lesson, user preference, blocks secret/deprecated | best coverage with lowest risk | 0.93 |

Selected package: E hybrid.

Selection reason: It has the lowest permission mistake risk, blocks stale/secret context, and includes enough technical detail to diagnose route, role, and API contract.

### H. Executive Constraints

* Do not change 403 to 200 before verifying role and route.
* Check route `/partner` for partner users.
* Check route `/admin` for admin users.
* Check permission rule partner/admin/staff before patching access control.
* Do not broaden partner permissions into admin permissions.
* Do not use deprecated memory saying partner uses `/dashboard`.
* Do not inject or print Secret API key.
* Prefer diagnosis order: reproduce role -> route -> API status -> permission guard -> UI handling -> patch.

### I. Final Context Package

```json
{
  "task_summary": "Debug 'dashboard Agent lỗi' as a route/permission/API issue with high privacy and permission risk.",
  "selected_project_rules": [
    "Partner/admin/staff permissions must remain least-privilege.",
    "Partner route is /partner; admin route is /admin.",
    "403 may be correct if role lacks permission."
  ],
  "selected_technical_memories": [
    "Dashboard summary endpoint: /dashboard/summary",
    "API dashboard summary contract",
    "Coding convention only after root cause is clear"
  ],
  "selected_lessons": [
    "Do not treat every 403 as a bug.",
    "Verify role before changing permission behavior."
  ],
  "blocked_context_summary": [
    "Secret memory blocked.",
    "Deprecated partner /dashboard route blocked.",
    "Logo, color, company profile ignored as low relevance."
  ],
  "constraints": [
    "No permission widening without role proof.",
    "No raw secret in prompt.",
    "No deprecated route usage."
  ],
  "next_action_suggestion": "Ask for or inspect failing role, actual route, HTTP status, and dashboard API call before patching."
}
```

### J. Outcome Observer

Expected outcome tracking:

* Agent checked current route definitions and permission guard.
* Agent verified whether partner hit `/dashboard/summary` or should be redirected to `/partner`.
* Agent did not modify role permissions without evidence.
* Agent did not use deprecated route memory.
* Agent did not expose Secret API key.
* Prediction matched if stale route or permission confusion caused the issue.
* New lesson is needed if a new route/role invariant is discovered.

### K. Proposed Lesson

```json
{
  "lesson_text": "For dashboard errors, verify role-specific route and permission rules before changing access-control behavior. A 403 can be correct under least privilege.",
  "type": "negative",
  "source": "TaskOutcome plus permission rule memories",
  "confidence": 0.87,
  "privacy_tag": "internal",
  "prompt_policy": "summarize_only",
  "action": "approve_or_reject"
}
```

## 7. Metrics

| Metric | Definition | How to measure | Data to log | MVP target |
|---|---|---|---|---|
| `attention_accuracy` | Correct relevant/irrelevant memory decisions | human-labeled expected focus vs selected focus | focus, ignore, expected labels | >= 0.80 |
| `wrong_context_rate` | Tasks with harmful or irrelevant context selected | count wrong-context incidents per evaluation run | selected memory ids, failure labels | <= 0.15 |
| `context_noise_ratio` | Irrelevant tokens divided by total context tokens | reviewer or test label token spans | context package, noise labels | <= 0.25 |
| `privacy_violation_rate` | Raw restricted data leaked to context/UI | violation count per run | privacy audit, compiled context hash | 0 |
| `secret_block_rate` | Known secret memories correctly blocked | blocked known secrets / total known secrets | secret test fixtures, block events | 1.00 |
| `permission_mistake_reduction` | Reduction of unsafe permission fixes vs baseline | baseline unsafe fixes minus LMTI unsafe fixes | outcomes, constraint violations | >= 50% |
| `repeated_error_reduction` | Reduction in recurrence of known mistakes | compare repeated error count over suites | negative lessons, outcomes | >= 30% |
| `stale_memory_usage_rate` | Deprecated/expired memory used in context | stale included / stale candidates | memory state, context package | 0 |
| `lesson_acceptance_rate` | Proposed lessons accepted by reviewer | approved / proposed | lesson inbox actions | 0.35-0.75 |
| `prediction_accuracy` | Predicted failures that match outcomes | matched predictions / predictions | preflight, outcome observer | >= 0.60 |
| `task_revision_reduction` | Fewer user correction rounds | baseline revisions vs LMTI revisions | task events, user feedback | >= 25% |
| `user_repeated_instruction_reduction` | User repeats same preference less often | repeated instruction count trend | user feedback, profile hits | >= 25% |
| `memory_decay_quality` | Deprecated/archived memories are truly low value | sampled reviewer score | decay actions, access history | >= 0.80 precision |
| `contradiction_resolution_rate` | Open conflicts resolved | resolved conflicts / detected conflicts | conflict records | >= 0.50 |
| `agent_continuity_score` | Agent preserves project role/rules across tasks | rubric score per task | self model, context, response checks | >= 0.80 |
| `context_token_efficiency` | Useful context per token | useful labeled tokens / total tokens | context package, labels | >= 0.70 |
| `time_to_correct_context` | Time or steps until right context package selected | timestamp/step difference | preflight traces | <= 2 selection passes |
| `model_agnostic_transfer_score` | Gains hold across models/agents | average metric delta across adapters | adapter id, evaluation run | positive on 2+ adapters |

## 8. MVP Roadmap: 21 Days

| Day | Deliverable | Acceptance check |
|---|---|---|
| 1 | Finalize schema contracts in `packages/types` draft | All entities above mapped to TypeScript types |
| 2 | Memory types and tags | `project_rule`, `bug`, `lesson`, `policy`, `negative_lesson` work in fixtures |
| 3 | Privacy fields required on memory | missing sensitivity/prompt policy fails validation |
| 4 | Task intent parser MVP | "dashboard Agent lỗi" -> debug/dashboard/Agent/high risk |
| 5 | Attention Router MVP | selects route/permission memories and rejects logo/color |
| 6 | Privacy Firewall MVP | secret and `do_not_prompt` blocked with audit |
| 7 | Week 1 evaluation fixtures | demo pool test passes focus/privacy expectations |
| 8 | Memory retrieval by focus/domain | selected memory ids are explainable |
| 9 | Context candidate generator | keyword, intent, role/permission, lesson, hybrid packages created |
| 10 | Risk Detector MVP | permission, stale, privacy, wrong-context risks detected |
| 11 | Context Preflight Engine | predicts failure per package |
| 12 | Executive Constraint generator | produces dashboard permission constraints |
| 13 | Final Context Compiler | outputs compact, privacy-safe context package |
| 14 | Week 2 integration test | hybrid package selected for demo |
| 15 | Outcome Observer | captures actions, files, tests, violations |
| 16 | Lesson Extractor | proposes positive/negative/privacy lessons |
| 17 | Lesson Inbox CLI | approve/reject/edit memory proposals |
| 18 | Offline Reflection dry-run | duplicate/stale/conflict suggestions |
| 19 | Evaluation Lab CLI | baseline vs LMTI metrics for demo cases |
| 20 | Demo "dashboard Agent lỗi" | end-to-end run with blocked secret and constraints |
| 21 | Technical pitch deck outline | product thesis, architecture, demo trace, metrics, risks |

## 9. Product Positioning

### 1. One sentence

LMTI is cognitive preflight for AI agents.

### 2. Landing page, three sentences

AI agents fail when they remember the wrong thing, ignore the right rule, or act before checking risk. LMTI gives agents a local cognitive preflight layer that selects context, blocks sensitive memory, predicts failures, adds constraints, observes outcomes, and proposes lessons. It turns project memory into operational intelligence that can be tested, measured, and improved.

### 3. Technical pitch for developers

LMTI sits before the model and runtime. It parses intent, routes memory domains, ranks context, enforces privacy, runs preflight over multiple context packages, generates executive constraints, and records outcomes for lesson approval. The first MVP should integrate with the existing CLI, memory, privacy, kernel, and runtime packages without requiring cloud services, vector databases, or a specific LLM.

### 4. Investor pitch

AI agents are moving from chat to action, but their context systems are still primitive. LMTI becomes the control layer that makes agent work safer, more repeatable, and easier to audit by turning memory into governed operational intelligence. The wedge is developer agents: fewer wrong fixes, fewer repeated instructions, safer permission handling, and measurable context efficiency.

### 5. 60-second demo pitch

"Watch this agent receive a vague task: `dashboard Agent lỗi`. A normal memory system might grab dashboard colors, logo rules, a stale route, and even a secret. LMTI does something different. It parses the task as a debug issue, focuses on routes, roles, permissions, prior 403 bugs, and API contracts, blocks the secret, rejects deprecated memory, compares five context packages, predicts how each can fail, and chooses the hybrid package. Before the agent acts, LMTI sends constraints: do not turn 403 into 200, verify `/partner`, verify permission rules, do not widen partner into admin, and never inject secrets. After the task, LMTI observes what happened and proposes a lesson for approval. That is the product: not memory retrieval, cognitive preflight."

## 10. MVP Test Matrix

| Capability | Test input | Expected result |
|---|---|---|
| Attention | demo memory pool | logo/color ignored, route/permission selected |
| Working memory | unresolved role and route | assumptions stored with TTL |
| Long-term retrieval | dashboard debug intent | permission and prior bug memories retrieved |
| Privacy firewall | secret memory in pool | secret blocked, audit written |
| Risk detection | partner 403 history | permission escalation and stale memory risks high |
| Preflight | packages A-E | hybrid selected |
| Executive constraints | high permission risk | no 403->200 without role verification |
| Outcome observer | agent modifies permission | violation flagged if no role proof |
| Lesson approval | proposed 403 lesson | waits for approve/reject |
| Forgetting | deprecated `/dashboard` memory | not included in context |
| Evaluation | baseline vs LMTI demo | LMTI wins on secret block and wrong-context rate |
| Observer-aware relativity | admin vs partner view of 403 | interpretation changes, permissions do not |
| Memory spacetime | superseded route memory | stale route rejected with reason |
| Cognitive mass | permission lesson vs logo guideline | permission lesson ranks higher |
| Bandwidth optimizer | small token budget | safety rules retained, noise dropped |
| Context consistency | repeated dashboard 403 task | similar approved context strategy reused |
| Memory gravity field | dashboard/role/403 task | least-privilege negative lesson activates constraints |
| Thought experiment | package without permission memory | predicts unsafe access-control patch |
| Simplicity optimizer | compact final context | required permission rule still present |
| Model invariance | GPT/Claude/local targets | invariant constraints preserved |
| Causal ledger | unsourced memory candidate | blocked or low-ranked in high-risk task |

## 11. Architectural Weaknesses To Watch

1. Attention can become another brittle keyword filter if intent/domain/risk are not co-scored.
2. Privacy cannot depend on the model "behaving". It must be enforced before prompt compilation.
3. Salience can accidentally make sensitive memories more likely to leak. Salience must be capped by privacy.
4. Offline reflection must start as dry-run. Auto-merge and auto-delete are dangerous in early versions.
5. Lessons must require approval, otherwise LMTI becomes a memory-poisoning machine.
6. Evaluation must compare against a baseline agent, not just report internal scores.
7. Model-agnostic design must remain real: no schema field should assume one vendor or context format.
8. Einstein metaphors can become marketing noise if they do not stay tied to schemas, APIs, dashboards, tests, and metrics.
9. Cognitive mass and gravity can over-prioritize scary memories. Privacy caps, evidence checks, and outcome metrics must keep them honest.

## 12. Sprint 0 Definition Of Done

This RFC is ready for implementation planning when:

* every MVP module has a schema, API surface, test, and metric;
* privacy enforcement is before context compilation;
* forgetting and deprecation are first-class memory states;
* outcome observation and lesson approval are in the end-to-end loop;
* the demo can be replayed as a deterministic evaluation case;
* no part of the design claims AI consciousness or human identity.
