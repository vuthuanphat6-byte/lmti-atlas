# @atlas/cognition

Deterministic Cognitive Orchestrator for LMTI.

This package does not claim consciousness. It models a local, privacy-first
project mind loop:

```text
working memory + long-term memory + context candidates
  -> integrated information estimate
  -> prediction state
  -> global workspace arbitration
  -> policy-safe broadcast
  -> cognitive state explanation
```

`@atlas/cognition` does not read raw memory stores, call external AI APIs or
create a vector database. Callers provide already-selected, policy-aware
context candidates from `@atlas/memory`, `@atlas/kernel`, preflight or runtime.

Core APIs:

* `estimateIntegratedInformation`
* `createPredictionState`
* `estimatePredictionError`
* `CognitiveBlackboard`
* `selectWorkspaceWinner`
* `broadcastWorkspace`
* `arbitrateCognitiveFocus`
* `runCognitiveCycle`
* `explainCognitiveState`

Secret and `do_not_prompt` entries are never broadcast as raw content.
