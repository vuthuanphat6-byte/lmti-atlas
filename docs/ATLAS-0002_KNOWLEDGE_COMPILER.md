# ATLAS-0002: Knowledge Compiler

Version: 0.1

Status: Draft

Read after:

1. `docs/0000_ARCHITECTURE_CONSTITUTION.md`
2. `docs/ATLAS-0001_ARTIFICIAL_MIND.md`
3. `docs/ATLAS_SPRINT_0_FOUNDATION.md`

## Purpose

The Knowledge Compiler is the first practical proof that ATLAS exists.

It answers one question:

> Can a project be compiled into reusable understanding?

If the answer is no, ATLAS becomes another memory system, graph system or
retrieval wrapper.

If the answer is yes, ATLAS has its first artifact of cognition.

## Compiler-First Decision

ATLAS must not begin with Runtime, SDK, MCP, Memory or Graph.

Those components depend on compiled understanding.

Therefore the first executable proof of ATLAS is:

```text
atlas compile
```

The first durable artifact is:

```text
project.amf
```

AMF means Artificial Mind Format.

AMF is the bytecode of ATLAS.

## Analogy

```text
C++
  ->
gcc
  ->
executable
```

```text
Repository / Docs / API / Database
  ->
atlas compile
  ->
project.amf
```

The compiler is not the whole system.

But without the compiler, the rest of the system has nothing meaningful to run.

## Input

The compiler observes a project boundary, for example:

```text
project/
  src/
  docs/
  database/
  api/
  git/
```

Inputs may include:

* source code,
* documentation,
* API definitions,
* database schemas,
* dependency manifests,
* configuration templates,
* git history metadata,
* architecture notes,
* test files.

Inputs must be treated as untrusted.

## Output

The compiler produces an AMF file:

```text
NOIR.amf
```

The AMF file is Project DNA.

It is not a vector index.

It is not a JSON dump.

It is not raw source code.

It is a structured representation of compiled understanding.

## Project DNA

AMF v0 must preserve these domains:

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

Each domain must contain meaning, not raw bulk data.

For example, ATLAS should not store every line of source code.

ATLAS should store:

* which module exists,
* what responsibility it owns,
* what boundary it protects,
* what rule it implements,
* what dependencies it relies on,
* what risks it introduces,
* what confidence ATLAS has in that understanding.

## CLI Contract

The first PoC command is:

```text
atlas compile ./noir
```

Expected output shape:

```text
Generating Mind...

Modules...
Rules...
Dependencies...
Architecture...

Done.

NOIR.amf generated.
```

The progress UI is not the product.

The AMF artifact is the product.

## v0 Scope

Knowledge Compiler v0 should compile only enough understanding to prove the
model:

* project identity,
* module inventory,
* dependency inventory,
* obvious API surfaces,
* database schema summaries when present,
* business-rule candidates,
* security-risk candidates,
* architecture summary,
* confidence levels,
* unresolved questions.

v0 should prefer explicit uncertainty over false confidence.

## Non-Goals

Knowledge Compiler v0 must not:

* build a full runtime,
* build memory storage,
* build a graph database,
* build an MCP server,
* build a vendor-specific LLM integration,
* store the entire repository inside AMF,
* treat embeddings as knowledge,
* treat prompt history as knowledge.

## Security Model

Compilation is a high-risk operation because it observes an entire project.

The compiler must assume the input project may contain:

* secrets,
* malicious files,
* unsafe scripts,
* misleading documentation,
* vulnerable dependencies,
* generated noise,
* private business logic.

Knowledge Compiler v0 must:

* never execute project code during compilation,
* never run install scripts as part of compilation,
* never send raw project data to external models by default,
* redact secrets before writing AMF,
* mark sensitive findings as protected cognition,
* record confidence and source categories without embedding raw secrets,
* exclude ignored files and common secret locations unless explicitly allowed.

[CẢNH BÁO BẢO MẬT]

The compiler must treat source repositories as hostile input. A malicious
repository can contain prompt-injection text, poisoned documentation, oversized
files, symlink traps or secret material. `atlas compile` must parse defensively
and must not execute code from the target project.

## AMF Boundary

AMF is not required to be binary in v0.

But it must be treated as a format, not an incidental output file.

AMF v0 must define:

* version,
* project identity,
* compiler metadata,
* source boundary,
* compiled domains,
* privacy markings,
* confidence scores,
* unresolved questions,
* checksum or integrity metadata.

Future AMF versions may become binary, compressed or signed.

v0 may remain human-inspectable to make review and debugging easier.

## Benchmark Claim

The compiler exists to reduce repeated raw scanning.

Therefore v0 must be benchmarkable against this claim:

```text
Using project.amf should answer architecture questions with less raw source
scanning than starting from the repository every time.
```

Minimum benchmark dimensions:

* compile time,
* AMF size,
* source files observed,
* raw bytes excluded,
* repeated-scan reduction,
* question-answer usefulness,
* false confidence rate,
* secret leakage rate.

## Success Criteria

Knowledge Compiler v0 succeeds only if:

* `atlas compile <project>` produces a `.amf` file,
* `.amf` contains Project DNA, not raw repository storage,
* the output can be inspected without rereading the full source tree,
* obvious secrets are redacted or excluded,
* uncertain findings are marked as uncertain,
* the format can evolve without rewriting the entire system,
* the compiler can be replaced without replacing ATLAS.

## Failure Criteria

The PoC fails if:

* `.amf` is just a summary document,
* `.amf` is just JSON-shaped raw data,
* the compiler depends on one LLM vendor,
* the compiler needs to execute target project code,
* sensitive information is copied into AMF in raw form,
* downstream tools still need to rescan the repository for basic architecture
  questions.

## Future Commands

The compiler unlocks later commands:

```text
atlas inspect project.amf
atlas ask project.amf "How does packing work?"
```

These commands must read AMF first.

They should not reread source unless AMF is missing, stale or insufficient.

## Research Questions

Before implementation, Sprint 1 must answer:

* Is AMF v0 text-based, structured binary, or hybrid?
* What exact schema represents Project DNA?
* How are privacy markings encoded?
* How are source references represented without storing raw source?
* How does ATLAS detect stale AMF files?
* What must be redacted before AMF is written?
* How can AMF be signed or checksummed later?
* What minimal language and project types does v0 support?
