# @atlas/memory

Structured memory layer for ATLAS.

It includes local `.lmti` memory storage for CLI workflows and in-memory short-term/long-term memory classes for runtime playground sessions.

## Long-Term Memory Engine

The long-term memory path is now an engine, not a keyword-only note store:

```text
Input Event
  -> Encode
  -> Short-Term Buffer
  -> Consolidate
  -> Long-Term Memory
  -> Retrieve
  -> Reinforce / Decay
```

Engine responsibilities live in focused modules:

* `encode.ts` normalizes memory, infers cues, computes priority and creates a privacy-safe summary.
* `consolidate.ts` selects high-priority short-term records for long-term storage.
* `retrieval.ts` scores activation with lexical, intent, association, priority, decay and privacy inputs.
* `decay.ts` weakens stale low-value memory without deleting durable project rules.
* `reinforce.ts` strengthens successful memories and weakens false matches.
* `associations.ts` updates Hebbian-style memory links.
* `review.ts` schedules important memories for review.

Raw chat history is not stored by default. Secret-like content is marked `secret`
with `do_not_prompt`, and context retrieval still passes through the Cognitive
Privacy Layer before anything can enter a prompt or preflight package.
