# RFC-0010: LMTI System Architecture

> Research archive. This RFC contains broader architecture exploration and
> roadmap language. It should not be read as current product support.

Status: Draft
Sprint: 0 architecture lock candidate  
Audience: core, memory, privacy, kernel, CLI, SDK, server, dashboard, adapter, plugin, eval

## 1. Executive Summary

LMTI is an AI Cognitive Kernel: a model-agnostic control layer between user intent, project memory, policy, model execution, tools, outcomes, and long-term learning.

It solves the real failure modes of AI agents: wrong context, noisy memory, stale rules, repeated bugs, privacy leaks, unsafe permission edits, missing continuity, and unexplainable context decisions. A normal memory framework retrieves information. LMTI decides what the task means, which observer frame applies, which memory is valid, which memory is blocked, which context package is safest, which constraints the agent must obey, and what should be learned after the task.

The complete architecture has eight layers: interface, task intelligence, memory kernel, policy/privacy, context intelligence, execution control, learning, and evaluation/governance. MVP starts with the Coding Agent/Codex path: local memory filesystem, intent parser, attention router, privacy firewall, context preflight, context compiler, executive constraints, outcome observer, lesson inbox, audit log, and one deterministic evaluation case for `dashboard Agent lỗi`.

[CẢNH BÁO BẢO MẬT] Secrets, `do_not_prompt`, and deprecated memory must be blocked inside the kernel before prompt compilation. A model instruction that says "do not leak secrets" is not a security boundary.

### 1.1 Non-Negotiable Kernel Invariants

These invariants optimize the logic and security model of LMTI. They are hard architecture rules, not implementation preferences.

| Invariant | Rule | Why it matters |
|---|---|---|
| Hard gate before scoring | `secret`, `do_not_prompt`, wrong project, unauthorized role, and deprecated-as-truth fail before scoring | high relevance must never override permission |
| Metadata-first retrieval | hot path retrieves memory metadata before content | prevents raw restricted memory from entering ranking |
| Cognitive mass after policy metadata | cognitive mass ranks only policy-eligible metadata/content | raw secrets are never ranked or boosted |
| Policy-safe preflight only | preflight receives only allowed/summarized context candidates | simulated packages cannot leak blocked memory |
| Compiler receives no blocked raw memory | context compiler accepts selected safe package, constraints, and blocked summaries only | final model context cannot accidentally include blocked data |
| Audit and explanation are separate | audit is the real internal log; explanation is redacted for dashboard/user | debug visibility without leaking sensitive evidence |
| Offline work is async | reflection, decay, consolidation, and broad evaluation do not run in the task hot path | keeps preflight latency sane |
| Adapters/plugins are sandboxed | adapters/plugins use manifest scopes and cannot call memory store directly | prevents driver/plugin bypass of privacy policy |

### 1.2 Kernel Backbone Gap Closure

The current LMTI module list covers the cognitive motion loop. To make it a kernel instead of a feature pile, these backbone blocks are mandatory.

| Missing backbone block | Why it is required | Owns | MVP build |
|---|---|---|---|
| Kernel Orchestrator / Runtime Coordinator | Runs modules in one deterministic order and prevents hidden shortcuts | pipeline state, step status, failure handling | `KernelRun` object plus orchestrated `preflight()` |
| Policy Engine / Permission System | Makes privacy enforceable before context reaches a model | read/write/inject/summarize decisions | tag matrix with deny-by-default rules |
| Memory Provenance / Causal Ledger | Stops hallucinated or unsourced memories from becoming truth | source, cause, task, outcome, confidence | required `source` and `CausalLedgerEntry` |
| Memory Graph / Conflict Resolver | Handles supports/contradicts/supersedes/duplicates relations | memory relations and conflicts | relation table plus conflict dry-run |
| Context Decision Explanation Engine | Turns audit traces into human-debuggable explanations | selected/rejected/blocked reasons | `explainContextDecision(preflightId)` |
| Adapter & Plugin Governance | Keeps drivers/plugins from bypassing kernel policy | manifest, permissions, hooks, versions | manifest validator and hook audit |
| Spec / Contract Layer | Makes LMTI an open standard, not only local code | schema versions and compatibility | versioned JSON schemas for core objects |
| Storage Backend Abstraction | Keeps memory filesystem independent from local files/Postgres/vector index | storage driver contract | local file backend interface |
| Scheduler / Daemon Runtime | Runs reflection, decay, consolidation, eval outside task time | jobs, schedules, daemon logs | manual `reflection run` plus job schema |
| Security Sandbox | Prevents plugins/adapters/tools from reading memory outside policy | plugin/tool isolation and scoped payloads | no-network plugin sandbox policy |

These blocks are not optional polish. They are the difference between "LMTI has features" and "LMTI is a cognitive kernel."

## 2. System Definition

English:

**LMTI is a model-agnostic cognitive kernel that turns task input into permission-safe, preflighted, explainable context and learns from outcomes through approved memory.**

Vietnamese:

**LMTI là kernel nhận thức không phụ thuộc model, biến task input thành context an toàn, đã preflight, giải thích được, rồi học từ outcome thông qua memory được approve.**

## 3. System Positioning Diagram

```text
User / App / IDE / Robot / Automation
        |
        v
Interface Layer
  API / SDK / CLI / Dashboard / Adapter Input
        |
        v
LMTI Cognitive Kernel
  Kernel Orchestrator / Runtime Coordinator
    KernelRun
    Step Graph
    Error Boundary
    Audit Dispatcher
  Task Intelligence
    Input Normalizer
    Intent Parser
    Observer Frame
    Attention Router
    Risk Profile Builder
  Memory Kernel
    Task Working Memory
    Memory Filesystem
    Metadata Index
    Safe Content Loader
    Storage Backend Abstraction
    Memory Graph
    Source / Relation / Cognitive Mass / Causal Ledger
  Policy & Privacy
    Policy Engine
    Metadata Hard Gate
    Permission System
    Privacy Firewall
    Memory Immune System
    Security Sandbox
    Audit Log
  Context Intelligence
    Candidate Retrieval
    Context Package Generator
    Context Preflight / Thought Experiment
    Failure Forecast
    Context Compiler
    Context Decision Explanation
  Execution Control
    Executive Constraints
    Model Adapter
    Tool Adapter
    Agent Runtime Bridge
        |
        v
Model Adapter / Driver
  OpenAI / Claude / Gemini / Llama / Codex / Cursor / Robot / ERP
        |
        v
AI Model / Agent Runtime
        |
        v
Tool / Codebase / ERP / Device / Repo / Data System
        |
        v
Outcome Observer
  Result / Diff / Logs / Tests / User Feedback
        |
        v
Learning Layer
  Lesson Extractor -> Lesson Inbox -> Approve/Reject
  Consolidation -> Forgetting -> Offline Reflection
  Scheduler / Daemon Runtime
        |
        v
Evaluation & Governance
  Metrics / Explainability / Conflict Resolver / Spec Compliance / Adapter Governance / Plugin Governance
```

## 4. End-to-End Motion Flow

This is the canonical motion of the system. If a module is skipped, the audit log must say why.

