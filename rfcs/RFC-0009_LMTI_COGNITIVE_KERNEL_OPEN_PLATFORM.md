# RFC-0009: LMTI Cognitive Kernel Open Platform

> Research archive. This RFC describes a broad platform vision. Current LMTI is
> a local-first project memory and verification layer for AI coding agents, with
> Codex as the first workflow.

Status: Draft
Sprint: 0 platform architecture proposal  
Audience: kernel, CLI, SDK, server, dashboard, adapters, plugin authors, open-source contributors

## 1. Executive Summary

One sentence:

LMTI is the cognitive kernel for AI agents.

Landing page, three sentences:

LMTI is the cognitive kernel for AI agents. It gives any model a standard way to attend, remember, filter, preflight, act, learn, and forget. It is not an app, memory database, RAG wrapper, or prompt manager; it is the open kernel layer that makes agent cognition inspectable, permissioned, testable, and model-agnostic.

Developer pitch:

LMTI sits between task input, memory, policy, model adapters, tools, and outcomes. It exposes kernel primitives such as `parseIntent`, `mountMemoryFilesystem`, `enforcePolicy`, `runContextPreflight`, `compileContext`, `observeOutcome`, and `evaluateAgent`. A developer can plug Codex, Cursor, an IDE, ERP, robot controller, local model, or hosted model into the same preflight contract without rewriting memory, permission, lesson, or evaluation logic.

Investor pitch:

AI agents are becoming execution infrastructure, but their memory and context layers are still fragmented, unsafe, and vendor-specific. LMTI creates an open cognitive kernel: memory filesystem, permission model, context system calls, adapters, plugins, evaluation, and audit logs. The open core grows the ecosystem; commercial value comes from hosted dashboards, enterprise permissions, compliance audit, team workspaces, analytics, private deployments, and support.

Open-source manifesto:

LMTI should be open where standards create trust: memory object spec, filesystem spec, permission spec, preflight contract, context package format, audit log, CLI, SDK, local runtime, basic adapters, and evaluation suite. The community should be able to inspect how context is chosen, why memory is blocked, and how lessons are approved. The moat is not hiding a prompt; the moat is becoming the standard cognitive kernel that agents, tools, apps, and teams can build on.

[CẢNH BÁO BẢO MẬT] LMTI must never rely on model instruction alone to protect secrets. Privacy, permission, deprecation, and `do_not_prompt` enforcement must happen inside the kernel before context reaches any model or adapter.

## 2. Linux Analogy Mapping

Linux won as kernel, spec, filesystem, permission model, driver ecosystem, package ecosystem, and community. LMTI should use that operating-system shape for agent cognition.

| Linux concept | Role in Linux | LMTI equivalent | Role in AI Agent | Feature to build | Why mapping is right | Difference from normal memory framework | MVP build |
|---|---|---|---|---|---|---|---|
| Kernel | Core that controls resources and syscalls | LMTI Cognitive Kernel | Governs intent, memory, privacy, context, risk, lessons, eval | `@lmti/core` with primitives and policy gates | Agent cognition needs a control plane, not just storage | Memory frameworks retrieve; kernel decides, blocks, explains, learns | Local TypeScript kernel package |
| Process | Running program with state | Agent Task Run | One task execution with working memory and outcome | `TaskRun` lifecycle | Agents do work in bounded runs | Memory tools store facts but do not model task lifecycle | `taskId`, state, events JSON |
| Filesystem | Organized persistent data | Memory Filesystem | Standard path tree for user, project, agent, task, policy, audit memory | `mountMemoryFilesystem` | Memory needs paths, ownership, permissions, lifecycle | Avoids unstructured vector-only buckets | Local JSON directory tree |
| File permission | Read/write/execute access | Memory Permission / Privacy Tag | Controls read, write, inject, summarize, block | `MemoryPermission` and tag policy | Context injection is an access operation | Blocks before prompt, not by asking model nicely | Tag-based access checks |
| System call | Stable API into kernel | LMTI API / Context Call | Agents request preflight, memory, lessons, eval | `lmti.preflight()` | External systems need stable contracts | Makes context selection portable | One preflight syscall |
| Driver | Hardware integration layer | Model / Tool / IDE / ERP Adapter | Connects LMTI to models, tools, apps, storage | Adapter interface | Kernel remains independent while drivers vary | No model vendor lock-in | Codex + local file adapters |
| Package manager | Install software safely | LMTI Plugin Registry | Community installs context, eval, privacy, domain plugins | Plugin manifest and registry | Ecosystem needs installable extensions | Memory framework extensions are often ad hoc | Local plugin manifest validation |
| Shell / CLI | User interface for kernel | LMTI CLI | Dev runs local init, memory, preflight, eval, lessons | `lmti` commands | Developers need a low-friction control surface | Not hidden inside an app UI | CLI over local kernel |
| Daemon | Background service | Offline Reflection / Consolidation Job | Cleans memory, resolves conflict, proposes lessons | `lmti reflection run` | Memory needs maintenance outside task time | Normal memory grows stale forever | Dry-run reflection daemon |
| Logs | Operational trace | Audit Trail / Context Decision Log | Explains selection, blocks, risk, constraints, outcomes | append-only audit log | Trust requires traceability | RAG usually lacks full decision audit | JSONL audit events |
| User/group permission | Multi-user access model | User Role / Agent Role | owner, maintainer, developer, agent, readonly, external_model | role policy | Different observers get different context | Same memory can be safe for owner, unsafe for model | Role-based checks |
| Distribution | Kernel bundled with tools | LMTI-powered Agent Stack | CLI + SDK + adapters + dashboard + plugins | starter distributions | Teams need usable stacks, not only a core library | Separates kernel standard from packaged products | local-dev distro |
| Kernel module | Loadable kernel capability | LMTI plugin | Adds domain logic without forking core | plugin hooks | Extensibility must preserve core contracts | Avoids monolithic agent framework | plugin hooks with permissions |
| Init system | Bootstraps services | Agent Runtime Bootstrap | Starts memory FS, policy, adapters, plugins, eval config | `lmti init` runtime config | Agent stack needs ordered startup | Prevents hidden dependencies | local config bootstrap |
| Security module | Mandatory access control | Privacy Firewall / Memory Immune System | Blocks secrets, injections, stale memory, over-permission access | policy engine and immune checks | Security belongs in kernel path | Prompt-level safety is too late | deny-by-default policy |

