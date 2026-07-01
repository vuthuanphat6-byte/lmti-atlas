# Reality Checklist

> Status: Active alpha-release reality check

Date: 2026-07-02

Purpose: keep public documentation, command claims, and capability language
aligned with the actual local-alpha repository state.

## Scope Rules

- LMTI Atlas is a local-first project memory and safety layer for AI coding
  agents.
- LMTI is not a complete AI framework, artificial mind, hosted platform, or
  replacement for tests and human review.
- Thoth selects and loads skill instructions. It does not execute tasks,
  bypass policy, or retrieve raw memory.
- Policy and privacy gates reduce leakage risk, but they do not replace
  dedicated secret scanning.
- Legacy ATLAS/artificial-mind documents are research archive material, not
  current product claims.

## Release Reality Matrix

| Area | Expected Reality | Current Status | Verification |
|---|---|---|---|
| README | Required release sections exist and use alpha language. | Pass | Manual docs review. |
| Markdown formatting | Public release docs should be readable, not collapsed. | Pending final scan | Run long-line and markdown sanity checks after edits. |
| `.gitignore` | Local state, DBs, logs, temp files, and secrets are ignored. | Warn | `.lmti/` is ignored for new files; three `.lmti/` docs/boundary files remain tracked. |
| Package versions | Workspace packages use `0.1.0-alpha.1`. | Pass | Package metadata scan. |
| License metadata | Package files use `Apache-2.0`; `LICENSE` exists. | Pass | Package metadata scan. |
| CLI docs | Commands are marked implemented, experimental, or planned. | Pass | README and docs review. |
| CI | CI installs with pnpm, builds, and tests. | Pass | `.github/workflows/ci.yml`. |
| CHANGELOG | Alpha release entry exists. | Pass | `CHANGELOG.md`. |
| SECURITY | Reporting, local state, not-to-commit, and limitations are documented. | Pass | `SECURITY.md`. |
| CONTRIBUTING | Setup, branches, commits, PR checklist, security, docs rules exist. | Pass | `CONTRIBUTING.md`. |
| Publish preflight | Release gate is documented and runnable. | Pass for docs; runtime status depends on current tree | Run command before release. |
| Go core | Experimental and not fully verified here. | Warn | Local Go toolchain is unavailable. |

## Command Reality Matrix

| Command Or Family | Status | Notes |
|---|---|---|
| `lmti init` | Implemented | TypeScript path exists; Go core path is experimental. |
| `lmti doctor` / `lmti check` | Implemented | Local health and security checks. |
| `lmti compile` | Implemented | Builds Project Atlas / AMF metadata. |
| `lmti inspect` | Implemented | Reads compiled metadata. |
| `lmti context "<task>"` | Implemented | Context output is guidance and requires source verification. |
| `lmti preflight "<task>"` | Implemented | Privacy-aware context packaging. |
| `lmti publish check` | Implemented | Safety gate before publish, PR, release, or remote changes. |
| `lmti publish preflight` | Implemented | Advanced alias for publish check. |
| `lmti memory ...` | Implemented | TypeScript memory flow is current primary path. |
| `lmti memory lesson ...` | Implemented | Lesson candidates require review and approval. |
| `lmti skill list/route/show/validate` | Implemented | Primary skill-routing surface. |
| `lmti thoth ...` | Experimental | Advanced diagnostics. |
| `lmti framework ...` | Experimental | Framework metadata only. |
| `lmti migrate from-json` | Experimental | Go-core path exists; TypeScript-friendly parity is planned. |
| `lmti adapter list/test` | Planned | Not a current release claim. |
| Hosted sync, distributed runtime, multi-language SDKs | Planned/deferred | Not current product capability. |

## Manual Review Required

- Re-run `pnpm build` and `pnpm test` before release.
- Run `node packages/cli/dist/index.js publish check` immediately before
  public release work.
- Review old ATLAS archive docs before publishing docs externally.
- Install or expose Go before treating Go-core tests as verified.
- Confirm official security and maintainer contact paths.
- Decide whether tracked `.lmti/` documentation files should remain public or
  be untracked in a separate owner-approved cleanup.