| # | Step | Input | Process | Output | Schema | Owner module | Failure case | Log/debug |
|---|---|---|---|---|---|---|---|---|
| 1 | User enters task | raw input | capture request | raw task event | `Task` | Interface | prompt contains secret | hash input, redact raw if sensitive |
| 2 | Create Context Request | user/project/agent/input | normalize request | `ContextRequest` | `Task` | API/SDK/CLI | missing project | request validation event |
| 3 | Parse Intent | input | classify type, target, action, risk | `TaskIntent` | `TaskIntent` | Intent Parser | wrong intent | intent score trace |
| 4 | Observer Frame | user, role, agent, project | define frame of reference | `ObserverFrame` | `ObserverFrame` | Observer Engine | role unknown | role unknown warning |
| 5 | Attention Focus | intent, observer | focus/ignore domains | `AttentionFocus` | `AttentionFocus` | Attention Router | noisy focus | selected/ignored reasons |
| 6 | Write Working Memory | task state | store temporary assumptions | `WorkingMemoryItem[]` | `WorkingMemoryItem` | Working Memory | temp data persists | TTL and cleanup event |
| 7 | Mount Memory Filesystem | project/user/agent | open logical memory tree | `MemoryMount` | `MemoryFilesystemPath` | Memory FS | wrong namespace | mount path trace |
| 8 | Retrieve Memory Metadata | focus, paths | read metadata only, not raw content | metadata candidates | `MemoryObject` metadata | Metadata Index | raw content read too early | metadata read trace |
| 9 | Hard Gate Metadata | metadata, observer, policy | block `secret`, `do_not_prompt`, wrong project, unauthorized role, deprecated-as-truth | allowed metadata and blocked metadata | `PolicyDecision`, `BlockedMemory` | Policy Engine | high score bypasses policy | hard-gate audit |
| 10 | Validate Spacetime & Evidence | allowed metadata, now, context frame | check active/deprecated/expired, source, cause, confidence | valid metadata | `MemoryObject`, `CausalLedgerEntry` | Spacetime Index + Causal Ledger | stale or unsourced memory used | validity/evidence audit |
| 11 | Fetch Allowed/Summarized Content | valid metadata, observer | read raw only when allowed; summarize sensitive content | policy-safe memory content | `MemoryObject`, `PolicyDecision` | Safe Content Loader | blocked raw memory enters hot path | content access audit |
| 12 | Score Cognitive Mass & Rank | policy-safe memories | score impact, salience, relevance | ranked memories | `CognitiveMassScore` | Ranking | raw secret ranked or boosted | mass factor trace |
| 13 | Detect Risk Signals | intent, ranked safe memory, observer | detect privacy/permission/stale/destructive risk | `RiskSignal[]` | `RiskSignal` | Risk Detector | risk missed | risk rule trace |
| 14 | Generate Context Candidates | policy-safe memories, intent | create keyword/intent/role/lesson/minimal/hybrid packages | `ContextPackageCandidate[]` | `ContextPackageCandidate` | Context Generator | unsafe package includes blocked memory | candidate build log |
| 15 | Run Preflight / Thought Experiment | policy-safe candidates, risks | simulate package consequences | `PreflightRun` | `PreflightRun` | Preflight Engine | preflight sees unsafe raw memory | preflight scenario trace |
| 16 | Predict Failure Modes | package, task | forecast failure modes | `PredictedFailure[]` | `PredictedFailure` | Failure Forecast | misses permission escalation | failure template log |
| 17 | Score Packages | candidates, predictions | compute final score with hard blockers | ranked candidates | `ContextPackageCandidate` | Package Scorer | noisy package wins | formula breakdown |
| 18 | Select Best Package | ranked packages | choose safest actionable package | selected candidate | `PreflightRun` | Preflight Engine | unsafe override | selection reason |
| 19 | Compile Final Context | selected policy-safe package | format model-ready context, constraints, blocked summaries only | `ContextPackage` | `ContextPackage` | Context Compiler | compiler receives blocked raw memory | token manifest |
| 20 | Generate Constraints | intent, risk, lessons | create must/advisory/blocker constraints | `ExecutiveConstraint[]` | `ExecutiveConstraint` | Executive Control | missing guardrail | constraint source trace |
| 21 | Egress Scan and Send to Adapter Through Sandbox | context, constraints, adapter manifest | scan final context, validate manifest scope, translate payload | `ContextEgressScan`, `ModelAdapterRun`, `SandboxRun` | `ContextEgressScan`, `ModelAdapterRun`, `SandboxRun` | Egress Scanner + Adapter Layer + Sandbox | compiler leak or adapter/plugin bypasses policy | egress/sandbox/manifest audit |
| 22 | Model/Agent executes | payload | model/tool action | result | `ModelAdapterRun`, `ToolRun` | Agent Runtime | unsafe tool use | tool permission audit |
| 23 | Observe Outcome | result, files, tests, feedback | summarize action and result | `TaskOutcome` | `TaskOutcome` | Outcome Observer | no outcome captured | outcome event |
| 24 | Compare Prediction | outcome, predicted failures | match/miss predictions | comparison report | `TaskOutcome` | Error Correction | predictions never checked | prediction match log |
| 25 | Extract Lesson | outcome | propose lessons | `Lesson[]` | `Lesson` | Lesson Extractor | generic lesson spam | lesson source trace |
| 26 | Lesson Inbox | lessons | queue for review | pending lessons | `Lesson` | Lesson Inbox | auto-trust unapproved lesson | pending state audit |
| 27 | Approve/Reject | reviewer action | promote or reject | memory or rejected lesson | `Lesson`, `MemoryObject` | Review UI/CLI | poisoned lesson approved | approval audit |
| 28 | Consolidate Memory | approved lessons, graph | async merge/update durable memory | `ConsolidationRun` | `ConsolidationRun` | Consolidation Engine | duplicate memory grows | merge proposal log |
| 29 | Deprecate/Forget & Eval | outdated memory, task/eval data | async decay/archive and metric update | updated memory, `EvaluationRun` | `MemoryObject`, `EvaluationRun` | Forgetting Engine + Eval Harness | useful memory removed or vanity metrics | deprecation and metric trace |
| 30 | Write Audit Log & Queue Async Jobs | all events, async work | append immutable audit; queue reflection/eval/consolidation jobs | `AuditLog`, `SchedulerJob` | `AuditLog`, `SchedulerJob` | Audit Logger + Scheduler | incomplete trace or hot-path reflection | audit completeness score |

Cross-cutting backbone services:

| Service | Runs across steps | Input | Output | Debug artifact |
|---|---|---|---|---|
| Kernel Orchestrator | 1-30 | context request, current step state | `KernelRun` with step statuses | pipeline trace |
| Policy Engine | 7-21 | observer, memory, adapter/tool request | allow/summarize/block decision | policy decision log |
| Causal Ledger | 8-28 | memory source/outcome/relation | evidence chain | provenance trace |
| Conflict Resolver | 8-28 | memory graph, contradictions | conflict report or deprecation proposal | conflict diff |
| Explanation Engine | 3-30 | traces, rankings, policy blocks | context decision explanation | explanation JSON |
| Storage Backend | 6-30 | logical FS ops | persisted records | storage operation log |
| Scheduler / Daemon | 27-29 plus background | job config, project state | reflection/eval/consolidation runs | daemon job log |
| Security Sandbox | 13-21 and plugins | hook payload, adapter/tool call | scoped execution result | sandbox audit |
| Spec Compliance | all external contracts | object schemas, adapter/plugin manifests | validation report | compatibility report |

### 4.1 Hot Path vs Async Path

The optimized architecture splits the kernel into a latency-sensitive hot path and a learning/maintenance async path.

Hot path, before model action:

```text
Context Request
  -> Intent Parser
  -> Observer Frame
  -> Attention Focus
  -> Scoped Memory Mount
  -> Metadata Retrieval
  -> Hard Permission / Privacy / Lifecycle Gate
  -> Spacetime + Causal Validation
  -> Safe Content Fetch / Summarization
  -> Cognitive Mass Ranking
  -> Risk Detector
  -> Context Candidate Generation
  -> Context Preflight
  -> Failure Forecast
  -> Context Compiler
  -> Executive Constraints
  -> Sandboxed Adapter Call
  -> Audit Log
```

Async path, after task or background:

```text
Outcome Observer
  -> Prediction vs Outcome Comparison
  -> Lesson Extractor
  -> Lesson Inbox
  -> Approve / Reject
  -> Memory Consolidation
  -> Forgetting / Decay
  -> Offline Reflection
  -> Evaluation Metrics
  -> Conflict Resolver
  -> Audit Log
```

MVP rule: hot path can queue async jobs, but it must not run broad offline reflection, graph cleanup, or full evaluation suites inline.

### 4.2 LMTI Self-Check Optimization Findings

This section comes from running local LMTI context over this architecture and checking the current `packages/privacy`, `packages/memory`, `packages/kernel`, and `packages/cli` surfaces. These are implementation pressure points that should be fixed before the kernel is treated as optimized.

