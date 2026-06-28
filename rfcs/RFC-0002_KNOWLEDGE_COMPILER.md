# RFC-0002: Knowledge Compiler

Status: Draft

## Question

How does ATLAS compile raw information into reusable understanding?

## Current Position

The Knowledge Compiler is the first PoC of ATLAS.

ATLAS should not begin with Runtime, SDK, MCP, Memory or Graph.

It should begin with:

```text
atlas compile
  ->
project.amf
```

`project.amf` is AMF: Artificial Mind Format.

AMF is the Project DNA artifact that later Runtime, Memory, Graph, Reasoning,
SDK and MCP layers can consume.

## Scope

This RFC will define the Knowledge Compiler as a cognition component, not as a
file scanner or summarizer.

## Required Design Pressure

The RFC must answer:

* What is compiled knowledge?
* What raw information is rejected?
* How is sensitive knowledge classified before compilation?
* How does the compiler avoid repeated repository scanning?
* How are compiler outputs verified?
* How can the compiler be replaced without replacing ATLAS?
* What is the minimum AMF schema?
* How does the compiler redact secrets before writing AMF?
* How does ATLAS detect stale or incomplete AMF?

## Non-Goals

* storing entire repositories,
* treating embeddings as knowledge,
* binding compilation to one LLM provider,
* producing unverified memory,
* executing project code during compilation,
* producing a raw JSON dump and calling it cognition.

## Security Requirements

The compiler must treat repositories as hostile input.

It must not execute target project code.

It must not run package install scripts.

It must not copy raw secrets into AMF.

It must mark sensitive findings as protected cognition.

## Linked Specification

See `docs/ATLAS-0002_KNOWLEDGE_COMPILER.md`.
