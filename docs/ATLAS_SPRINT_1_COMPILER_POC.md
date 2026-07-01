# ATLAS Sprint 1: Knowledge Compiler PoC

> Research archive. Current Project Atlas behavior is documented in the root
> README and `docs/cli.md`.

Version: 0.1

Status: Proposed

## Mission

Build exactly one proof-of-concept executable:

```text
atlas compile
```

Do not build the ATLAS framework.

Do not build Runtime.

Do not build SDK.

Do not build MCP.

Do not build Memory.

Prove that ATLAS can compile a project into reusable understanding.

## Core Hypothesis

```text
Repository / Docs / API / Database
  ->
atlas compile
  ->
project.amf
```

If this works, ATLAS has its first living artifact.

If this fails, every later component is premature.

## Artifact

The output artifact is:

```text
PROJECT.amf
```

AMF means Artificial Mind Format.

AMF is the bytecode of ATLAS.

It is Project DNA, not raw memory.

## Initial Command

```text
atlas compile ./noir
```

Example output:

```text
Generating Mind...

Modules...
Rules...
Dependencies...
Architecture...

Done.

sample-project.amf generated.
```

## Minimum AMF Domains

```text
Project
Modules
Business Rules
API
Database
Dependencies
Risk
History
Architecture
Summary
```

## Rules

Sprint 1 must obey these rules:

* build one executable path only,
* produce one `.amf` artifact,
* do not execute target project code,
* do not install target project dependencies,
* do not store raw repositories as AMF,
* do not send raw project data to external models by default,
* do not depend on one LLM vendor,
* mark uncertainty explicitly,
* redact or exclude obvious secrets,
* keep the output inspectable.

## Out of Scope

```text
atlas inspect
atlas ask
ATLAS Runtime
ATLAS SDK
MCP server
Memory database
Graph database
Cloud sync
Plugin ecosystem
```

These come after `atlas compile` proves value.

## Success Criteria

Sprint 1 succeeds only when:

* `atlas compile <path>` runs locally,
* a `.amf` file is generated,
* AMF contains structured Project DNA,
* AMF excludes raw source bulk,
* AMF includes privacy markings,
* AMF includes confidence or uncertainty,
* basic inspection can be done without scanning the repository again,
* secret leakage checks pass on known test fixtures.

## Failure Criteria

Sprint 1 fails if:

* the output is only a prose summary,
* the output is only raw JSON from files,
* the compiler executes target project code,
* the compiler leaks secrets into AMF,
* the compiler requires a specific LLM vendor,
* downstream questions still require full raw repository scans.

## Next Sprint

Sprint 2 may build:

```text
atlas inspect project.amf
```

Only after Sprint 1 proves that AMF is useful.