| Finding | Current risk | Optimization | Priority |
|---|---|---|---|
| Memory records mix metadata and content | a future search path can accidentally score or pass raw restricted content | split `MemoryMetadata` from `MemoryContentBlob`; hot path reads metadata first | MVP |
| Context search can score before sanitize | high-relevance restricted memory can influence ranking before hard gate | gate metadata first, then rank only allowed/summarized memory | MVP |
| `includeSecret` is ambiguous | local owner inspection can be confused with model context export | split flags into `includeSecretForLocalInspection` and forbid `includeSecretForModelContext` | MVP |
| Effective recipient role is missing | developer using an external model may receive developer-level context even though the sink is external | compute `effectiveContextRole = min(observerRole, sinkRole(modelTarget))` | MVP |
| Decay can run in context search | hot path may perform writes and cleanup before model action | replace with read-only expiration check; queue decay job | MVP |
| Audit only logs sensitive decisions | explanation/debug cannot reconstruct why ordinary memory was selected or ignored | write context decision audit for selected, rejected, summarized, and blocked memory | MVP |
| `memoryToContext` accepts generic search results | unsanitized memory can reach context through type misuse | introduce `PolicySafeMemoryResult` type; `ContextPackage` only accepts that type | MVP |
| Protected AMF and risk evidence need sink policy | `includeSecret` can expose protected evidence in context-like output | protected evidence requires local inspect mode and never model-bound preflight | MVP |
| Adapter call has no final egress scan in the spec | compiler bug could still leak secrets to adapter | run final egress scanner after compile and before adapter call | MVP |
| Policy decisions lack version pinning | audit cannot reproduce old decisions after policy changes | include `policyVersion`, `memoryVersion`, `memoryIndexChecksum` in every decision | V1 |
| No context package cache boundary | repeated preflights recompute stable results | cache by task intent, observer, policy version, memory checksum, token budget | V1 |
| Vector/embedding path can leak sensitive semantics | embeddings of raw sensitive content can become irreversible leakage | embed summaries/metadata only; never raw sensitive/secret content | V1 |
| Lesson/consolidation race risk | approved lessons and reflection jobs can overwrite each other | optimistic concurrency on memory version and consolidation run id | V1 |
| Numeric score can hide blockers | a blocked memory might be represented as low score instead of impossible | use structural `blocked: true` hard blockers, not score penalties | MVP |
| Dashboard could show audit internals | explanation view may leak redacted evidence refs or secret metadata | dashboard consumes `ContextDecisionExplanation`, not raw `AuditLog`, unless auditor role | MVP |

Optimized sink model:

```text
observer role = who asks
sink role = where context goes
effective context role = most restrictive(observer role, sink role)

Examples:
  developer + local CLI inspect -> developer
  developer + external model -> external_model
  owner + dashboard audit -> owner/auditor
  owner + model preflight -> external_model unless model is trusted local
```

Optimized context boundary:

```text
MemoryMetadata
  -> hard gate
  -> SafeMemoryContent
  -> PolicySafeMemoryResult
  -> ContextPackageCandidate
  -> Preflight
  -> ContextPackage
  -> Egress Secret Scan
  -> Adapter Payload
```

## 5. Layered Architecture

| Layer | Mission | Submodules | Input/Output | Schema | API | MVP scope | V1/V2 scope |
|---|---|---|---|---|---|---|---|
| 1. Interface | Expose kernel to humans/systems | API, SDK, CLI, dashboard, adapter input, Kernel Orchestrator entrypoint | task -> context request | `Task`, `ContextRequest`, `KernelRun` | `preflight`, `memory`, `lesson`, `eval`, `startKernelRun` | CLI + TS SDK local | server + dashboard + REST |
| 2. Task Intelligence | Understand task and observer | Intent Parser, Observer Frame, Effective Context Role, Attention Router, Risk Profile Builder | input -> intent/focus | `TaskIntent`, `ObserverFrame`, `AttentionFocus` | `parseIntent`, `deriveEffectiveContextRole`, `createObserverFrame`, `createAttentionFocus` | deterministic rules | learned classifiers, richer observer |
| 3. Memory Kernel | Store structured knowledge | Memory FS, Metadata Index, Safe Content Loader, Storage Backend, graph, working memory, long-term memory, source/relation, cognitive mass, Causal Ledger | focus -> policy-safe memory | `MemoryObject`, `MemoryMetadata`, `MemoryContentBlob`, `PolicySafeMemoryResult`, `MemorySource`, `MemoryRelation`, `CognitiveMassScore`, `CausalLedgerEntry`, `StorageBackendConfig` | `mountMemoryFilesystem`, `retrieveMemoryMetadata`, `hardGateMemoryMetadata`, `fetchAllowedMemoryContent`, `rankMemory`, `traceMemoryCause`, `openStorageBackend` | local JSON memory tree | SQLite/Postgres, graph index |
| 4. Policy & Privacy | Enforce access before prompts | Policy Engine, Permission System, Privacy Firewall, Immune System, Security Sandbox, Audit Log | candidates -> allowed/blocked | `MemoryPermission`, `PolicyRule`, `RiskSignal`, `SandboxRun`, `AuditLog` | `loadPolicy`, `enforcePolicy`, `runSandboxedExtension`, `writeAuditLog` | tag policy | policy editor, compliance |
| 5. Context Intelligence | Build safe context | retrieval, ranking, anti-pollution, preflight, forecast, compiler, Context Decision Explanation | allowed memory -> final context | `ContextCandidate`, `PreflightRun`, `ContextPackage`, `ContextDecisionExplanation` | `generateContextCandidates`, `runContextPreflight`, `compileContext`, `explainContextDecision` | 6 package strategies | adaptive scoring, simulations |
| 6. Execution Control | Bound action and connect adapters | Executive Constraints, Egress Scanner, Model Adapter, Tool Adapter, Agent Runtime Bridge, Adapter Governance | context -> adapter payload | `ExecutiveConstraint`, `ContextEgressScan`, `ModelAdapterRun`, `ToolRun`, `AdapterManifest` | `generateExecutiveConstraints`, `runEgressSecretScan`, `callModelAdapter`, `validateAdapterContract` | Codex/local adapter | multi-model/tool drivers |
| 7. Learning | Convert outcomes into approved memory | Outcome Observer, Lesson Extractor, Lesson Inbox, Success/Negative Lesson, Consolidation, Forgetting, Reflection, Scheduler/Daemon | outcome -> approved memory | `TaskOutcome`, `Lesson`, `ConsolidationRun`, `OfflineReflectionRun`, `SchedulerJob` | `observeOutcome`, `extractLesson`, `approveLesson`, `runOfflineReflection`, `runDaemonTick` | manual lesson approval | automated proposals, conflict resolver |
| 8. Evaluation & Governance | Measure and govern kernel behavior | Eval Harness, Metrics, Explainability, Conflict Resolver, Spec Compliance, Plugin Governance | runs -> metrics/explanations | `EvaluationCase`, `EvaluationRun`, `MemoryConflict`, `SpecComplianceReport`, `PluginManifest` | `evaluateAgent`, `explainContextDecision`, `validateSpecContract`, `validatePluginPermissions` | fixture eval | CI, plugin compliance |

## 6. Kernel Primitives

