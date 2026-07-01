# Architecture Boundary Audit

> Historical audit note. The "neural" wording is not current product
> positioning; the useful part of this document is package-boundary review.

Date: 2026-06-29

## Goal

ATLAS modules should behave like one nervous system, not independent helpers
that duplicate context, memory or privacy decisions.

## Canonical Boundaries

| Responsibility | Source of truth |
| --- | --- |
| Shared AMF/context types | `@atlas/types` |
| Intent inference and Context Pack scoring | `@atlas/kernel` |
| Memory lifecycle, retrieval and consolidation | `@atlas/memory` |
| Privacy policy, redaction and egress scanning | `@atlas/privacy` |
| Cognitive focus and global workspace | `@atlas/cognition` |
| World observations, beliefs and reality checks | `@atlas/world-model` |
| Tool permission gates | `@atlas/security` and `@atlas/tools` |
| Runtime orchestration | `@atlas/runtime` |
| CLI argument parsing and JSON output | `@atlas/cli` |

## Findings

1. `@atlas/runtime` had its own `ContextPack` types, scoring helpers and
   `buildContextPack` implementation. That duplicated `@atlas/kernel` and could
   split context behavior.
2. `@atlas/cli` converted Context Packs into cognition/world-model inputs
   locally. That made CLI more than an adapter and risked drift from package
   semantics.
3. Shared context shapes were defined in package-local files instead of
   `@atlas/types`, making dependency boundaries harder to reason about.
4. Runtime session events stored raw message previews. This is useful for
   debugging but can leak secret-like content into logs.

## Changes Applied

1. Promoted `InspectionStats`, `ContextPack` and `ContextPackOptions` to
   `@atlas/types`.
2. Updated `@atlas/kernel` to consume the shared types while remaining the only
   owner of intent inference and Context Pack scoring.
3. Updated `@atlas/runtime` to re-export Context Pack APIs from
   `@atlas/kernel`, call `inferIntent`, run a cognitive cycle over retrieved
   memory, and redact event/title previews via `@atlas/privacy`.
4. Added `contextPackToCognitiveItems` and
   `memorySearchResultsToCognitiveItems` to `@atlas/cognition`.
5. Added `contextPackToSensoryInputs` and `contextPackToBeliefs` to
   `@atlas/world-model`.
6. Updated `@atlas/cli` to call the package mappers instead of owning cognition
   or world-model conversion logic.
7. Added architecture tests to check runtime delegation, CLI adapter behavior
   and acyclic workspace dependencies.

## Remaining Risks

1. `@atlas/context` still exists as a lightweight runtime context loader. It
   should remain a transport adapter only; it must not grow AMF scoring or
   privacy policy logic.
2. `@atlas/cli` still owns substantial preflight orchestration. A future pass
   should move more preflight command orchestration into a package-level service
   while preserving existing commands.
3. Runtime memory writes can still store full local user messages in memory.
   This is intentional local state, but any future external adapter must pass
   through privacy egress scanning before export.
