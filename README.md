# LMTI - Atlas

LMTI helps AI stop wandering around your project. It compiles project
understanding into a local mind file so coding agents can work with better
context and fewer repeated scans.

Everything runs locally. LMTI does not require cloud services, external AI APIs
or a specific language model.

## Quick Start

```bash
npx lmti init
npx lmti compile
npx lmti attach codex
npx lmti context "fix packing label bug"
```

After `attach codex`, Codex can read `AGENTS.md`, discover the LMTI guidance and
prefer `.lmti/project.amf.json` plus local Context Packs over repeated full-repo
scans.

## Repository As Research Room

LMTI is not only source code.

The repository keeps implementation, philosophy, research notes, papers and
experiments close together:

```text
README.md
docs/
research/
philosophy/
papers/
experiments/
packages/
```

Start with `philosophy/` if you want to understand why the project exists.

## Current Research Hypothesis

LMTI tests whether a compiled project mind can reduce unnecessary project
exploration for AI agents.

The current implementation demonstrates a local estimate: it compares a naive
keyword-search exploration path with the files selected from compiled AMF. It
does not claim real token savings, model-quality gains or production-grade
Artificial Mind behavior.

## Project Operating Memory

LMTI is not a file dump.
LMTI is project operating memory.

It should remember:

* rules
* decisions
* bugs
* lessons
* routes
* permissions
* deployment notes
* debugging experience

It should NOT blindly remember:

* raw chat history
* every file
* every prompt
* every random note

## Long-Term Memory Engine

Long-term memory now has a lifecycle:

```text
Input Event
  -> Encode
  -> Short-Term Buffer
  -> Consolidate
  -> Long-Term Memory
  -> Retrieve
  -> Reinforce / Decay
```

Each long-term memory can carry activation metadata such as `memoryStrength`,
`baseActivation`, `retrievalCount`, `decayRate`, `stability`, `priorityScore`,
`contextCues`, associations, supersession status and review scheduling.

Retrieval is no longer only keyword search. LMTI combines lexical match, task
intent, context cues, association weight, priority, recency/decay and privacy
penalties. `secret` and `do_not_prompt` memories are excluded from normal
context, confidential memory is summarized, and superseded or archived memory is
kept as history instead of source truth.

Useful commands:

```bash
node packages/cli/dist/index.js memory consolidate
node packages/cli/dist/index.js memory decay
node packages/cli/dist/index.js memory reinforce <id> --success true
node packages/cli/dist/index.js memory reinforce <id> --success false
node packages/cli/dist/index.js memory review
node packages/cli/dist/index.js memory associations <id>
node packages/cli/dist/index.js memory explain "partner permission route"
```

After a task reveals reusable project knowledge, record a lesson deliberately:

```bash
node packages/cli/dist/index.js task done --title "..." --summary "..." --lesson "..."
```

## Cognitive Orchestrator

`@atlas/cognition` adds the deterministic orchestration layer above memory,
kernel, privacy and runtime. It does not claim consciousness. It estimates
context integration, tracks prediction error, arbitrates global workspace focus
and broadcasts only policy-safe summaries or metadata.

```bash
node packages/cli/dist/index.js cognition run "dashboard Agent 403 permission"
node packages/cli/dist/index.js cognition explain "dashboard Agent 403 permission"
node packages/cli/dist/index.js cognition state
```

The cognition package consumes already-selected context candidates. It does not
read raw secret memory, call external AI APIs or duplicate kernel Context Pack
scoring.

## World Model

`@atlas/world-model` adds a Reality Boundary between the internal project mind
and external observations such as user input, source evidence, test output, CLI
output and tool/runtime signals.

It treats memory as prior belief, not reality. Source code, tests, tool output
and explicit user instruction are observations. When memory conflicts with an
observation, the world model lowers confidence, reports prediction error and
proposes the next safe action. It never executes tools directly.