| Primitive | Purpose | Input | Output | Side effects | Error cases | Metric | MVP version |
|---|---|---|---|---|---|---|---|
| `parseIntent()` | classify task | input, projectId, userId | `TaskIntent` | stores intent trace | unknown/low confidence | `intent_accuracy` | rules |
| `deriveEffectiveContextRole()` | compute restrictive sink role | observer role, modelTarget, destination | effective role | role decision audit | external model receives internal role | `effective_role_correctness` | sink role table |
| `createObserverFrame()` | define role/project/agent frame | user, role, agent, project | `ObserverFrame` | role audit | missing role | `observer_context_accuracy` | explicit role |
| `createAttentionFocus()` | choose focus/ignore | intent, observer | `AttentionFocus` | focus trace | noisy focus | `attention_accuracy` | weighted keywords |
| `writeWorkingMemory()` | store task temp state | taskId, item | `WorkingMemoryItem` | writes TTL item | sensitive temp retention | `working_memory_cleanup_rate` | JSON TTL |
| `mountMemoryFilesystem()` | open logical memory tree | project/user/agent | mount | reads config | wrong mount | `mount_success_rate` | local files |
| `retrieveMemoryMetadata()` | retrieve candidates without raw content | focus, mount | metadata candidates | metadata read audit | raw content read too early | `metadata_gate_coverage` | metadata index |
| `hardGateMemoryMetadata()` | fail restricted memory before scoring | metadata, observer, policy | allowed/blocked metadata | hard-gate audit | high relevance bypasses policy | `hard_gate_block_rate` | deny-by-default tags |
| `fetchAllowedMemoryContent()` | read only allowed/summarized content | allowed metadata, observer | safe memory content | content access audit | blocked raw content read | `blocked_raw_fetch_rate` | policy-safe loader |
| `readMemory()` | read by path/id | ref, observer | memory/block | read audit | unauthorized read | `unauthorized_memory_access_rate` | permission check |
| `writeMemory()` | write draft/approved memory | memory draft | memory | write audit | missing source/tag | `memory_validation_failure_rate` | schema validation |
| `rankMemory()` | rank policy-safe candidates | policy-safe memory, intent, observer | ranked memory | ranking trace | raw secret ranked | `context_precision_at_k` | relevance + mass |
| `validateMemorySpacetime()` | reject stale memory | memory, now, context frame | valid/invalid | validity audit | stale active | `temporal_context_accuracy` | date/status check |
| `calculateCognitiveMass()` | score memory impact | memory | mass score | score trace | scary memory overboost | `cognitive_mass_precision` | fixed weights |
| `enforcePolicy()` | allow/summarize/block | memory, observer, policy | policy result | privacy audit | secret leak | `secret_block_rate` | tag matrix |
| `detectRiskSignals()` | detect task risk | intent, memory, role | risks | risk trace | missed risk | `risk_detection_precision` | rule catalog |
| `generateContextCandidates()` | build package options | allowed memory, focus | candidates | package trace | missing minimal safe | `candidate_coverage_rate` | 6 strategies |
| `runContextPreflight()` | simulate packages | candidates, risks | preflight | preflight audit | false prediction | `preflight_prediction_accuracy` | template simulation |
| `predictFailure()` | forecast failures | package, task | failures | prediction trace | failure missed | `prevented_failure_rate` | failure mode catalog |
| `scoreContextPackage()` | choose package | candidate, predictions | score | score trace | noise wins | `wrong_context_rate` | formula |
| `compileContext()` | make model-ready context | selected, constraints | final context | token manifest | prompt bloat | `context_token_efficiency` | JSON/text |
| `runEgressSecretScan()` | final leak check before adapter | context package, adapter target | pass/fail + findings | egress audit | compiler leak reaches adapter | `egress_leak_block_rate` | pattern scanner |
| `generateExecutiveConstraints()` | bound agent action | intent, risks, lessons | constraints | constraint audit | weak constraints | `constraint_violation_rate` | rule templates |
| `callModelAdapter()` | call target driver | context, constraints | adapter run | adapter audit | adapter drops constraints | `adapter_contract_success_rate` | Codex/local |
| `observeOutcome()` | record result | preflightId, result, files, tests | outcome | outcome event | no outcome | `outcome_capture_rate` | CLI/manual |
| `extractLesson()` | propose learning | outcome | lessons | lesson drafts | generic lesson | `lesson_precision` | heuristic |
| `approveLesson()` | promote lesson | lessonId, reviewer | memory | approval audit | poisoned lesson | `lesson_acceptance_rate` | manual |
| `rejectLesson()` | reject lesson | lessonId, reason | rejected lesson | rejection audit | lost useful lesson | `lesson_rejection_quality` | manual |
| `consolidateMemory()` | merge durable learning | projectId | consolidation run | merge proposals | duplicate/stale growth | `duplicate_memory_reduction` | dry-run |
| `forgetMemory()` | deprecate/archive | memoryId, reason | updated memory | deprecation audit | hard delete loss | `deprecated_memory_usage_rate` | mark status |
| `runOfflineReflection()` | periodic cleanup | projectId | reflection run | reflection report | unsafe auto-merge | `memory_decay_quality` | dry-run only |
| `evaluateAgent()` | compare modes | eval case/suite | eval run | metric records | weak eval | `model_agnostic_transfer_score` | fixtures |
| `explainContextDecision()` | explain context | preflightId | explanation | explanation read audit | missing trace | `explainability_completeness` | trace formatter |
| `writeAuditLog()` | append event | event | audit id | append-only write | missing sensitive event | `audit_completeness` | JSONL |
| `startKernelRun()` | orchestrate full pipeline | context request | `KernelRun` | creates step graph | hidden shortcut | `kernel_step_completion_rate` | deterministic pipeline |
| `loadPolicy()` | load active permission rules | projectId, role | policy set | policy read audit | stale policy | `policy_load_success_rate` | JSON policy |
| `evaluatePolicyDecision()` | explain allow/block | observer, memory, action | decision | policy audit | wrong allow | `policy_decision_accuracy` | tag matrix |
| `traceMemoryCause()` | prove source/cause | memoryId | causal chain | provenance read audit | unsourced memory | `evidence_backed_context_rate` | source chain |
| `validateMemoryEvidence()` | fail closed on weak memory | memoryId | valid/missing evidence | evidence audit | hallucinated memory | `unsourced_memory_usage_rate` | required source fields |
| `resolveMemoryConflict()` | handle contradictions | conflict id/memory ids | resolution proposal | conflict audit | false merge | `contradiction_resolution_rate` | dry-run proposals |
| `openStorageBackend()` | decouple storage | backend config | storage handle | storage init audit | backend leaks data | `storage_backend_success_rate` | local file backend |
| `validateAdapterContract()` | keep adapters honest | adapter manifest | validation report | adapter audit | adapter drops constraints | `adapter_contract_success_rate` | manifest check |
| `validatePluginPermissions()` | enforce plugin scopes | plugin manifest, requested scopes | permission report | plugin audit | plugin bypass | `plugin_policy_violation_rate` | deny unknown scopes |
| `runSandboxedExtension()` | isolate plugin/tool hook | hook payload, sandbox policy | hook result | sandbox audit | memory exfiltration | `sandbox_escape_rate` | no network, scoped payload |
| `runDaemonTick()` | run scheduled jobs | job id/project id | job result | daemon log | unsafe auto-apply | `daemon_job_success_rate` | manual dry-run |
| `validateSpecContract()` | enforce open spec compatibility | object/manifest/schema | compliance report | spec audit | version drift | `spec_compliance_rate` | JSON schema validation |

## 7. Data Architecture

Schema rules:

* Every durable object has `id`, `createdAt`, `updatedAt`, `source`, `confidence`, and privacy fields where relevant.
* Every memory-like object has lifecycle state.
* Every prompt-facing object has an audit link.