## 3. LMTI Kernel Architecture

LMTI should be a layered cognitive kernel with replaceable storage, adapters, and UI.

```text
Task Input
  -> Kernel Bootstrap
  -> Task Intent Intelligence
  -> Observer Frame
  -> Attention Router
  -> Memory Filesystem
  -> Permission Firewall
  -> Context Preflight
  -> Failure Prediction
  -> Context Compiler
  -> Executive Constraint Dispatcher
  -> Model / Tool / App Adapter
  -> Outcome Observer
  -> Lesson Inbox
  -> Memory Consolidation
  -> Offline Reflection
  -> Evaluation Harness
  -> Audit Trail
```

Core kernel responsibilities:

* Standardize task intent, observer, memory, policy, context package, constraints, lessons, outcome, and evaluation.
* Enforce permission before context compilation.
* Keep models replaceable: GPT, Claude, Gemini, Llama, local models, or non-LLM automation systems receive the same structured contract.
* Keep storage replaceable: local files first, later SQLite, Postgres, object storage, or vector store.
* Keep interfaces open: CLI, SDK, MCP, adapters, plugins, dashboard, server.

Non-goals:

* Not a chat app.
* Not a vector database.
* Not a RAG wrapper.
* Not a prompt manager.
* Not a model vendor abstraction alone.
* Not a place to store raw secrets, raw prompt history, or unreviewed memory as truth.

## 4. Kernel Primitives

All primitives are model-agnostic. They operate on LMTI schema and return structured results.

| Primitive | Purpose | Input | Output | API/function signature | Data stored | Metric | MVP implementation |
|---|---|---|---|---|---|---|---|
| `parseIntent` | Classify task and risk | input, projectId, userId | `TaskIntent` | `parseIntent(input, projectId, userId): Promise<TaskIntent>` | intent record | `intent_accuracy` | rules + keyword taxonomy |
| `createAttentionFocus` | Select focus domains | `TaskIntent` | `AttentionFocus` | `createAttentionFocus(intent): Promise<AttentionFocus>` | focus/ignore reasons | `attention_accuracy` | weighted intent terms |
| `mountMemoryFilesystem` | Open memory namespace | projectId, userId, agentId | `MemoryMount` | `mountMemoryFilesystem(scope): Promise<MemoryMount>` | mount config | `mount_success_rate` | local JSON root |
| `readMemory` | Read memory with permission | path/id, observer | `MemoryObject` or block | `readMemory(ref, observer): Promise<MemoryReadResult>` | read audit | `unauthorized_memory_access_rate` | policy check then file read |
| `writeMemory` | Add or update memory | memory draft, observer | `MemoryObject` | `writeMemory(draft, observer): Promise<MemoryObject>` | memory + audit | `memory_write_acceptance_rate` | validate required fields |
| `rankMemory` | Rank candidates by relevance/mass | candidates, intent, observer | ranked memories | `rankMemory(memories, intent, observer): Promise<RankedMemory[]>` | ranking trace | `context_precision_at_k` | score relevance + cognitive mass |
| `enforcePolicy` | Block/summarize/allow memory | memories, observer, policy | allowed/summarized/blocked | `enforcePolicy(memories, observer, policy): Promise<PolicyResult>` | block audit | `secret_block_rate` | tag rules |
| `runContextPreflight` | Compare context packages | candidates, risks | `PreflightRun` | `runContextPreflight(candidates, risks): Promise<PreflightRun>` | preflight trace | `preflight_prediction_accuracy` | package A/B/C scoring |
| `predictFailure` | Forecast likely agent errors | package, task | `PredictedFailure[]` | `predictFailure(task, contextPackage): Promise<PredictedFailure[]>` | predictions | `prevented_failure_rate` | failure templates |
| `compileContext` | Build final context package | selected package | `ContextPackage` | `compileContext(selected, constraints): Promise<ContextPackage>` | context manifest | `context_token_efficiency` | JSON/text compiler |
| `sendExecutiveConstraints` | Deliver action boundaries | constraints, adapter | ack/result | `sendExecutiveConstraints(adapter, constraints): Promise<ConstraintAck>` | ack audit | `constraint_ack_rate` | include constraints in adapter payload |
| `observeOutcome` | Record what happened | preflightId, result | `TaskOutcome` | `observeOutcome(input): Promise<TaskOutcome>` | outcome event | `task_revision_reduction` | CLI/manual outcome event |
| `extractLesson` | Propose learning | outcome | `Lesson[]` | `extractLesson(outcome): Promise<Lesson[]>` | lesson drafts | `lesson_acceptance_rate` | heuristic extractor |
| `approveLesson` | Promote lesson to memory | lessonId, reviewer | approved memory | `approveLesson(lessonId, reviewer): Promise<MemoryObject>` | approval audit | `approved_lesson_quality` | explicit CLI action |
| `forgetMemory` | Deprecate/expire/archive memory | memoryId, reason | updated memory | `forgetMemory(memoryId, reason): Promise<MemoryObject>` | deprecation audit | `deprecated_memory_usage_rate` | mark deprecated, never hard delete first |
| `consolidateMemory` | Merge lessons/events | projectId | consolidation run | `consolidateMemory(projectId): Promise<ConsolidationRun>` | merge proposals | `duplicate_memory_reduction` | dry-run merge suggestions |
| `runOfflineReflection` | Periodic cleanup/eval | projectId | reflection run | `runOfflineReflection(projectId): Promise<ReflectionRun>` | reflection report | `memory_decay_quality` | local scheduled command |
| `evaluateAgent` | Compare baseline vs LMTI | testCaseId | eval run | `evaluateAgent(testCaseId): Promise<EvaluationRun>` | metrics | `model_agnostic_transfer_score` | fixture-based eval |
| `explainContextDecision` | Explain why context was chosen/blocked | preflightId | explanation | `explainContextDecision(preflightId): Promise<ContextDecisionExplanation>` | explanation trace | `explainability_completeness` | trace formatter |