```bash
node packages/cli/dist/index.js world check "fix partner dashboard 403"
node packages/cli/dist/index.js world cost "fix partner dashboard 403"
node packages/cli/dist/index.js world align "fix partner dashboard 403"
node packages/cli/dist/index.js world observe "current test output summary"
```

All sensory input passes through a Markov Blanket. Secret-like content is
redacted and marked `do_not_prompt` before it can enter cognition or context.

## Neural Architecture Boundaries

ATLAS now keeps one source of truth per cognitive responsibility:

```text
@atlas/types
  -> shared AMF, Context Pack and memory/privacy contracts
@atlas/kernel
  -> intent inference and Context Pack scoring
@atlas/memory
  -> memory lifecycle, retrieval, consolidation and privacy-safe summaries
@atlas/privacy
  -> access policy, redaction, hard gates and egress scans
@atlas/cognition
  -> cognitive focus, global workspace and Context Pack -> cognition mapping
@atlas/world-model
  -> observations, beliefs, reality checks and Context Pack -> world mapping
@atlas/runtime
  -> orchestrates memory, kernel, cognition, tools and security
@atlas/cli
  -> parses commands and prints package results
```

`@atlas/runtime` must not own Context Pack scoring. It re-exports the old
`buildContextPack`, `inspectAmf` and `formatInspection` APIs from
`@atlas/kernel` for compatibility. CLI commands remain stable while cognition
and world-model conversion logic lives in their domain packages.

## Security Model

LMTI treats project knowledge as sensitive by default.

- Local-first: no external AI API is required.
- No raw secret export: CLI and adapter output pass through redaction/egress scanning.
- Privacy-gated memory: `secret` and `do_not_prompt` memory cannot enter normal context.
- Policy-safe adapter output: adapters default to `external_model`, no raw secret, no raw confidential.
- Tool execution through `SecurityGuard`: dangerous permissions are denied by default.
- Target projects are untrusted input: compile reads files only, skips ignored secret files and symlinks, and does not execute target code.
- Memory is prior belief, not verified truth: source/test/tool/user evidence wins in security-sensitive flows.

Security docs:

```text
docs/security/THREAT_MODEL.md
docs/security/PRIVACY_POLICY.md
docs/security/SECURITY_BOUNDARIES.md
docs/security/ADAPTER_SECURITY.md
docs/security/SECURITY_CHECKLIST.md
```

## Current Scope

LMTI - Atlas is currently a local PoC for compiling project knowledge,
assembling Context Packs and running the first exploration-reduction
experiment.

Current status: minimal compiler, Mind Kernel, CLI, structured local memory,
cognitive privacy helpers and an experimental runtime playground.

It still does not require RAG, a vector database, cloud services or an external
LLM API key.

It builds one foundation:

```text
project
  ->
lmti compile
  ->
.lmti/project.amf.json
  ->
Mind Kernel
  ->
Context Pack
```

## Sprint 1 Mind Kernel

`@atlas/kernel` is the smallest independent Mind Kernel. It does not parse
repositories or know programming languages. It only loads AMF, validates the
minimum structure, inspects Project DNA and produces Context Packs from
cognitive structures.

Sprint 1 path:

```text
Repository
  ->
Mind Compiler
  ->
Artificial Mind Format (AMF)
  ->
Mind Kernel
  ->
Context Pack
```

## First Experiment

LMTI does not try to make the model bigger. LMTI tries to reduce unnecessary
thinking by giving agents a compiled project mind.

Without LMTI:

```text
Agent searches many files.
```

With LMTI:

```text
Agent loads .lmti/project.amf.json and focuses only on relevant modules/files.
```

Run the first local experiment:

```bash
node packages/cli/dist/index.js experiment thinking "fix packing label bug"
```

The report is saved to:

```text
.lmti/experiments/EXP-0001-thinking.json
```

## What Works Now