| Schema | Fields | Relations | Indexes | Lifecycle | Privacy consideration |
|---|---|---|---|---|---|
| `User` | `id`, `displayName`, `roles`, `preferencesRef` | projects, agents | `id` | active/disabled | PII summarized for models |
| `Project` | `id`, `name`, `root`, `identity`, `policyId` | tasks, memory | `id`, `rootHash` | active/archived | project boundary required |
| `Agent` | `id`, `kind`, `adapterId`, `selfModelRef` | tasks, outcomes | `id`, `kind` | active/disabled | adapter cannot bypass policy |
| `ObserverFrame` | `id`, `taskId`, `userId`, `role`, `effectiveContextRole`, `sinkRole`, `agentId`, `projectId`, `modelTarget` | task, preflight | `taskId`, `role`, `effectiveContextRole` | per task | effective role controls model-visible context |
| `Task` | `id`, `inputHash`, `projectId`, `userId`, `agentId`, `status` | intent, outcome | `projectId`, `status` | open/done/archived | raw input redacted if sensitive |
| `TaskIntent` | `taskType`, `targetArea`, `entity`, `actionNeeded`, `riskLevel`, `confidence` | task | `taskId`, `taskType` | immutable per parse | no raw secrets |
| `AttentionFocus` | `focusOn`, `ignore`, `memoryDomains`, `maxTokens`, `confidence` | task | `taskId` | per preflight | ignored secret metadata only |
| `WorkingMemoryItem` | `taskId`, `kind`, `content`, `sensitivity`, `expiresAt` | task | `taskId`, `expiresAt` | TTL/cleared | sensitive temp must expire |
| `MemoryObject` | `path`, `type`, `content`, `summary`, `source`, `confidence`, `cognitiveMass`, `tags`, `permissions`, `validFrom`, `validUntil`, `status` | source, tags, relations | `path`, `projectId`, `status`, `tags` | pending/active/deprecated/expired/rejected | secret never raw inject |
| `MemoryMetadata` | `memoryId`, `path`, `type`, `projectId`, `userId`, `agentId`, `tags`, `status`, `validFrom`, `validUntil`, `sourceRef`, `confidence`, `summaryHash` | memory object | `path`, `projectId`, `tags`, `status` | mirrors memory lifecycle | excludes raw content by design |
| `MemoryContentBlob` | `memoryId`, `contentRef`, `contentHash`, `encryptionState`, `sensitivity`, `storageBackendId` | memory metadata | `memoryId`, `contentHash` | active/deprecated/expired | content loaded only after policy gate |
| `MetadataGateResult` | `taskId`, `allowedMemoryIds`, `blockedMemoryIds`, `policyDecisionIds`, `gateReasons` | metadata, policy decisions | `taskId`, `blockedMemoryIds` | immutable per preflight | safe reasons only, no raw blocked content |
| `SafeMemoryContent` | `memoryId`, `contentMode`, `safeContent`, `summary`, `policyDecisionId`, `redactionLevel` | memory object, policy decision | `memoryId`, `contentMode` | per preflight | raw only if explicitly allowed |
| `PolicySafeMemoryResult` | `memoryId`, `metadata`, `safeContent`, `policyDecisionId`, `mode`, `scoreInputs` | gate result, safe content | `memoryId`, `policyDecisionId` | per preflight | only type accepted by preflight/compiler |
| `MemoryFilesystemPath` | `path`, `scope`, `allowedTypes`, `defaultPermission` | memory | `path` | versioned | path controls boundary |
| `MemorySource` | `sourceType`, `sourceRef`, `hash`, `trustLevel` | memory | `sourceType`, `hash` | active/stale | sensitive source refs redacted |
| `MemoryRelation` | `from`, `to`, `relation`, `confidence` | memories | `from`, `to` | active/deprecated | relation may reveal sensitive link |
| `MemoryTag` | `name`, `category`, `description` | memory | `name` | active | unknown tags deny by default |
| `MemoryPermission` | `readRoles`, `writeRoles`, `injectPolicy`, `promptPolicy` | memory/policy | `memoryId` | active/versioned | kernel-enforced |
| `CognitiveMassScore` | `memoryId`, `securityImpact`, `permissionImpact`, `priorFailureImpact`, `total` | memory | `memoryId`, `total` | recalculated | privacy cap applies |
| `RiskSignal` | `kind`, `severity`, `evidenceRefs`, `mitigation` | task/preflight | `taskId`, `kind` | per preflight | raw evidence may be blocked |
| `ContextCandidate` | `strategy`, `memoryIds`, `blockedIds`, `score`, `tokenEstimate` | task | `taskId`, `strategy` | per preflight | no blocked raw content |
| `ContextPackageCandidate` | `candidateId`, `included`, `summary`, `risks`, `predictions` | preflight | `preflightId` | per preflight | safe summaries only |
| `PreflightRun` | `taskId`, `candidateIds`, `selectedId`, `riskIds`, `metrics` | task | `taskId`, `selectedId` | immutable | audit-safe trace |
| `PredictedFailure` | `mode`, `probability`, `impact`, `mitigation` | candidate/preflight | `candidateId`, `mode` | per preflight | avoid exploit details |
| `ContextPackage` | `system`, `messages`, `constraints`, `blockedSummary`, `tokenEstimate` | preflight | `preflightId` | immutable | model-facing only after policy |
| `ContextEgressScan` | `contextPackageId`, `adapterId`, `status`, `findings`, `blocked`, `auditId` | context package, adapter | `contextPackageId`, `status` | immutable | findings redacted for dashboard |
| `ContextCacheEntry` | `cacheKey`, `taskIntentHash`, `observerHash`, `policyVersion`, `memoryIndexChecksum`, `tokenBudget`, `contextPackageId`, `expiresAt` | preflight/context package | `cacheKey`, `expiresAt` | active/expired | never cache raw blocked memory |
| `ExecutiveConstraint` | `severity`, `text`, `sourceRiskIds`, `ack` | task/adapter | `taskId`, `severity` | per run | may include sensitive summary |
| `ModelAdapterRun` | `adapterId`, `modelTarget`, `payloadHash`, `status` | task/outcome | `taskId`, `adapterId` | started/completed/failed | never log raw secret payload |
| `ToolRun` | `toolId`, `permission`, `inputHash`, `status` | task/outcome | `taskId`, `toolId` | per tool call | tool inputs redacted |
| `TaskOutcome` | `actionsTaken`, `filesTouched`, `testsRun`, `result`, `constraintViolations`, `feedback` | task/lessons | `taskId`, `result` | final | summarize sensitive failures |
| `Lesson` | `type`, `text`, `sourceIds`, `confidence`, `status`, `privacy` | outcome/memory | `projectId`, `status` | proposed/approved/rejected | pending not truth |
| `SuccessPattern` | `workflow`, `evidenceOutcomeIds`, `impact` | memory | `projectId` | approved/deprecated | no over-personalization |
| `NegativeLesson` | `avoidPattern`, `saferAlternative`, `severity` | memory | `projectId`, `severity` | approved/deprecated | neutral wording |
| `MemoryConflict` | `memoryIds`, `type`, `evidence`, `recommendedAction`, `status` | memory/reflection | `projectId`, `status` | open/resolved | conflict evidence may be sensitive |
| `ConsolidationRun` | `lessonIds`, `proposedMemoryIds`, `mergedIds`, `status` | memory | `projectId`, `status` | proposed/applied | human approval for applies |
| `OfflineReflectionRun` | `merged`, `deprecated`, `compressed`, `conflicts`, `status` | memory | `projectId`, `createdAt` | dry-run/applied | dry-run default |
| `EvaluationCase` | `input`, `memoryPool`, `expected`, `metrics` | eval runs | `projectId`, `name` | active/versioned | synthetic secrets only |
| `EvaluationRun` | `caseId`, `baseline`, `ordinaryMemory`, `lmti`, `metrics`, `passed` | eval case | `caseId`, `createdAt` | immutable | no real secrets |
| `AuditLog` | `eventType`, `actor`, `taskId`, `objectRef`, `decision`, `redactedDetails`, `createdAt` | all | `taskId`, `eventType`, `createdAt` | append-only | redact by role |
| `KernelRun` | `id`, `taskId`, `status`, `currentStep`, `stepResults`, `errorBoundary`, `startedAt`, `finishedAt` | task, audit, preflight | `taskId`, `status`, `startedAt` | running/completed/failed | never stores raw blocked content |
| `PolicyRule` | `id`, `projectId`, `scope`, `subjectRole`, `action`, `effect`, `condition`, `priority`, `version` | memory permission, adapter/tool policy | `projectId`, `scope`, `priority` | active/deprecated | deny unknown actions |
| `PolicyDecision` | `id`, `policyRuleIds`, `policyVersion`, `memoryVersion`, `memoryIndexChecksum`, `subject`, `action`, `resourceRef`, `effect`, `reason`, `auditId` | policy, audit | `resourceRef`, `effect`, `policyVersion` | immutable | safe reason only |
| `CausalLedgerEntry` | `id`, `memoryId`, `createdBy`, `createdFromTaskId`, `reason`, `outcomeId`, `evidenceSourceIds`, `confidence` | memory, outcome, source | `memoryId`, `createdFromTaskId` | active/superseded | evidence refs may be redacted |
| `ContextDecisionExplanation` | `id`, `preflightId`, `selectedReasons`, `rejectedReasons`, `blockedReasons`, `riskSummary`, `modelVisibleSummary` | preflight, audit | `preflightId` | immutable | blocked raw content excluded |
| `StorageBackendConfig` | `id`, `kind`, `rootOrDsnRef`, `encryption`, `status`, `capabilities` | memory FS | `kind`, `status` | active/disabled | DSN/keys stored as secret refs only |
| `SchedulerJob` | `id`, `projectId`, `jobType`, `schedule`, `mode`, `lastRunId`, `status` | reflection/eval/consolidation | `projectId`, `jobType`, `status` | active/paused | destructive jobs dry-run by default |
| `SandboxRun` | `id`, `pluginId`, `hookName`, `allowedScopes`, `network`, `filesystem`, `status`, `auditId` | plugin/tool runs | `pluginId`, `hookName`, `status` | immutable | payload minimized by policy |
| `AdapterManifest` | `id`, `name`, `version`, `target`, `capabilities`, `requiredScopes`, `contractVersion` | adapters | `name`, `version` | installed/disabled | adapters cannot request raw secrets by default |
| `PluginManifest` | `id`, `name`, `version`, `permissions`, `hooks`, `sandbox`, `contractVersion` | plugins | `name`, `version` | installed/disabled | deny unknown scopes/hooks |
| `SpecComplianceReport` | `id`, `subjectType`, `subjectId`, `specVersion`, `status`, `findings` | adapters/plugins/objects | `subjectType`, `status` | immutable | findings redact sensitive config |

## 8. Memory Filesystem

