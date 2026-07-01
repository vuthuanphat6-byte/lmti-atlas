# Architecture

LMTI is a local-first project memory and verification layer for AI coding
agents. The current architecture is built around a Codex-first local workflow.

```text
AI Agent Task
     |
     v
Intent Classifier
     |
     v
Context Router
     |
     v
Memory Core + Project Atlas
     |
     v
Privacy Gate
     |
     v
Verification Metadata
     |
     v
Agent Adapter
     |
     v
AI Agent
     |
     v
Lesson Capture
```

## Layers

### AI Agent Task

The task starts as a short human request such as "fix a failing CLI test".
LMTI treats that request as untrusted input until it is routed through intent,
privacy, and verification checks.

### Intent Classifier

The kernel infers task intent and keywords. This helps route context without
loading the whole repository into the prompt.

### Context Router

The context path selects relevant AMF and memory candidates for the task. It
should prefer small, useful, policy-safe context over broad file dumps.

### Memory Core

Memory stores deliberate project knowledge: lessons, rules, decisions, bugs,
routes, deployment notes, and workflow constraints. Memory is guidance, not
truth.

### Project Atlas

`lmti compile` creates `.lmti/project.amf.json`, the current Project Atlas
artifact. It contains structured repository understanding and source-boundary
metadata.

### Privacy Gate

Privacy gates decide whether memory can be loaded, summarized, blocked, or
exported. Secret and `do_not_prompt` memory must not enter normal agent context.

### Verification Metadata

Verification metadata tells an agent what should be checked before acting. The
target contract is documented in [verification-model.md](verification-model.md).

### Agent Adapter

The current adapter surface is a policy contract: preflight builds a safe
context package and validates adapter manifests through sandbox checks. Codex is
the primary workflow today; other agent runtimes are not implemented as
supported delivery paths yet.

### Lesson Capture

After a task, lesson candidates can be proposed through `lmti task done
--lesson ...` or `lmti memory lesson propose`. A candidate becomes durable
project memory only after privacy checks, evidence review, confidence scoring,
and explicit approval. Lessons should be short, safe, and reusable.

## Package Boundaries

```text
packages/types       Shared AMF, memory, privacy, and preflight contracts.
packages/compiler    Project Atlas / AMF compiler.
packages/kernel      Intent inference and AMF Context Pack scoring.
packages/memory      Memory lifecycle, SQLite project memory, retrieval, lessons.
packages/privacy     Redaction, access policy, hard gates, egress scan, audit.
packages/frameworks  Framework detection, commands, risk zones, verify plans.
packages/runtime     Codex context preparation, Action View, runtime orchestration.
packages/security    Tool permission guard.
packages/cli         Command adapter for local workflows.
```