* `lmti init` creates local `.lmti` state.
* `lmti compile` creates `.lmti/project.amf.json`.
* `lmti context "<task>"` returns a local JSON Context Pack.
* `lmti experiment thinking "<task>"` saves a local exploration estimate report.
* `lmti attach codex` updates `AGENTS.md` without deleting existing content.
* `lmti remember` stores deliberate project lessons, rules and decisions.
* `lmti task done` records task completion events and optional lessons.

## Intentionally Not Implemented

* No external AI API integration.
* No cloud service.
* No vector database.
* No automatic code execution from target projects.
* No claim that LMTI is already a complete Artificial Mind.

## Known Limitations

* Compiler parsing is heuristic and focused on JS/TS, docs and database files.
* Experiment metrics are estimates, not measured agent traces.
* The runtime/playground packages are experimental and not required for the PoC
  CLI flow.
* Secret detection is pattern-based and should be treated as a safety net, not a
  substitute for secret scanning.

## Next Research Steps

* Compare estimated exploration against real agent traces.
* Improve AMF summaries without storing raw repositories.
* Add benchmarks for false-positive and false-negative Context Pack selection.
* Keep privacy and local-first operation as hard constraints.

## Commands

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm test
node packages/cli/dist/index.js init
node packages/cli/dist/index.js compile ./examples/sample-project
node packages/cli/dist/index.js attach codex
node packages/cli/dist/index.js experiment thinking "fix packing label bug"
node packages/cli/dist/index.js memory add --scope long_term --kind rule --title "Packing label rule" --content "A shipping label can only be printed when all products in the same label group are completed."
node packages/cli/dist/index.js memory search "packing label"
node packages/cli/dist/index.js remember --kind lesson --title "Partner route rule" --content "Partner user must route to /partner. /dashboard/summary returning 403 is correct due to least privilege." --tags partner,routing,permission,dashboard --sensitivity internal --prompt-policy summarize_only
node packages/cli/dist/index.js task done --title "Partner route fix" --summary "Confirmed partner route behavior." --lesson "Partner user must route to /partner."
node packages/cli/dist/index.js inspect
node packages/cli/dist/index.js context "fix packing label bug"
```

If `pnpm` is already enabled on your machine, the equivalent `pnpm install`,
`pnpm build` and `pnpm test` commands work as well.

## Core AI Runtime

`@atlas/runtime` now provides the first runnable Core AI Runtime:

```ts
import { createDefaultRuntime } from "@atlas/runtime";

const runtime = createDefaultRuntime();
const session = runtime.startSession({ agentId: "developer" });
const result = await runtime.sendMessage(session.id, "fix packing label bug");
console.log(result.response.message);
```

Core pieces:

* `CoreRuntime`: orchestrates sessions, context, memory, agents, tools and security.
* `RuntimeSession`: active conversation/session state.
* `RuntimeEvent`: auditable runtime events.
* `RuntimeResult`: agent response plus context and event history.
* `SecurityGuard`: permission gate before every tool execution.

## Playground

Run the local CLI playground:

```bash
corepack pnpm build
node apps/playground/dist/index.js
```

Run scripted smoke scenarios:

```bash
node apps/playground/dist/index.js --scenario
```

Playground commands:

```text
/agent developer|business|security
/memory add <text>
/memory short
/memory long
/tool echo <text>
/tool admin
/audit
/clear
/exit
```

The default playground security policy allows `read` and `execute`, and blocks
`network`, `filesystem`, `database` and `admin`.

## Local Storage

LMTI writes local state to:

```text
.lmti/
  config.json
  project.amf.json
  index.json
  memory/
    short-term.json
    long-term.json
    lessons.json
    events.jsonl
  events/
    tasks.jsonl
  cache/
  logs/