| Path | Purpose | Memory type | Read/write | Inject when | Block when | Example |
|---|---|---|---|---|---|---|
| `/users/{userId}/preferences` | explicit user preferences | user_preference | read owner/agent; write owner | tone/artifact matters | external no need | "nói thẳng, không văn mẫu" |
| `/users/{userId}/operating-profile` | collaboration profile | user_profile | read trusted; write owner | summarized for continuity | sensitive personal info | "prefers product-first docs" |
| `/projects/{projectId}/identity` | mission/scope | project_identity | project roles; maintainer write | most project tasks | wrong project | "AI Cognitive Kernel" |
| `/projects/{projectId}/decisions` | decisions and ADRs | decision | project roles; maintainer write | architecture tasks | deprecated | "privacy before prompt" |
| `/projects/{projectId}/lessons` | approved lessons | lesson | project roles; approval write | matching task | pending/rejected | "403 may be correct" |
| `/projects/{projectId}/negative-lessons` | avoid patterns | negative_lesson | project roles; approval write | risk-related tasks | unrelated | "do not widen partner role" |
| `/projects/{projectId}/success-patterns` | reusable workflows | success_pattern | project roles; approval write | similar tasks | unmeasured | "hybrid package worked" |
| `/projects/{projectId}/bug-history` | known bug outcomes | bug | project roles; dev write draft | debug tasks | stale/unrelated | "partner 403 bug" |
| `/projects/{projectId}/permission-rules` | access rules | policy_memory | dev/maintainer read; maintainer write | route/role/API tasks | wrong project | "partner -> /partner" |
| `/projects/{projectId}/coding-conventions` | implementation style | technical_rule | project roles | code tasks | non-code task | "follow package boundaries" |
| `/projects/{projectId}/narrative` | product direction | narrative | project roles; maintainer write | strategy/architecture | external if sensitive | "kernel not app" |
| `/agents/{agentId}/self-model` | operational identity | agent_self_model | owner/agent; owner write | agent bootstrap | external no need | "security-first Codex" |
| `/agents/{agentId}/habits` | repeated workflows | habit | owner/agent; approved write | similar task | failed habit | "run eval after preflight" |
| `/policies/privacy` | privacy policy | policy | owner/maintainer/kernel | compiled as constraints | raw to model | "secret never raw" |
| `/policies/least-privilege` | permission safety | policy | project roles | security/permission tasks | never as safety summary | "verify role first" |
| `/tasks/{taskId}/working-memory` | temporary task state | working_memory | current task roles | current task only | expired/task complete | "role unknown" |
| `/archive/deprecated` | deprecated memory | archive | maintainer/auditor | conflict explanation only | normal truth | "old /dashboard partner route" |
| `/audit/context-decisions` | context audit | audit | owner/auditor | never by default | external model | "secret blocked" |
| `/eval/cases` | eval fixtures | eval_case | dev/maintainer | eval only | model context unless synthetic | "dashboard Agent lỗi case" |
| `/eval/runs` | eval results | eval_run | dev/maintainer | dashboard only | model context | metric logs |

## 9. Permission & Privacy

Permission matrix:

| Tag | Read | Write | Inject | Notes |
|---|---|---|---|---|
| `public` | any allowed project participant | maintainer/dev | if relevant | lowest restriction |
| `project` | matching project role | maintainer/dev | only matching project | cross-project block |
| `internal` | allowed role/agent | maintainer/dev | role-gated | default project memory |
| `sensitive` | owner/maintainer or justified role | owner/maintainer | summarize only when needed | never raw by default |
| `secret` | owner metadata only | owner | never raw | raw secret should not be stored if avoidable |
| `do_not_prompt` | metadata only | owner/maintainer | never | absolute prompt block |
| `deprecated` | maintainer/audit | kernel/reflection | conflict explanation only | not truth |
| `pending_review` | reviewers | lesson system | never as official truth | approval required |

Policy evaluation flow:

```text
candidate memory
  -> project boundary check
  -> role/agent read check
  -> lifecycle check
  -> tag policy check
  -> prompt policy check
  -> relevance justification
  -> allow | summarize | block
  -> audit event
```

Blocked memory format:

```ts
interface BlockedMemory {
  memoryId: string;
  path: string;
  blockReason:
    | "wrong_project"
    | "unauthorized_role"
    | "secret"
    | "do_not_prompt"
    | "deprecated"
    | "pending_review"
    | "low_relevance"
    | "stale"
    | "prompt_injection";
  safeSummary: string;
  policyId: string;
  auditId: string;
}
```

Privacy audit log:

```json
{
  "eventType": "memory.blocked",
  "taskId": "task-dashboard-agent-loi",
  "memoryId": "mem-secret-api-key",
  "decision": "block",
  "reason": "secret",
  "visibleToModel": false,
  "createdAt": "2026-06-28T00:00:00.000Z"
}
```

Audit vs explanation:

| Artifact | Purpose | Audience | Contains | Must not contain |
|---|---|---|---|---|
| `AuditLog` | internal truth log for security, governance, and debugging | kernel, owner, auditor | policy decisions, object refs, redacted evidence refs, step status | raw secrets in exported views |
| `ContextDecisionExplanation` | safe dashboard/user explanation | user, developer, dashboard | why selected/rejected/blocked, safe summaries, metrics | raw blocked memory, secret values, sensitive evidence |

Rule: every explanation is derived from audit, but not every audit field is explainable to every role.

Failure cases:

* Secret is selected by relevance but blocked by tag.
* Deprecated memory has high keyword match but blocked as truth.
* Sensitive memory needed for task is summarized, not raw.
* Internal memory for wrong project is blocked.
* Pending lesson is visible in inbox but not used as official context.

MVP implementation:

* Tag matrix in JSON policy.
* Deny unknown tags.
* Append-only JSONL audit.
* No hard delete; deprecate/archive first.

## 10. Context Preflight

Preflight is the core differentiator. It happens before the model acts.

Boundary rules:

* Preflight receives only `SafeMemoryContent`, safe summaries, constraints, risk signals, and blocked-memory metadata.
* Preflight never receives raw `secret`, raw `sensitive` without approval, `do_not_prompt`, wrong-project memory, unauthorized memory, or deprecated-as-truth memory.
* Package scoring runs after hard gates. A blocked item has no path back into the package through a high relevance score.
* Failure prediction may mention blocked memory as a safe reason, but never include blocked raw content.
* Context package candidates must carry `policyDecisionIds` so every included memory can be traced.

Candidate packages:

| Package | Purpose |
|---|---|
| Keyword Package | baseline keyword recall |
| Intent Package | task-intent-driven context |
| Role & Permission Package | permission-safe route/role context |
| Lesson Package | approved lessons and negative lessons |
| Minimal Safe Package | smallest context preserving safety rules |
| Hybrid Best Package | best scored blend |

Required failure modes:

| Failure mode | Meaning |
|---|---|
| `wrong_context_failure` | package focuses wrong domain |
| `privacy_leak_failure` | blocked/sensitive data may leak |
| `permission_escalation_failure` | agent may widen access wrongly |
| `irrelevant_memory_failure` | noisy memory distracts model |
| `repeated_bug_failure` | known bug pattern ignored |
| `hallucinated_fix_failure` | agent invents unsupported fix |
| `overengineering_failure` | package pushes excessive architecture |
| `destructive_code_change_failure` | agent may delete/rewrite broadly |
| `stale_memory_failure` | deprecated/expired memory used |
| `contradiction_failure` | conflicting memories unresolved |

Scoring:

```text
final_score =
task_relevance * w1
+ privacy_score * w2
+ role_safety_score * w3
+ lesson_coverage_score * w4
+ failure_prevention_score * w5
+ actionability_score * w6
- context_noise_penalty * p1
- contradiction_penalty * p2
- stale_memory_penalty * p3
```

MVP weights:

| Weight | Value | Reason |
|---|---:|---|
| `w1 task_relevance` | 0.25 | context must match task |
| `w2 privacy_score` | 0.20 | privacy is non-negotiable |
| `w3 role_safety_score` | 0.20 | permission bugs are high impact |
| `w4 lesson_coverage_score` | 0.15 | avoid repeated mistakes |
| `w5 failure_prevention_score` | 0.15 | preflight must prevent bad action |
| `w6 actionability_score` | 0.05 | context must help next action |
| `p1 context_noise_penalty` | 0.15 | noisy context hurts agents |
| `p2 contradiction_penalty` | 0.20 | contradictions need review |
| `p3 stale_memory_penalty` | 0.25 | stale memory is dangerous |

MVP rule: a package with secret raw injection or deprecated memory as truth receives a blocking score regardless of relevance.

Context Compiler contract:

```text
Input allowed:
  selected policy-safe ContextPackageCandidate
  SafeMemoryContent
  blocked memory safe summaries
  ExecutiveConstraint[]
  token budget

Input forbidden:
  raw blocked memory
  raw secret
  do_not_prompt content
  wrong-project memory
  unauthorized-role memory
  deprecated memory as truth
```

If forbidden input reaches the compiler, the kernel run fails closed and writes `context.compile.blocked_input` to the audit log.

## 11. Dashboard Architecture

