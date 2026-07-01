# ATLAS-0001: Artificial Mind

> Research archive. This document summarizes an early ATLAS vision note. It is
> not current LMTI product scope. Current LMTI is a local AI memory, safety, and
> skill-routing layer for software projects.

Version: 0.1

Status: Archived summary

Read after: `docs/0000_ARCHITECTURE_CONSTITUTION.md`

## Archive Status

This file previously contained a long bilingual vision essay about an
"Artificial Mind" direction for ATLAS. That language is intentionally no longer
used as current product positioning.

The current product definition is narrower:

```text
LMTI is an independent local AI memory, safety, and skill-routing layer for software projects.
```

LMTI does not claim to be a complete Artificial Mind, autonomous brain,
distributed AI platform, or replacement for source-code verification.

## Historical Idea

The archived idea asked whether an AI coding workflow could preserve useful
project knowledge after a task ends instead of repeatedly rediscovering the
same context.

The useful parts of that idea that still inform LMTI are:

- store deliberate project memory instead of raw chat history;
- preserve source references, confidence, privacy, and verification state;
- retrieve only the minimum relevant context for a task;
- protect sensitive knowledge before it reaches an AI agent;
- treat lessons as reviewable candidates, not automatic truth;
- keep language models replaceable behind local contracts.

## Current Translation Into LMTI Scope

| Early ATLAS idea | Current LMTI implementation direction |
|---|---|
| Artificial Mind | Local memory, safety, and skill-routing layer |
| Internal cognitive model | Project Atlas / AMF plus typed memory records |
| Cognitive privacy | Privacy levels, policy gates, and egress checks |
| Evolution | Reviewed lesson candidates and metadata updates |
| Reusable understanding | Verified context retrieval with source references |
| Mind identity | Stable local project identity and adapter contracts |

## Current Boundaries

LMTI should not:

- claim full project understanding;
- claim autonomous learning;
- store secrets as ordinary memory;
- load all memory into prompts;
- replace reading source code and running tests;
- present legacy ATLAS vision as implemented product capability.

LMTI should:

- keep useful project memory local;
- route tasks through Thoth and `skill.md`;
- retrieve privacy-safe context through controlled commands;
- run policy or preflight checks for risky actions;
- record events or lesson candidates with evidence and privacy metadata.

## Product Reality

The practical direction is:

```text
Go is the runtime.
SQLite is the memory.
TOML is the human config.
JSON is the boundary.
skill.md is the task instruction.
Thoth is the skill router.
Policy is the safety layer.
The AI Agent is the executor.
```