```

`.lmti/` is ignored by git because compiled cognition may contain internal
project knowledge.

## Legacy Atlas Migration

Early Atlas prototypes may have written project mind state to `.atlas/`,
`atlas/`, `project.amf.json`, `atlas.project.amf.json`, `mind.atlas` or
`*.atlas` files. Current LMTI uses one canonical active mind:

```text
.lmti/project.amf.json
```

If you used the early Atlas prototype, run:

```bash
lmti doctor
lmti doctor --fix
lmti migrate --yes
```

`lmti doctor` reports duplicate Atlas/LMTI files, missing canonical files and
conflicting AMF files. `lmti doctor --fix` recreates missing `.lmti` folders,
normalizes config and migrates legacy state when it is safe. `lmti migrate
--yes` copies legacy Atlas data into `.lmti` and writes a migration report to
`.lmti/logs/migration-YYYYMMDD-HHmmss.json`.

Migration never deletes old Atlas files automatically. After confirming
`.lmti/project.amf.json` is correct, archive or remove legacy files manually if
your project policy allows it.

## Artificial Mind Format v0

The Sprint 1 output is `.lmti/project.amf.json`.

Top-level domains:

```json
{
  "project": {},
  "modules": [],
  "files": [],
  "symbols": [],
  "dependencies": [],
  "api": [],
  "database": [],
  "rules": [],
  "risks": [],
  "history": [],
  "architecture": [],
  "summaries": [],
  "unresolvedQuestions": []
}
```

## Memory Core

ATLAS stores structured memory, not raw chat history.

Short-term memory is for active task context and can expire. Long-term memory is
for confirmed project knowledge such as decisions, rules, bugs, risks,
preferences and experiences.

Examples:

```bash
node packages/cli/dist/index.js memory add --scope short_term --kind task --title "Fix packing label bug" --content "Current task is about blocking label printing until all products are completed."

node packages/cli/dist/index.js memory add --scope long_term --kind rule --title "Packing label rule" --content "A shipping label can only be printed when all products in the same label group are completed."

node packages/cli/dist/index.js memory search "packing label"

