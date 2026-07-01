# LMTI Foundation Audit And Plan

This document records the current foundation map and the next safe refactor path. LMTI memory is advisory context; source code, tests and command output remain the verification source.

## Current Map

- `packages/memory` owns long-term memory, short memory, SQLite storage, FTS5 retrieval, lifecycle, lessons and privacy-aware retrieval.
- `packages/privacy` owns sensitivity policy, redaction, egress scanning and audit integrity.
- `packages/kernel` owns AMF inspection, intent inference and AMF context pack scoring.
- `packages/runtime` owns agent-facing orchestration such as `prepareCodexContext`, generic agent context preparation and action replay.
- `packages/cli` is the command adapter. It currently contains some orchestration code that should move toward package-owned APIs over time.
- `packages/compiler` builds `.lmti/project.amf.json` as Project Atlas-style compiled understanding, with `.lmtiignore` source-boundary rules.
- `packages/migration` owns `.atlas` to `.lmti` migration and `doctor` storage/AMF diagnostics.

## Stable Foundations

- SQLite project memory exists at `.lmti/memory/project-memory.sqlite`.
- FTS5/BM25 retrieval exists for project memory and short memory.
- Write-time and retrieval-time privacy gates exist for memory.
- Adapter manifests and preflight sandbox checks exist for known and file-based adapters.
- `lmti doctor`, `lmti compile`, `lmti memory stats`, `lmti context`, `lmti preflight` and lesson capture paths exist.

## Weak Spots

- Memory context has privacy and ranking metadata, but verification metadata is not yet a first-class contract on every returned item.
- CLI has useful commands but not all requested aliases (`lmti atlas build`, `lmti context build`, `lmti adapter list/test`) are present.
- Some adapter logic still lives inside `packages/cli` instead of a reusable adapter package boundary.
- Project Atlas is represented by AMF, but staleness/refresh policy should become explicit.
- Legacy `.atlas/project.amf.json` can coexist with `.lmti/project.amf.json`; `doctor` warns, but legacy cleanup is manual.

## Foundation Sequence

1. Storage + schema
   - Acceptance: schema version is visible, migrations are idempotent, records have `content_hash`, privacy write gate runs before persistence, tests cover migration.
2. Privacy gate
   - Acceptance: secret/do_not_prompt never exits memory/context/CLI output, tests cover API key, private key, DB URL, token, cookie, session and password patterns.
3. Memory retrieval
   - Acceptance: retrieval returns relevance, importance, freshness, confidence, privacy mode and verification hints without raw blocked content.
4. Context router
   - Acceptance: task intent selects memory zones, ranks candidates, compresses output and labels facts versus hints.
5. Project Atlas
   - Acceptance: AMF/Atlas includes checksum, timestamp, package manager, commands, ignored zones, legacy zones and refresh-needed signal.
6. Lesson capture
   - Acceptance: lesson writeback has scoring, source refs, command evidence and privacy gate.
7. Agent adapter
   - Acceptance: adapter contract is reusable outside Codex and at least one known adapter passes sandbox/preflight tests.
8. CLI polish
   - Acceptance: new aliases call existing package APIs, output stays short, and smoke tests prove commands.
9. Tests + docs
   - Acceptance: build/test/doctor/privacy/context smoke commands are recorded with real output before claiming completion.

## Current Slice

The current foundation slice adds schema-versioned content hashes to project and short memory rows. This supports future verification, stale-memory checks and tamper detection without storing raw secrets.
