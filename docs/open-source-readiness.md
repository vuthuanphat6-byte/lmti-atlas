# Open Source Readiness

This checklist tracks what must be true before the LMTI repository is made public as a v0.1 release candidate.

Publish repository: `vuthuanphat6-byte/lmti-atlas`.

Do not use a private or legacy `/atlas` repository path as the public product identity.

## Required Before Public Release

- [x] Product identity is LMTI, not ATLAS.
- [x] Publish repository is `vuthuanphat6-byte/lmti-atlas`, not a private or legacy `/atlas` path.
- [x] README explains current scope honestly.
- [x] LICENSE exists and is Apache-2.0.
- [ ] SECURITY.md has an official private reporting path or clear TODO.
- [ ] CODE_OF_CONDUCT.md has maintainer contact or clear TODO.
- [x] CONTRIBUTING.md explains setup, tests, docs, and secret hygiene.
- [ ] No real secrets are committed.
- [x] No local `.lmti/` memory databases are committed.
- [ ] No customer/private deployment data is committed.
- [x] Package distribution status is clear.
- [x] Codex-first scope is clear.
- [x] Other agents are described as roadmap/adapter targets, not fully supported runtimes.
- [x] Known limitations are visible.
- [x] Examples work from source.
- [ ] `corepack pnpm build` passes on the publish branch.
- [ ] `corepack pnpm test` passes on the publish branch.

## Scope Guardrails

LMTI is Local Alpha and Codex-first.

Do not claim production readiness, enterprise readiness, universal all-agent support, complete AI framework status, complete Artificial Mind status, model training, unchecked self-learning, replacement for dedicated secret scanning, or replacement for source-code verification.

Use safer wording:

```text
Local Alpha
Codex-first
Adapter contract planned
Memory is guidance, not truth
Lesson candidates require review
Privacy gates reduce leakage risk but do not replace dedicated secret scanning
```