## 5. Memory Filesystem Spec

Example memory object:

```ts
export interface MemoryObject {
  id: string;
  path: string;
  type: string;
  content: string;
  summary?: string;
  projectId?: string;
  userId?: string;
  agentId?: string;
  source: MemorySource;
  confidence: number;
  cognitiveMass: number;
  tags: MemoryTag[];
  permissions: MemoryPermission;
  validFrom: Date;
  validUntil?: Date;
  status: "active" | "deprecated" | "expired" | "pending" | "rejected";
  relations: MemoryRelation[];
  createdAt: Date;
  updatedAt: Date;
}
```

Path rules:

* Paths are logical namespaces, not raw OS paths.
* Every memory path maps to permission, lifecycle, source, and injection policy.
* The filesystem can be backed by local files first, then SQLite/Postgres.
* Secret memory can exist as metadata, but raw secret content must not be injected.

| Path | Stores | Read | Write | Inject when | Block when | Example data |
|---|---|---|---|---|---|---|
| `/users/{userId}/preferences` | Explicit user work preferences | owner, maintainer, agent in same workspace | owner, maintainer | response style or artifact choice matters | external model without need | "Bám sản phẩm, nói thẳng, không văn mẫu" |
| `/users/{userId}/relationship-profile` | Collaboration profile and continuity notes | owner, trusted agent | owner only or explicit approval | summarized for tone only | personal/sensitive detail not needed | "Prefers technical docs over vague chat" |
| `/projects/{projectId}/identity` | Project mission and scope | project roles | maintainer | every project task summary | wrong project | "LMTI is cognitive kernel, not app" |
| `/projects/{projectId}/decisions` | Architecture decisions | project roles | maintainer | related architecture/code task | deprecated or unapproved | "Privacy before context compile" |
| `/projects/{projectId}/lessons` | Approved task lessons | project roles | maintainer via lesson approval | matching task intent | pending/rejected | "Do not turn 403 into 200 before role check" |
| `/projects/{projectId}/bug-history` | Previous bugs/outcomes | project roles | developer/maintainer | similar debug task | unrelated module or expired | "Partner route caused 403 confusion" |
| `/projects/{projectId}/permission-rules` | Access-control rules | maintainer, developer, agent | maintainer | auth, route, role, API tasks | external model if sensitive and not summarized | "Partner uses /partner; admin uses /admin" |
| `/projects/{projectId}/coding-conventions` | Local implementation style | project roles | maintainer/developer | code-change task | non-code strategy task | "Use existing package boundaries" |
| `/agents/{agentId}/self-model` | Operational identity and boundaries | owner, agent runtime | owner/maintainer | always summarized into agent bootstrap | external model if not needed | "Security-first research engineer" |
| `/agents/{agentId}/habits` | Reusable workflows | owner, agent runtime | approved outcome only | repeated workflow | failed/unreviewed workflow | "Run eval after preflight change" |
| `/policies/privacy` | Sensitivity and injection policy | owner, maintainer, kernel | owner/maintainer | never raw to model; compiled into constraints | always raw-blocked from external model | "secret: never raw inject" |
| `/policies/least-privilege` | Permission safety policy | project roles | maintainer | permission/security tasks | never blocked if needed as safety summary | "Do not widen roles without evidence" |
| `/tasks/{taskId}/working-memory` | Temporary state | current task agent, maintainer | current task agent | during task only | expired or task complete | "Unknown: failing role not confirmed" |
| `/archive/deprecated` | Deprecated/superseded memory | maintainer, audit | kernel/reflection | only to explain conflict | normal context selection | "Old partner /dashboard route" |
| `/audit/context-decisions` | Append-only decision trace | owner, maintainer, auditor | kernel only | never to model by default | always for external model | "Secret blocked due policy" |

## 6. Permission System

LMTI permission must work like mandatory access control for context injection. The model receives only already-authorized context.

Required tags:

| Tag | Rule |
|---|---|
| `public` | Can inject if relevant. |
| `project` | Inject only when project matches. |
| `internal` | Inject only when role/agent is allowed. |
| `sensitive` | Summarize only when task truly needs it. |
| `secret` | Never inject raw. |
| `do_not_prompt` | Never inject. |
| `deprecated` | Do not use as truth; only use to explain conflicts. |
| `pending_review` | Do not use as official truth. |

API:

```ts
canReadMemory(userId: string, agentId: string, memoryId: string): Promise<boolean>;
canInjectMemory(taskIntent: TaskIntent, observer: ObserverFrame, memory: MemoryObject): Promise<boolean>;
enforceMemoryPermission(
  memories: MemoryObject[],
  observer: ObserverFrame,
  policy: PermissionPolicy
): Promise<PermissionResult>;
explainPermissionBlock(memoryId: string, taskId: string): Promise<PermissionBlockExplanation>;
```

Dashboard:

| Screen | Purpose | MVP |
|---|---|---|
| Privacy Firewall Log | Show blocks and summaries | filter by task, tag, role |
| Blocked Memory Viewer | Inspect metadata, never raw secret | reason and source |
| Permission Rule Editor | Edit role/tag policy | local JSON policy |
| Injection Audit Trail | Show what entered final context | immutable JSONL trace |

Metrics:

* `privacy_violation_rate`: target 0.
* `secret_block_rate`: target 1.0.
* `unauthorized_memory_access_rate`: target 0.
* `sensitive_summary_accuracy`: target >= 0.85.
* `deprecated_memory_usage_rate`: target 0 for normal context.

## 7. Context System Call Spec

System call:

```ts
const result = await lmti.preflight({
  userId: "phat",
  projectId: "core-ai",
  agentId: "codex-dev",
  role: "developer",
  input: "dashboard Agent lỗi",
  modelTarget: "gpt-5.5",
  tokenBudget: 4000
});
```

Output:

```ts
export interface LmtiPreflightResult {
  preflightId: string;
  intent: TaskIntent;
  observerFrame: ObserverFrame;
  attentionFocus: AttentionFocus;
  selectedMemories: MemoryObject[];
  blockedMemories: BlockedMemory[];
  riskSignals: RiskSignal[];
  predictedFailures: PredictedFailure[];
  executiveConstraints: ExecutiveConstraint[];
  finalContextPackage: ContextPackage;
  explanation: ContextDecisionExplanation;
  metrics: PreflightMetrics;
}
```

Field contract:

| Field | Use | Model receives | Dashboard displays | Never send to model |
|---|---|---|---|---|
| `preflightId` | Correlate audit/outcome | maybe id only | yes | raw audit internals |
| `intent` | Task classification | summary | yes | raw input if sensitive |
| `observerFrame` | Role/project/agent frame | safe summary | yes | private user profile raw |
| `attentionFocus` | Focus and ignored domains | selected focus summary | yes | ignored secret details |
| `selectedMemories` | Authorized memory | allowed/summarized content | ids, scores, reasons | raw sensitive/secret |
| `blockedMemories` | Explain blocked context | no | metadata only | raw blocked content |
| `riskSignals` | Safety warnings | safe risk summary | yes | sensitive evidence raw |
| `predictedFailures` | Preflight failure forecast | safe summary | yes | sensitive exploit detail |
| `executiveConstraints` | Agent action boundaries | yes | yes | policy internals if secret |
| `finalContextPackage` | Model-ready package | yes | yes | blocked memory |
| `explanation` | Why context was chosen | concise version | full trace | secrets/sensitive raw |
| `metrics` | Eval and quality stats | no by default | yes | user-private analytics externally |

## 8. Adapter Architecture

Adapter principle: LMTI is kernel; adapters are drivers. A driver can translate context packages into a target system, but it cannot change permission decisions.

| Adapter | Purpose | Input | Output | Data synced | Privacy risk | MVP | Future |
|---|---|---|---|---|---|---|---|
| OpenAI Adapter | Send model-ready context to OpenAI-compatible APIs | context package | model request payload | none by default | external model exposure | compile messages | function/tool call mapping |
| Claude Adapter | Send context to Anthropic-style messages | context package | Claude payload | none by default | external model exposure | message compiler | constitutional/tool format |
| Gemini Adapter | Send context to Gemini | context package | Gemini payload | none by default | external model exposure | prompt compiler | multimodal context support |
| Llama / Local Model Adapter | Run local model | context package | local model payload | local only | local logs leak | text compiler | quantized model profiles |
| Codex Adapter | Preflight coding agent tasks | task/context/constraints | Codex-ready instructions | files touched, outcomes | code secret leakage | context + constraints | outcome hooks |
| Cursor Adapter | IDE coding context | task/context | editor extension payload | selected files, diffs | workspace leakage | preflight panel | inline explanations |
| VS Code Adapter | Local IDE integration | task/context | extension state | workspace refs | extension storage leakage | command palette | tree views |
| GitHub Adapter | Issues, PRs, comments | issue/PR/task | memory/outcome events | PR metadata | private repo leakage | read issues/PR metadata | CI/eval comments |
| GitLab Adapter | GitLab issues/MRs | issue/MR/task | memory/outcome events | MR metadata | private repo leakage | metadata adapter | pipeline hooks |
| Slack Adapter | Team feedback ingestion | messages/events | candidate memory | summaries only | chat PII leakage | manual approved import | thread lesson workflow |
| Google Drive Adapter | Docs/sheets source memory | file refs | candidate memory | file metadata/summaries | document leakage | selected doc import | permissions sync |
| ERP Adapter | Business workflow memory | records/events | structured memory | entity refs, statuses | customer/commercial data | schema adapter | role-aware business memory |
| Robot / IoT Adapter | Safety constraints for physical actions | task, constraints | robot-safe command context | telemetry summary | physical safety risk | blocklist constraints | real-time safety monitor |
| Postgres Adapter | Persistent storage backend | kernel store ops | DB rows | memory/audit/outcomes | DB credentials/data | schema + migrations | row-level security |
| Vector DB Adapter | Optional semantic index | memory summaries | embedding index | summaries only | embedding sensitive data | local/off by default | pluggable providers |
| Local File Adapter | Local storage backend | memory/audit ops | files | JSON/JSONL | filesystem permission | default storage | encrypted local files |

