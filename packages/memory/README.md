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

## Project Operating Memory

The production-oriented long-term memory path is backed by local SQLite:

```text
.lmti/memory/project-memory.sqlite
```

This layer uses Node's built-in `node:sqlite` runtime API. The rest of the
package remains import-compatible without opening SQLite, but these commands
require a Node runtime that provides `node:sqlite` (tested on Node 24).

It adds:

* FTS5 full-text search with BM25 ranking.
* Schema-versioned SQLite migrations. Version 3 adds `content_hash` for
  tamper/staleness checks without storing raw secret material.
* Library zones: `architecture`, `codebase`, `workflow`, `deployment`,
  `security`, `decision`, `lesson`, `incident`, `customer`, `business`,
  `prompting` and `unknown`.
* Write-time privacy gate that redacts secret-like material before storage.
* Retrieval-time privacy gate that blocks `secret` and `do_not_prompt` memory
  before AI prompt assembly.
* Post-task lessons through `saveLessonAfterTask`.
* Short Memory notes for temporary task context with TTL, FTS5 retrieval,
  expiration, cleanup and explicit promotion into Long Memory.

CLI:

```bash
lmti memory init
lmti memory add --title "Partner dashboard 403" --content "Partner user must route to /partner."
lmti memory search "dashboard 403 partner"
lmti memory retrieve "fix partner dashboard permission"
lmti memory lesson --task "Partner route fix" --lesson "Partner user must route through /partner."
lmti memory stats
lmti memory privacy-check
lmti memory short:add --title "Current checkpoint" --content "Inspect retrieval next." --priority medium
lmti memory short:retrieve "retrieval"
lmti memory short:expire
lmti memory short:cleanup --dry-run
lmti memory short:evaluate <noteId>
lmti memory short:promote <noteId> --reason "Durable lesson"
lmti memory context "fix partner dashboard permission"
```

Legacy JSON memory remains available for compatibility via commands that pass
`--scope ... --legacy`.

Short Memory is not durable truth. Priority controls the default TTL: `low` 6h,
`medium` 24h, `high` 3d and `critical` 7d. Retrieval ranks active notes by
FTS5/BM25, recency, priority, matching tags, promote score and access count.
Promotion to Long Memory is explicit and blocked for `secret` or
`do_not_prompt` notes.
