# Open Source Readiness

> Status: Active alpha-release checklist

This checklist tracks whether the repository is ready to be published as
`v0.1.0-alpha.1`.

Expected public repository: `vuthuanphat6-byte/lmti-atlas`.

## Readiness Matrix

| Area | Status | Evidence | Remaining Work |
|---|---|---|---|
| README | Pass | README has alpha status, scope, quick start, CLI usage, storage, security, docs, license, and author sections. | Re-check before release. |
| License | Pass | `LICENSE` exists and package metadata uses `Apache-2.0`. | Confirm owner approval of Apache-2.0. |
| Security policy | Pass | `SECURITY.md` documents supported alpha versions, reporting, local state, and limitations. | Publish official private security contact. |
| Contributing guide | Pass | `CONTRIBUTING.md` includes setup, branches, commits, PR checklist, security rules, and docs rules. | Keep examples current. |
| Code of conduct | Warn | `CODE_OF_CONDUCT.md` exists. | Publish official maintainer contact. |
| CI workflow | Pass | `.github/workflows/ci.yml` runs pnpm install, build, and test on Node 24. | Confirm first public CI run. |
| Package versions | Pass | Workspace packages are normalized to `0.1.0-alpha.1`. | Re-run package metadata check before tagging. |
| Package license fields | Pass | Workspace package files include `Apache-2.0`. | Re-run package metadata check before publishing packages. |
| `.gitignore` | Warn | New `.lmti/`, `.atlas/`, temp files, logs, DBs, and secret-like files are ignored. | Three `.lmti/` docs/boundary files are already tracked and need owner review before untracking. |
| CLI docs | Pass | README and docs distinguish implemented, experimental, and planned commands. | Keep TypeScript and Go-core status separate. |
| Local storage docs | Pass | README states `.lmti/` is local runtime state and SQLite is target durable memory. | Add migration notes when storage contracts change. |
| Security model | Pass | Docs say LMTI reduces risk and does not replace tests, secret scanning, or human review. | Continue expanding adapter-specific tests. |
| Publish preflight docs | Pass | `docs/publish-preflight.md` documents checks, exit codes, and blocked behavior. | Re-run command immediately before public release. |
| Reality cleanup | Warn | `docs/reality-checklist.md` records local-alpha caveats and Go-toolchain limitation. | Re-run scans after final edits. |
| Public publish gate | Blocked until final clean tree | `lmti publish check` exists and blocks unsafe release states. | Must pass or have owner-approved remediation immediately before release. |

## Required Before Public Release

- Run `pnpm build`.
- Run `pnpm test`.
- Run `node packages/cli/dist/index.js publish check`.
- Review `git status --short`.
- Review tracked `.lmti/` files and decide whether they are intentionally
  public documentation or should be removed from tracking in a separate commit.
- Confirm the public remote is `https://github.com/vuthuanphat6-byte/lmti-atlas.git`.
- Confirm Apache-2.0 is the intended public license.
- Publish private security and maintainer contact paths.

## Scope Guardrails

Safe public wording:

```text
Local-first project memory and safety layer for AI coding agents.
Public alpha.
Codex-first workflow.
Memory is guidance, not truth.
Privacy gates reduce leakage risk but do not replace dedicated secret scanning.
Publish preflight is a safety gate, not a guarantee.
```

Avoid these claims:

- Production-ready agent runtime.
- Complete AI framework.
- Artificial mind.
- Universal all-agent support.
- Hosted team sync.
- Model training or autonomous self-learning.
- Replacement for tests, source review, or human approval.