## 9. Plugin System

Plugin goals:

* Extend kernel behavior without forking core.
* Require explicit permission scopes.
* Run inside a sandbox with hook payload minimization.
* Support local registry first, public marketplace later.

Example manifest:

```json
{
  "name": "lmti-plugin-codex-preflight",
  "version": "0.1.0",
  "permissions": [
    "read:project-memory",
    "write:task-outcome",
    "read:code-context"
  ],
  "hooks": [
    "beforeContextCompile",
    "afterTaskOutcome",
    "beforeLessonApproval"
  ],
  "entry": "./dist/index.js",
  "sandbox": {
    "network": false,
    "filesystem": "plugin-data-only"
  }
}
```

Plugin examples:

| Plugin | Purpose | Permissions | Hooks | MVP |
|---|---|---|---|---|
| `lmti-plugin-codex-preflight` | Coding agent preflight | read project memory, write outcome | before compile, after outcome | local package |
| `lmti-plugin-github-lessons` | PR/issue lessons | read PR metadata, write lessons | after outcome | manual import |
| `lmti-plugin-erp-memory` | ERP domain memory | read ERP summaries | before retrieval | schema mapping |
| `lmti-plugin-contract-memory` | Contract clause memory | read docs summaries | before preflight | clause tags |
| `lmti-plugin-seo-memory` | SEO project lessons | project memory | retrieval hook | SEO tags |
| `lmti-plugin-robot-safety` | Physical safety constraints | read safety policy | before constraints | hard blockers |
| `lmti-plugin-privacy-audit` | Stronger audit checks | read audit metadata | after permission | findings |
| `lmti-plugin-context-eval` | Context quality eval | read eval cases | after preflight | extra metrics |
| `lmti-plugin-memory-cleaner` | Memory cleanup | read memory metadata, propose deprecations | reflection | dry-run cleaner |

API:

```ts
registerPlugin(plugin: LmtiPlugin): Promise<RegisteredPlugin>;
runPluginHook(hookName: PluginHookName, payload: unknown): Promise<PluginHookResult[]>;
validatePluginPermissions(plugin: LmtiPlugin, requestedAccess: string[]): Promise<PermissionValidation>;
```

Registry plan:

* Phase 1: local manifest install.
* Phase 2: signed plugin metadata.
* Phase 3: public registry with scopes, reviews, security badges.
* Phase 4: enterprise private registry.

## 10. CLI

| Command | Purpose | Input | Sample output | Data affected | Security risk | MVP |
|---|---|---|---|---|---|---|
| `lmti init` | Bootstrap local kernel | project path | "Created .lmti config" | config, folders | overwriting config | create only missing files |
| `lmti project create` | Create project identity | name/id | project id | project memory | wrong project scope | local project record |
| `lmti memory add` | Add memory draft | path/type/content/tags | memory id | memory FS | secret accidentally stored | secret scan + sensitivity required |
| `lmti memory list` | List memory metadata | filters | table | none | over-disclosure | respect role |
| `lmti memory explain` | Explain memory source/permissions | memory id | source, policy, rank | audit read | leaking blocked content | metadata only for blocked |
| `lmti preflight "dashboard Agent lỗi"` | Run context syscall | input/options | package + constraints | audit/preflight | prompt contains secret | raw input redaction |
| `lmti lesson inbox` | Show proposed lessons | filters | pending list | none | sensitive lessons shown | role check |
| `lmti lesson approve` | Promote lesson | lesson id | approved memory id | lessons/memory | poisoned lesson approval | source/evidence required |
| `lmti lesson reject` | Reject lesson | lesson id/reason | rejected | lessons | deleting useful knowledge | keep audit |
| `lmti policy check` | Validate policy | role/project | findings | none | false sense of safety | fixture tests |
| `lmti eval run` | Run evaluation suite | suite id | metrics | eval runs | leaking test secrets | synthetic fixtures |
| `lmti adapter install` | Install adapter | adapter name | installed | adapter config | malicious adapter | manifest validation |
| `lmti plugin install` | Install plugin | package/path | installed | plugin config | supply-chain risk | local allowlist + no network by default |
| `lmti reflection run` | Cleanup memory | project id | dry-run report | reflection/audit | unsafe deletion | dry-run default |
| `lmti doctor` | Diagnose installation | project path | health report | none unless fix flag | exposing paths | redact sensitive paths if exported |

## 11. SDK

Package: `@core-ai/lmti`