node packages/cli/dist/index.js context "fix packing label bug"
```

Memory sensitivity is mandatory in the API and defaults to `internal` in the CLI.

Prompt policy controls whether memory may enter a Context Pack:

* `allow_raw`: raw content may appear only when sensitivity rules permit it.
* `summarize_only`: context receives task-relevant summaries, not full memory.
* `do_not_prompt`: memory is never sent into normal context.

`lmti context` infers task intent before selecting memory. It returns
`inferredIntent`, scores, selection reasons and `filteredOut` counts. By
default, low-score unrelated memory is filtered; pass `--include-low-score`
only when auditing context selection.

Context safety:

* `public` and `internal` memory can appear normally in context output.
* `confidential` memory appears only as summarized metadata.
* `secret` memory is excluded from normal context.

Strict context privacy:

* `internal` memory is summarized by default; raw internal memory requires
  `--role owner --include-raw`.
* `confidential` memory is always summarized in context.
* `secret` memory is excluded from normal context; owner metadata access uses
  `--include-secret-meta`.
* `do_not_prompt` memory is excluded from context.
* Context privacy filtering is audited in `.lmti/logs/privacy-audit.jsonl`.

Runtime memory:

* `ShortTermMemory`: session-local task and reasoning context.
* `LongTermMemory`: durable confirmed knowledge.
* `InMemoryStore`: Phase 4 in-memory implementation, replaceable later with SQLite, Postgres, file storage or vector storage.

## Agents

`@atlas/agents` ships three deterministic sample agents:

* `DeveloperAgent`: technical/code analysis and implementation guidance.
* `BusinessAgent`: business requirements, module boundaries and roadmap thinking.
* `SecurityAgent`: permission, data exposure and risky action review.

Create a new agent by implementing `AgentDefinition` and registering it:

```ts
runtime.registerAgent({
  id: "custom",
  name: "Custom Agent",
  role: "developer",
  instructions: {
    objective: "Do one focused job.",
    boundaries: ["Use runtime callbacks for tools."]
  },
  async respond(message, context) {
    const result = await context.executeTool("memory.search", { query: message });
    return {
      agentId: "custom",
      role: "developer",
      message: `Handled: ${message}`,
      toolResults: [result]
    };
  }
});
```

Agents receive `executeTool` from runtime and should not bypass security.

## Tools

`@atlas/tools` provides:

* `ToolRegistry`
* `echoTool`
* `memorySearchTool`
* `auditLogTool`

Create a new tool:

```ts
runtime.registerTool({
  name: "project.read",
  description: "Read safe project metadata.",
  permissionRequired: "read",
  async execute(input, context) {
    return { ok: true, data: { input } };
  }
});
```

Every tool registered through `ToolRegistry` is checked by `SecurityGuard`
before execution.

## Security Policy

Runtime tool permissions:

```text
read
write
execute
network
filesystem
database
admin
```

Example:

```ts
runtime.attachSecurityPolicy({
  id: "local-dev",
  name: "Local Dev",
  permissions: ["read", "execute"],
  defaultDecision: "deny"
});
```

Denied tool executions return a clear error and still create audit entries.

## Cognitive Privacy Layer

ATLAS enforces privacy before memory is returned to CLI output or Context Packs.

Roles:

```text
owner
maintainer
developer
agent
readonly
external_model
```

Examples:

```bash
node packages/cli/dist/index.js memory list --role developer
node packages/cli/dist/index.js memory search "packing" --role agent
node packages/cli/dist/index.js context "fix packing label bug" --role agent
node packages/cli/dist/index.js context "fix payment bug" --role external_model
node packages/cli/dist/index.js context "fix payment bug" --role owner --include-secret
```

Privacy reports:

```bash
node packages/cli/dist/index.js privacy audit
node packages/cli/dist/index.js privacy check
```

Policy summary:

* `public`: allowed by default.
* `internal`: allowed for owner, maintainer, developer and agent.
* `confidential`: summarized by default; raw only for owner/maintainer with explicit raw access.
* `secret`: denied by default; raw only for owner with `--include-secret`.
* `external_model`: never receives raw confidential or secret memory.

Sensitive access to confidential and secret memory is written to:

```text
.lmti/privacy/audit.jsonl
```

Safe context example:

```bash
node packages/cli/dist/index.js memory add --scope long_term --kind rule --title "Payment secret" --content "password=example-placeholder" --sensitivity secret
node packages/cli/dist/index.js context "fix payment bug" --role external_model
node packages/cli/dist/index.js privacy audit
```

The external-model context must not expose the secret content.

## Security Boundaries

`lmti compile` treats target repositories as untrusted input.

MVP-0:

* does not execute target project code,
* does not install target dependencies,
* ignores `.git`, `node_modules`, `dist`, `build`, `.lmti`, `.atlas` and cache folders,
* detects obvious secret-like patterns,
* redacts secret values from AMF evidence,
* stores summaries and metadata instead of raw source content.

## Package Boundaries

```text
packages/types     AMF v0 types and constants
packages/graph     Dependency graph helpers
packages/compiler  Knowledge Compiler v0
packages/kernel    Minimal Mind Kernel for AMF loading, inspection and Context Packs
packages/migration Legacy Atlas detection, migration and storage doctor helpers
packages/memory    Local AMF and structured memory storage
packages/privacy   Cognitive privacy helpers
packages/security  Runtime permission guard and audit log
packages/tools     Tool registry and sample tools
packages/agents    Agent definitions and sample agents
packages/context   App context assembly
packages/reasoning Reasoning placeholders for future sprints
packages/runtime   Core AI Runtime plus AMF inspect/context helpers
packages/cli       lmti executable
packages/mcp       MCP-ready local stub
apps/playground    Local runtime playground
```

## Phase 4 Roadmap

Phase 4B should focus on:

* persistent runtime memory store backed by encrypted local files or SQLite,
* richer agent planning while keeping tool execution behind `SecurityGuard`,
* web UI playground if the CLI scenarios stabilize,
* deeper integration between AMF context packs and runtime sessions,
* policy profiles for developer, agent and external model execution.
