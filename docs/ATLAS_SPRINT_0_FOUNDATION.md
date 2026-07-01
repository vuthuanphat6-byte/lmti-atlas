# ATLAS Sprint 0: Foundation

> Research archive. This sprint note predates the current Codex-first Local
> Alpha positioning and should not be read as current capability.

Version: 0.1

Status: Active

## Mission

You are **not** implementing features.

You are helping design the foundation of ATLAS.

ATLAS is an Artificial Mind Runtime.

Your first responsibility is to understand the philosophy before writing any
production code.

## Objective

```text
Do not implement ATLAS.

Understand ATLAS.
```

Sprint 0 exists to make Codex think like a Research Engineer before it writes
like a developer.

## Required Reading

Read these before proposing implementation:

1. `AGENTS.md`
2. `docs/0000_ARCHITECTURE_CONSTITUTION.md`
3. `docs/ATLAS-0001_ARTIFICIAL_MIND.md`
4. every accepted RFC in `rfcs/`
5. every philosophy note in `philosophy/`

## Responsibilities

During Sprint 0, the Research Engineer must:

* identify architectural weaknesses,
* challenge assumptions,
* find scalability risks,
* find security risks,
* find performance bottlenecks,
* suggest improvements,
* protect the philosophy of ATLAS.

Never agree automatically.

Think critically.

## Design Questions

For every proposal, ask:

```text
Why?

What problem does this solve?

Can it scale?

Can it evolve?

Can it be replaced?

Can it be secured?

Can it be benchmarked?
```

## Design Deliverables

Before writing framework code, Sprint 0 must stabilize these specifications:

```text
docs/ATLAS-0001_ARTIFICIAL_MIND.md
docs/ATLAS-0002_KNOWLEDGE_COMPILER.md
docs/ATLAS-0003_INTELLIGENCE_GRAPH.md
docs/ATLAS-0004_MEMORY_SYSTEM.md
docs/ATLAS-0005_COGNITIVE_PRIVACY.md
docs/ATLAS-0006_REASONING_ENGINE.md
docs/ATLAS-0007_EVOLUTION_ENGINE.md
docs/ATLAS-0008_RUNTIME.md
docs/ATLAS-0009_SDK.md
docs/ATLAS-0010_MCP.md
```

## RFC Track

RFCs are the reviewable design history of ATLAS.

They capture decisions, rejected alternatives, security implications,
performance concerns, and evolution rules.

No RFC should be accepted only because an approach is common.

An RFC is accepted only when it supports the ATLAS philosophy.

## Philosophy Track

The `philosophy/` directory trains the Research Engineer how to think.

These documents are not API specifications.

They define the cognitive posture of the project.

## Implementation Rule

Never implement because it is common.

Implement only if it supports the ATLAS philosophy.

During Sprint 0, production implementation is blocked until core specifications
are stable.

Allowed Sprint 0 work:

* documentation,
* threat modeling,
* RFC drafting,
* architecture review,
* benchmark design,
* privacy boundary design,
* dependency and module boundary analysis.

Blocked Sprint 0 work:

* production runtime code,
* production SDK code,
* production database schema,
* vendor-specific LLM integration,
* long-term storage implementation,
* irreversible architecture decisions without RFC review.

## Success Criteria

Sprint 0 is complete only when:

* architecture is internally consistent,
* every module has a single responsibility,
* every dependency is intentional,
* security is designed before implementation,
* cognitive privacy boundaries are explicit,
* benchmark strategy exists before optimization,
* Codex fully understands ATLAS philosophy.

Only then begin Sprint 1.

## Sprint 1 Direction

Sprint 1 must not build the full ATLAS framework.

Sprint 1 should prove the smallest executable claim:

```text
Repository / Docs / API / Database
  ->
atlas compile
  ->
project.amf
```

The first PoC is the Knowledge Compiler, not Runtime, SDK, MCP, Memory or Graph.

The first artifact is `.amf`, the Artificial Mind Format.

This changes the practical ordering without changing the philosophy:

```text
Do not build framework first.

Build the compiler that proves understanding can be compiled.
```

Sprint 1 is allowed to create a research executable only if:

* it does not become a production framework,
* it has an explicit AMF format contract,
* it refuses to store raw repositories as knowledge,
* it includes privacy and secret-redaction boundaries,
* it can be benchmarked against repeated raw scanning,
* its output can be inspected without rereading source.

If `atlas compile` cannot produce reusable Project DNA, the rest of ATLAS has no
foundation.

## Open Architecture Consistency Issue

The Architecture Constitution currently lists:

```text
0009 SDK
0010 MCP
```

The Sprint 0 proposal originally listed:

```text
0009 MCP
0010 SDK
```

Until this is explicitly resolved, Sprint 0 uses the Constitution order:

```text
0009 SDK
0010 MCP
```

This avoids silently changing the canonical RFC sequence.