```ts
import { LMTI } from "@core-ai/lmti";

const lmti = new LMTI({
  projectId: "core-ai",
  userId: "phat",
  agentId: "codex-dev",
  mode: "local"
});

const preflight = await lmti.preflight({
  input: "dashboard Agent lỗi",
  role: "developer",
  modelTarget: "openai:gpt-5.5",
  tokenBudget: 4000
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

SDK modules:

| Module | APIs | MVP |
|---|---|---|
| client | `new LMTI`, config, health | local mode |
| local mode | file-backed kernel | default |
| server mode | HTTP client to LMTI server | stub client |
| memory API | `readMemory`, `writeMemory`, `forgetMemory` | local memory FS |
| preflight API | `preflight`, `explainContextDecision` | full preflight |
| lesson API | `lessonInbox`, `approveLesson`, `rejectLesson` | lesson review |
| policy API | `checkPolicy`, `explainPermissionBlock` | tag policy |
| eval API | `evaluateAgent`, `runSuite` | fixture suite |
| plugin API | `registerPlugin`, `runPluginHook` | local plugin registry |

## 12. Spec Documents

| Spec | Purpose | Users | Main schema | Versioning | Compatibility rule | MVP first |
|---|---|---|---|---|---|---|
| LMTI Memory Object Spec | Standard memory record | storage/plugin/adapter authors | `MemoryObject` | semver | additive fields backward-compatible | object schema |
| LMTI Memory Filesystem Spec | Standard memory paths | kernel/storage/dashboard | `MemoryPath`, `MemoryMount` | semver | old paths must resolve or migrate | path registry |
| LMTI Permission Spec | Injection/read/write rules | kernel/security/dashboard | `MemoryPermission`, tags | semver + policy version | deny unknown tag by default | tag matrix |
| LMTI Context Package Spec | Model-ready context format | model adapters/agents | `ContextPackage` | semver | required constraints preserved | JSON package |
| LMTI Preflight Spec | System call contract | SDK/CLI/server/adapters | `LmtiPreflightResult` | semver | blocked memory never exposed | preflight response |
| LMTI Lesson Spec | Lesson proposal/approval | memory/runtime/dashboard | `Lesson` | semver | pending not truth | lesson states |
| LMTI Evaluation Spec | Compare agent behavior | evaluators/researchers | `EvaluationCase`, `EvaluationRun` | semver | metric names stable | fixture runner |
| LMTI Adapter Spec | Driver contract | adapter authors | `LmtiAdapter` | semver | adapters cannot bypass policy | Codex/local adapter |
| LMTI Plugin Spec | Community extension contract | plugin authors | manifest/hooks | semver | scopes explicit | manifest validator |
| LMTI Audit Log Spec | Explainability and compliance | auditors/dashboard | JSONL audit events | semver | append-only event compatibility | context decision log |

## 13. Evaluation Suite

Comparison modes:

* Raw model.
* Model + ordinary memory retrieval.
* Model + LMTI kernel preflight.

Required metrics:

| Metric | Measures |
|---|---|
| `wrong_context_rate` | harmful/irrelevant context selected |
| `context_precision_at_k` | top-k selected memories are relevant |
| `context_noise_ratio` | irrelevant tokens in context |
| `privacy_violation_rate` | blocked data leaked |
| `secret_block_rate` | known secrets blocked |
| `permission_mistake_rate` | unsafe permission fixes |
| `repeated_error_rate` | known mistakes repeated |
| `lesson_acceptance_rate` | useful proposed lessons |
| `preflight_prediction_accuracy` | predicted failures match outcomes |
| `task_revision_reduction` | fewer user correction rounds |
| `user_repeated_instruction_reduction` | fewer repeated user preferences |
| `model_agnostic_transfer_score` | gains survive model swaps |
| `agent_continuity_score` | agent preserves project/role rules |

Coding Agent test cases:

| # | Input | Memory pool focus | Expected LMTI behavior |
|---|---|---|---|
| 1 | `dashboard Agent lỗi` | logo, color, routes, permission, previous 403, least privilege, API, coding convention, secret, deprecated route | select route/permission/bug/lesson/API, block secret and deprecated route, warn not to change 403 to 200 before role verification |
| 2 | `fix login redirect for partner` | admin route, partner route, old redirect, auth policy | choose partner route, reject stale redirect |
| 3 | `API trả 500 khi tạo order` | order API, DB schema, UI theme, secret DB URL | select API/schema, block secret |
| 4 | `update logo trên dashboard` | logo guideline, permission rule, prior 403 | select logo, ignore permission lesson unless route impacted |
| 5 | `refactor memory package` | package boundaries, coding conventions, unrelated ERP notes | select package docs and tests |
| 6 | `thêm quyền staff xem report` | role policy, least privilege, report route | require permission review constraint |
| 7 | `sửa test compiler fail` | compiler test history, memory lessons | select compiler module and test habit |
| 8 | `xóa memory cũ` | deprecated memories, audit policy | propose deprecate/archive, avoid hard delete |
| 9 | `deploy plugin privacy audit` | plugin manifest, permissions, audit policy | require sandbox and scopes |
| 10 | `agent quên convention khi sửa code` | user preference, coding convention, success pattern | inject coding convention summary and observe outcome |

## 14. Dashboard

| Screen | Purpose | Data displayed | User actions | Main metric | MVP | Future |
|---|---|---|---|---|---|---|
| Kernel Overview | See health and recent preflights | runs, errors, policy status | open run | uptime/preflight count | local summary | team analytics |
| Memory Filesystem Explorer | Browse memory paths | paths, metadata, tags | inspect, add, deprecate | memory coverage | tree view | graph + search |
| Permission Firewall | Inspect blocks | blocked memory, reasons | edit policy, acknowledge | privacy violation rate | log table | compliance workflows |
| Context Preflight Battle | Compare packages | package scores, failures | choose/override | prediction accuracy | package table | simulation graph |
| Context Decision Explainability | Explain selection | selected/blocked/rank reasons | export explanation | explainability completeness | trace view | diff between runs |
| Agent Constraints Panel | Show action boundaries | constraints and ack | require ack | constraint violation rate | list | policy templates |
| Lesson Inbox | Review learning | proposed lessons | approve/reject/edit | acceptance rate | inbox | review queues |
| Offline Reflection Center | Clean memory | conflicts, duplicates, stale | apply dry-run | memory decay quality | dry-run report | scheduler |
| Plugin Registry | Manage plugins | installed/available/scopes | install/disable | plugin policy violations | local registry | marketplace |
| Adapter Manager | Configure drivers | adapters, status, scopes | enable/test | adapter success rate | local adapters | hosted integrations |
| Evaluation Lab | Run suites | baseline vs LMTI metrics | run/export | transfer score | fixture runs | CI integration |
| Audit Trail | Review events | context decisions, policy events | filter/export | audit completeness | JSONL viewer | compliance export |
| Project Operating Memory | Show project identity | rules, decisions, narrative | edit with approval | continuity score | summary | governance |
| Agent Continuity Score | Track consistency | continuity checks | open failures | continuity score | scorecard | team trend |

## 15. Open-Core Strategy

Open source:

* Memory Object Spec.
* Memory Filesystem Spec.
* Permission Spec.
* Context Package Spec.
* Preflight Spec.
* CLI basic.
* TypeScript SDK.
* Local runtime.
* Basic adapters.
* Basic eval suite.

Commercial:

* Hosted dashboard.
* Team workspace.
* Enterprise permission.
* Audit/compliance.
* Advanced eval.
* Advanced plugin marketplace.
* Private deployment.
* SSO.
* Role management.
* Project analytics.
* Support SLA.

Why open core fits:

* The standard must be inspectable to gain trust.
* Developers need local-first adoption with no procurement.
* Ecosystem value comes from adapters/plugins/spec compatibility.
* Enterprise value comes from governance, scale, audit, collaboration, and support.

Copy risk:

* Specs can be copied.
* Basic CLI/SDK can be reimplemented.
* Model providers can imitate memory features.

Moat:

* Canonical eval suite and public compatibility badge.
* Best local developer experience.
* Plugin/adapters ecosystem.
* Audit and permission depth.
* Community trust around open specs.
* Enterprise-grade governance built on the same open kernel.

## 16. Differentiation

| Category | Typical value | LMTI difference |
|---|---|---|
| Vector DB memory | Semantic recall | Adds filesystem, permission, preflight, lessons, audit, eval |
| RAG framework | Retrieve docs into prompts | Governs whether context should be used, blocked, summarized, or tested |
| Agent framework | Orchestrate tools/agents | Supplies cognitive kernel primitives any framework can call |
| Stateful agent memory | Remember user/session facts | Adds lifecycle, approval, forgetting, source, role, model-agnostic spec |
| AI companion memory | Personal continuity | Focuses on project/task/agent operating memory with privacy controls |
| IDE agent memory | Codebase hints | Adds cross-tool memory filesystem and outcome learning |
| Enterprise knowledge base | Central documents | Converts knowledge into task preflight constraints and metrics |

Core differentiators:

* Cognitive kernel, not app.
* Memory filesystem.
* Permission like an OS.
* Context preflight.
* Failure prediction.
* Lesson approval.
* Explainable context decision.
* Model-agnostic spec.
* CLI/SDK/plugin ecosystem.

## 17. 90-Day Roadmap

| Phase | Days | Deliverables | Technical tasks | Demo milestone | Success metric | Risk | Cut scope if needed |
|---|---|---|---|---|---|---|---|
| Phase 1: Kernel MVP | 1-21 | schema, local memory FS, privacy tag, intent parser, attention router, context preflight, context compiler, lesson inbox, basic CLI, simple dashboard demo | implement TS types, local JSON storage, policy engine, preflight trace, fixture eval | `dashboard Agent lỗi` local preflight | secret block = 100%, deprecated block = 100% | overbuilding dashboard | CLI-only demo |
| Phase 2: SDK + CLI | 22-45 | TS SDK, preflight API, memory API, lesson API, eval API, complete CLI, Codex demo | SDK client, command coverage, outcome observer, eval runner | Coding Agent demo with outcome + lesson | context precision@k >= 0.8 | API churn | freeze SDK beta surface |
| Phase 3: Server + Dashboard | 46-70 | LMTI server, Memory Explorer, Privacy Firewall, Preflight Battle, Lesson Inbox, Eval Lab, Audit Trail | HTTP API, dashboard screens, audit viewer, role policy editor | local server dashboard | explainability completeness >= 0.9 | UI scope creep | ship read-only dashboard |
| Phase 4: Spec + Open Core | 71-90 | spec docs, local runtime, plugin manifest, adapter spec, repo structure, docs site, public demo, launch plan | publish specs, plugin validator, basic adapters, docs examples | public open-source demo | install-to-demo <= 10 minutes | community confusion | launch kernel + CLI + docs only |

## 18. Repo Structure

Proposed open platform structure:

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

Directory roles:

| Directory | Responsibility |
|---|---|
| `packages/core` | Kernel primitives and domain logic |
| `packages/sdk-js` | TypeScript SDK |
| `packages/cli` | Local developer CLI |
| `packages/server` | Optional local/team server |
| `packages/dashboard` | Web UI for server |
| `packages/adapters/*` | Drivers for models, tools, apps, storage |
| `packages/plugins/*` | First-party plugins |
| `packages/eval` | Evaluation harness and fixtures |
| `packages/specs` | Machine-readable spec schemas |
| `examples/coding-agent-demo` | General coding-agent integration |
| `examples/dashboard-403-demo` | Mandatory permission/debug demo |
| `docs` | Human documentation and tutorials |
| `tests` | Cross-package integration tests |

## 19. Demo Case

Input:

```text
dashboard Agent lỗi
```

Required kernel run:

1. Parse intent.
2. Identify observer frame.
3. Create attention focus.
4. Mount memory filesystem.
5. Retrieve memory candidates.
6. Enforce permission.
7. Block secret/deprecated/irrelevant memory.
8. Run context preflight.
9. Predict failure.
10. Compile final context.
11. Send executive constraints.
12. Observe agent outcome.
13. Extract lesson.
14. Log audit.
15. Update eval metric.

Demo output:

```json
{
  "parsedIntent": {
    "taskType": "debug",
    "targetArea": ["dashboard", "Agent"],
    "riskLevel": "high",
    "unknowns": ["role", "route", "status code"]
  },
  "selectedMemory": [
    "route:/dashboard/summary",
    "route:/partner",
    "route:/admin",
    "permission:partner/admin/staff",
    "bug:partner-403",
    "lesson:least-privilege-403",
    "api:dashboard-summary",
    "coding-convention:if-code-change-needed"
  ],
  "blockedMemory": [
    {
      "memory": "secret API key",
      "reason": "secret never raw inject"
    },
    {
      "memory": "deprecated partner uses /dashboard",
      "reason": "deprecated memory cannot be used as truth"
    },
    {
      "memory": "logo guideline",
      "reason": "low relevance for debug task"
    },
    {
      "memory": "dashboard UI color",
      "reason": "low relevance for debug task"
    },
    {
      "memory": "company profile",
      "reason": "low relevance for debug task"
    }
  ],
  "predictedFailure": [
    {
      "mode": "permission_escalation",
      "scenario": "agent changes 403 to 200 without role verification",
      "severity": "critical"
    },
    {
      "mode": "stale_memory",
      "scenario": "agent uses deprecated /dashboard route for partner",
      "severity": "high"
    }
  ],
  "executiveConstraints": [
    "Do not change 403 to 200 before verifying role.",
    "Check /partner for partner users and /admin for admin users.",
    "Do not widen partner into admin permissions.",
    "Do not inject or print secrets.",
    "Do not use deprecated partner /dashboard memory as truth."
  ],
  "finalContextPackage": {
    "summary": "Debug dashboard Agent issue as route/permission/API problem with high permission and privacy risk.",
    "memories": [
      "current routes",
      "permission rule",
      "prior 403 bug",
      "least privilege lesson",
      "dashboard summary API"
    ],
    "nextAction": "Reproduce failing role and route before changing code."
  },
  "explanation": "LMTI selected high-impact route, permission, bug, lesson, and API memory; blocked secret, deprecated, and irrelevant memory; predicted unsafe permission patch; compiled compact model-agnostic context.",
  "lessonSuggestion": {
    "text": "For dashboard failures, verify observer role and route before changing access-control behavior; 403 can be correct under least privilege.",
    "status": "pending_review"
  },
  "metricLog": {
    "secret_block_rate": 1,
    "deprecated_memory_usage_rate": 0,
    "context_noise_ratio": 0.18,
    "permission_mistake_rate": 0,
    "preflight_prediction_accuracy": 0.75
  }
}
```

## 20. Risks & Cut Scope

Risks:

* The Linux analogy can become branding instead of architecture.
* Plugin ecosystem can create supply-chain risk.
* Vector DB support can accidentally embed sensitive data.
* Dashboard can become the product too early and hide kernel weakness.
* Permission mistakes are high-impact; prompt-level enforcement is insufficient.
* Overly broad memory can make context worse than raw model behavior.
* Open-core line can alienate community if core specs are not truly open.

Cut scope:

* Cut hosted dashboard first, keep CLI + local files.
* Cut marketplace, keep local plugin manifests.
* Cut advanced adapters, keep Codex + local file + one model adapter.
* Cut vector DB, keep deterministic local index.
* Cut auto-consolidation, keep lesson approval and reflection dry-run.
* Cut team workspace, keep single-user local project.

## 21. Final Product Positioning

English:

LMTI is the cognitive kernel for AI agents: an open, model-agnostic standard for intent, attention, memory filesystem, permission, context preflight, failure prediction, executive constraints, lessons, forgetting, evaluation, adapters, and plugins.

Vietnamese:

LMTI là kernel nhận thức cho AI Agent: một chuẩn mở, không phụ thuộc model, giúp chuẩn hóa intent, attention, memory filesystem, permission, context preflight, failure prediction, executive constraints, lesson learning, forgetting, evaluation, adapter và plugin.

Short market line:

Not an app. Not a memory database. Not RAG. LMTI is the operating layer for agent cognition.
