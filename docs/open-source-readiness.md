# Open Source Readiness

This checklist tracks what must be true before the LMTI repository is made
public as a v0.1 release candidate.

Publish repository: `vuthuanphat6-byte/lmti-atlas`.

Do not use a private or legacy `/atlas` repository path as the public product
identity.

## Required Before Public Release

- [x] Product identity is LMTI, not ATLAS.
- [x] Publish repository is `vuthuanphat6-byte/lmti-atlas`, not a private or legacy `/atlas` path.
- [x] README explains current scope honestly.
- [ ] LICENSE exists or owner has selected license.
- [x] SECURITY.md has a private reporting path or clear TODO.
- [x] CODE_OF_CONDUCT.md has maintainer contact or clear TODO.
- [x] CONTRIBUTING.md explains setup, tests, docs, and secret hygiene.
- [x] No real secrets were detected in the current high-confidence scan.
- [x] No tracked local `.lmti/` memory databases were detected.
- [x] No customer/private deployment data was detected in the current review.
- [x] Package distribution status is clear.
- [x] Codex-first scope is clear.
- [x] Other agents are described as roadmap/adapter targets, not fully supported runtimes.
- [x] Known limitations are visible.
- [x] Examples work from source.
- [x] `npm.cmd run build` passes in the current workspace.
- [x] `npm.cmd test` passes in the current workspace.

## Current Blocking Items

- No `LICENSE` file is present yet. The owner should choose Apache-2.0 or MIT
  before public release.
- `SECURITY.md` intentionally keeps a security-contact TODO until the owner
  publishes an official private reporting path.
- `CODE_OF_CONDUCT.md` intentionally keeps a maintainer-contact TODO until the
  owner publishes an official contact path.
- Secret/private-data scanning should be repeated immediately before publishing.

## Scope Guardrails

LMTI is Local Alpha and Codex-first.

Do not claim production readiness, enterprise readiness, universal all-agent
support, complete AI framework status, complete Artificial Mind status, model
training, unchecked self-learning, replacement for dedicated secret scanning, or
replacement for source-code verification.

Use safer wording:

```text
Local Alpha
Codex-first
Adapter contract planned
Memory is guidance, not truth
Lesson candidates require review
Privacy gates reduce leakage risk but do not replace dedicated secret scanning
```