| Screen | Purpose | Data displayed | User actions | Metric | MVP/Future |
|---|---|---|---|---|---|
| Kernel Overview | health of kernel | runs, errors, policy status | open run | preflight success rate | MVP |
| Cognitive Map | end-to-end flow | nodes from intent to lesson | inspect node | continuity score | MVP |
| Memory Filesystem Explorer | browse memory tree | paths, tags, state | add/deprecate | memory coverage | MVP |
| Intent Debugger | debug parse | intent, confidence, unknowns | relabel | intent accuracy | V1 |
| Attention Viewer | show focus/ignore | selected/rejected memories | mark wrong | attention accuracy | MVP |
| Working Memory Board | task state | assumptions, findings, TTL | clear/promote | cleanup rate | V1 |
| Permission Firewall | privacy blocks | block reasons, policies | edit policy | secret block rate | MVP |
| Context Preflight Battle | compare packages | package scores/failures | override with reason | prediction accuracy | MVP |
| Failure Forecast | inspect predicted failures | scenarios, mitigations | confirm/miss | prevented failure rate | V1 |
| Final Context Viewer | see model context | final package, tokens | copy/export safe context | token efficiency | MVP |
| Executive Constraints Panel | agent guardrails | constraints, ack | require ack | violation rate | MVP |
| Outcome Observer | actual result | actions, files, tests | mark quality | outcome capture rate | V1 |
| Lesson Inbox | review lessons | proposed lessons | approve/reject/edit | acceptance rate | MVP |
| Conflict Resolver | resolve memory conflicts | contradictory memories | merge/deprecate | resolution rate | V1 |
| Offline Reflection Center | memory cleanup | merge/deprecate proposals | run dry-run/apply | decay quality | V1 |
| Evaluation Lab | compare modes | baseline vs memory vs LMTI | run suite | transfer score | MVP |
| Audit Trail | immutable trace | policy/context/outcome logs | filter/export | audit completeness | MVP |
| Adapter Manager | drivers | adapter config/status | enable/test | adapter success | V2 |
| Plugin Registry | extensions | scopes, hooks, versions | install/disable | plugin violations | V2 |
| Agent Continuity Score | continuity health | score, misses | open issue | continuity score | V1 |

## 12. SDK / CLI / API

### A. TypeScript SDK

```ts
const lmti = new LMTI({
  projectId: "core-ai",
  userId: "phat",
  agentId: "codex-dev"
});

const preflight = await lmti.preflight({
  input: "dashboard Agent lỗi",
  role: "developer",
  modelTarget: "openai:gpt-5.5"
});

const result = await model.run({
  system: preflight.finalContextPackage.system,
  messages: preflight.finalContextPackage.messages,
  constraints: preflight.executiveConstraints
});

await lmti.observeOutcome({
  preflightId: preflight.preflightId,
  result,
  changedFiles: [],
  errors: [],
  userFeedback: "đúng hướng"
});
```

### B. CLI Commands

| Command | Purpose | MVP output |
|---|---|---|
| `lmti init` | bootstrap local kernel | created config/memory folders |
| `lmti project create` | create project identity | project id |
| `lmti memory add` | add memory with tags/source | memory id |
| `lmti memory list` | list metadata | table |
| `lmti memory explain` | explain source/permission/rank | explanation |
| `lmti preflight "dashboard Agent lỗi"` | run context syscall | context package + constraints |
| `lmti lesson inbox` | show pending lessons | lesson table |
| `lmti lesson approve` | promote lesson | memory id |
| `lmti lesson reject` | reject lesson | rejected state |
| `lmti policy check` | validate policy | findings |
| `lmti eval run` | run eval suite | metrics |
| `lmti reflection run` | run memory cleanup dry-run | reflection report |
| `lmti doctor` | check installation | health report |

### C. REST / RPC API

| Area | Endpoint examples |
|---|---|
| project | `POST /projects`, `GET /projects/:id` |
| memory | `POST /memory`, `GET /memory`, `GET /memory/:id/explain`, `POST /memory/:id/forget` |
| policy | `GET /policy`, `POST /policy/check`, `POST /policy/evaluate` |
| preflight | `POST /preflight`, `GET /preflight/:id`, `GET /preflight/:id/explain` |
| lesson | `GET /lessons/inbox`, `POST /lessons/:id/approve`, `POST /lessons/:id/reject` |
| evaluation | `POST /eval/run`, `GET /eval/runs/:id` |
| audit | `GET /audit`, `GET /audit/:taskId` |
| adapter | `GET /adapters`, `POST /adapters/:id/test` |
| plugin | `GET /plugins`, `POST /plugins/install`, `POST /plugins/:id/disable` |

## 13. Adapter & Plugin

Adapters are drivers. They translate kernel contracts to external systems but cannot override policy.

Hard boundary:

* Adapter/plugin code cannot import or call the storage backend directly.
* Adapter/plugin code receives only scoped hook payloads produced by the kernel.
* Every adapter/plugin must declare a manifest, version, hook list, and permission scopes.
* Unknown scopes are denied.
* Network access is off by default for plugins.
* Every adapter/plugin call writes a `SandboxRun` or adapter audit event.

Required adapters:

| Adapter | MVP role |
|---|---|
| OpenAI | compile model payload |
| Claude | compile message payload |
| Gemini | compile model payload |
| Llama/local | local model payload |
| Codex | coding-agent preflight |
| Cursor | IDE task bridge |
| VS Code | command palette + panel |
| GitHub | issue/PR metadata and outcome |
| GitLab | MR/issue metadata |
| Google Drive | approved doc summaries |
| Slack | approved feedback import |
| ERP | business entity memory |
| Robot/IoT | safety constraints |
| Postgres | storage backend |
| Vector DB | optional semantic index over summaries |
| Local File | default storage |

Plugin manifest:

```json
{
  "name": "lmti-plugin-codex-preflight",
  "version": "0.1.0",
  "permissions": ["read:project-memory", "write:task-outcome"],
  "hooks": ["beforeContextCompile", "afterTaskOutcome"],
  "sandbox": { "network": false, "filesystem": "plugin-data-only" }
}
```

Required hooks:

```text
beforeIntentParse
afterIntentParse
beforeMemoryRetrieval
afterMemoryRetrieval
beforePolicyEnforcement
beforeContextCompile
afterContextCompile
afterTaskOutcome
beforeLessonApproval
duringOfflineReflection
```

Plugin governance:

* Explicit scopes.
* Deny unknown permissions.
* Audit hook execution.
* No network by default.
* Versioned manifests.
* Local registry first, public registry later.

## 14. Evaluation Architecture

Evaluation compares:

1. raw model;
2. model + ordinary memory retrieval;
3. model + LMTI.

Metrics:

| Metric | Meaning |
|---|---|
| `wrong_context_rate` | bad/irrelevant context selected |
| `context_precision_at_k` | top-k memory relevance |
| `context_noise_ratio` | irrelevant tokens |
| `privacy_violation_rate` | restricted content leaked |
| `secret_block_rate` | known secrets blocked |
| `permission_mistake_rate` | unsafe permission fixes |
| `repeated_error_rate` | known mistakes repeated |
| `lesson_acceptance_rate` | proposed lessons accepted |
| `preflight_prediction_accuracy` | predicted failures match outcomes |
| `task_revision_reduction` | fewer correction rounds |
| `user_repeated_instruction_reduction` | fewer repeated preferences |
| `model_agnostic_transfer_score` | gains transfer across adapters |
| `agent_continuity_score` | project/role continuity |
| `context_token_efficiency` | useful context per token |
| `time_to_correct_context` | steps/time to right package |

Coding Agent eval cases:

| # | Input | Expected LMTI behavior |
|---|---|---|
| 1 | `dashboard Agent lỗi` | choose route/permission/API/bug/lesson; block secret/deprecated; warn 403 role check |
| 2 | `partner không vào được dashboard` | distinguish partner route from admin dashboard |
| 3 | `API summary trả 500` | select API contract/logs, not UI color |
| 4 | `đổi màu dashboard` | select UI color, ignore permission lesson unless touched |
| 5 | `sửa auth staff report` | require least-privilege constraint |
| 6 | `agent lặp lỗi cũ` | retrieve negative lesson and prior outcome |
| 7 | `cleanup memory cũ` | deprecate/archive, do not hard delete |
| 8 | `thêm plugin GitHub lesson` | validate manifest and scopes |
| 9 | `refactor compiler package` | select package boundaries/tests |
| 10 | `model local chạy task này` | invariant context across adapter |

## 15. Demo Case

Input:

```text
dashboard Agent lỗi
```

Memory pool:

1. Logo guideline.
2. Dashboard UI color.
3. Route `/dashboard/summary`.
4. Partner route `/partner`.
5. Admin route `/admin`.
6. Permission rule partner/admin/staff.
7. Previous bug partner bị 403.
8. Lesson: 403 có thể đúng theo least privilege.
9. Company profile.
10. API dashboard summary.
11. Coding convention.
12. User preference: luôn bám sản phẩm, nói thẳng, không văn mẫu.
13. Secret API key.
14. Deprecated memory: partner dùng `/dashboard`.

Expected output:

```json
{
  "parsedIntent": {
    "taskType": "debug",
    "targetArea": ["dashboard", "agent"],
    "actionNeeded": ["diagnose", "verify route", "verify permission"],
    "riskLevel": "high"
  },
  "observerFrame": {
    "role": "developer",
    "activeUserRoleUnknown": true,
    "note": "403 interpretation depends on admin/partner/staff observer."
  },
  "attentionFocus": {
    "focusOn": ["dashboard route", "partner route", "admin route", "permission rule", "previous 403", "least privilege lesson", "dashboard API"],
    "ignore": ["logo guideline", "dashboard UI color", "company profile"]
  },
  "workingMemory": {
    "assumptions": ["failing role unknown", "status code unknown"],
    "unknowns": ["which route", "which role", "actual HTTP status"]
  },
  "selectedMemories": [
    "Route /dashboard/summary",
    "Partner route /partner",
    "Admin route /admin",
    "Permission rule partner/admin/staff",
    "Previous bug partner 403",
    "Least privilege 403 lesson",
    "API dashboard summary",
    "Coding convention if code change is needed",
    "User preference summary"
  ],
  "rejectedMemories": [
    { "memory": "Logo guideline", "reason": "irrelevant to debug task" },
    { "memory": "Dashboard UI color", "reason": "cosmetic unless UI style task" },
    { "memory": "Company profile", "reason": "low relevance" }
  ],
  "blockedMemories": [
    { "memory": "Secret API key", "reason": "secret never raw inject" },
    { "memory": "Deprecated partner /dashboard", "reason": "deprecated cannot be truth" }
  ],
  "riskSignals": [
    "permission_escalation_risk",
    "stale_memory_risk",
    "privacy_risk",
    "wrong_context_risk"
  ],
  "predictedFailures": [
    "Agent may change 403 to 200 without role verification.",
    "Agent may use deprecated /dashboard route for partner.",
    "Agent may waste time on logo/color context."
  ],
  "selectedContextPackage": "Hybrid Best Package",
  "executiveConstraints": [
    "Do not change 403 to 200 before verifying role.",
    "Check /partner for partner users and /admin for admin users.",
    "Check permission rule partner/admin/staff.",
    "Do not widen partner into admin permissions.",
    "Do not inject or print secrets.",
    "Do not use deprecated partner /dashboard memory as truth."
  ],
  "finalContextPackage": {
    "summary": "Debug dashboard Agent issue as route/permission/API problem with high privacy and permission risk.",
    "technicalContext": ["routes", "permission rule", "prior 403", "least privilege lesson", "dashboard summary API"],
    "nextAction": "Reproduce failing role, route, status, and API call before patching."
  },
  "explanation": "LMTI selected route/permission/API/bug/lesson context, blocked secret/deprecated memory, rejected cosmetic/noisy memories, and generated constraints to prevent unsafe permission edits.",
  "taskOutcomePlaceholder": {
    "status": "pending_agent_run",
    "expectedObserverChecks": ["role", "route", "status", "permission guard"]
  },
  "lessonSuggestion": {
    "text": "For dashboard errors, verify role-specific route and permission rules before changing access-control behavior. A 403 can be correct under least privilege.",
    "status": "pending_review"
  },
  "auditLog": [
    "intent.parsed",
    "memory.selected",
    "memory.blocked.secret",
    "memory.blocked.deprecated",
    "preflight.selected.hybrid",
    "constraints.generated"
  ],
  "metrics": {
    "secret_block_rate": 1,
    "deprecated_memory_usage_rate": 0,
    "context_noise_ratio": 0.18,
    "permission_mistake_rate": 0,
    "time_to_correct_context": 1
  }
}
```

## 16. 90-Day Roadmap

| Phase | Days | Deliverables | Tasks | Success metric | Risk | Cut scope |
|---|---|---|---|---|---|---|
| Architecture Lock | 1-7 | schema, memory FS, primitives, preflight flow, first eval case | write specs, freeze MVP entities, define demo fixture | RFC accepted, demo spec complete | endless design | lock only Coding Agent scope |
| Kernel MVP | 8-21 | local memory store, metadata index, hard metadata gate, intent parser, attention router, privacy firewall, policy-safe preflight, compiler, `lmti preflight` | implement local JSON storage, metadata-first retrieval, policy matrix, safe content loader, package scorer | demo blocks secret/deprecated before scoring | privacy bug | remove dashboard |
| SDK + Demo | 22-45 | TS SDK, outcome observer, lesson inbox, eval runner, dashboard 403 demo | SDK client, CLI commands, eval fixtures | end-to-end demo passes | API churn | freeze one syscall |
| Server + Dashboard | 46-70 | server, Memory Explorer, Permission Firewall, Preflight Battle, Lesson Inbox, Audit Trail, Eval Lab | REST API, dashboard views, audit viewer | local dashboard debug works | UI too heavy | read-only dashboard |
| Spec + Open Core | 71-90 | Memory Object/Permission/Context/Preflight/Adapter/Plugin specs, docs site, public-ready repo | spec docs, examples, adapters, launch demo | install-to-demo <= 10 min | launch too broad | ship core+CLI+SDK only |

## 17. Repo Structure

```text
lmti/
  packages/
    core/
    sdk-js/
    cli/
    server/
    dashboard/
    adapters/
      openai/
      claude/
      codex/
      github/
      local-fs/
      postgres/
      vector-db/
    plugins/
      codex-preflight/
      memory-cleaner/
      privacy-audit/
    eval/
    specs/
  examples/
    coding-agent-demo/
    dashboard-403-demo/
  docs/
  tests/
```

Dependencies:

* `core` has no dependency on adapters, dashboard, or server.
* `sdk-js`, `cli`, `server`, and `dashboard` depend on `core`.
* `adapters/*` depend on `core` contracts only.
* `plugins/*` depend on plugin spec and limited hook payloads.
* `eval` depends on core contracts and fixtures.
* `specs` exports schemas consumed by all packages.
* `examples` depend on released package interfaces only.

## 18. ADR List

| ADR | Decision | Context | Options considered | Chosen option | Consequences |
|---|---|---|---|---|---|
| 1 | LMTI is kernel, not app | apps fragment the ecosystem | app, SDK-only, kernel | kernel | harder upfront, stronger platform |
| 2 | Memory filesystem over flat list | memory needs path, permission, lifecycle | list, graph-only, filesystem | filesystem + graph | clear namespace and policies |
| 3 | Privacy before prompt | model instruction is not security | prompt guard, post-filter, kernel enforcement | kernel enforcement | safer, requires policy engine |
| 4 | Context preflight is core | wrong context causes bad action | direct retrieval, rerank only, preflight | preflight | measurable differentiator |
| 5 | Lessons need approve/reject | auto-memory poisons knowledge | auto-save, never learn, approval | approval | slower but safer |
| 6 | Model-agnostic contract | model vendors change | vendor-specific, abstract adapter | model-agnostic kernel | broader adapters |
| 7 | Open-core | standard needs trust | closed, fully open, open-core | open-core | community plus business path |
| 8 | Eval from MVP | claims need proof | later eval, MVP eval | MVP eval | more work, better discipline |
| 9 | Deprecated memory not truth | stale memory is dangerous | keep using, delete, deprecate | deprecate/archive | audit preserved |
| 10 | Dashboard explainability required | users need debug | CLI only, hidden logs, dashboard | dashboard explainability | operational trust |

## 19. Risks & Cut Scope

| Risk | Signal | Impact | Mitigation | Cut scope |
|---|---|---|---|---|
| scope too broad | many adapters before kernel works | delayed MVP | Coding Agent first | cut adapters/dashboard |
| memory noise | context gets larger, worse answers | lower trust | preflight scoring and noise penalty | minimal safe package |
| eval hard to measure | metrics feel subjective | weak proof | deterministic fixtures first | 10 cases only |
| privacy leak | raw restricted content in context | critical security failure | deny-by-default policy, audit tests | block sensitive raw entirely |
| model output unstable | eval varies by model | noisy results | compare package quality and constraints | one model target first |
| dashboard too heavy | UI consumes sprint | no kernel progress | CLI-first, read-only screens | delay dashboard |
| plugin security | malicious plugin reads memory | data leak | sandbox, scopes, no network default | no public plugins MVP |
| open-source copied | competitors clone specs | moat pressure | community, eval suite, adapters, hosted ops | launch core well |
| team time short | missed phase milestones | fragmented product | cut to preflight demo | no server in 90 days |

## 20. Final Product Positioning

LMTI is the AI Cognitive Kernel for agents: it turns task intent, memory, privacy, preflight, constraints, outcomes, lessons, forgetting, evaluation, adapters, and plugins into one buildable operating layer.

It is not trying to be another AI app. It is the control plane that lets any AI Agent know what to pay attention to, what to ignore, what it is allowed to know, what can go wrong, what constraints it must follow, what happened after action, and what memory deserves to survive.

Short line:

**LMTI is the Linux-style cognitive kernel for AI Agents: memory filesystem, permission system, context preflight, lesson learning, and evaluation in one open model-agnostic layer.**
