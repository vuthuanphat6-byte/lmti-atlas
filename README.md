# LMTI Atlas

![CI](https://img.shields.io/github/actions/workflow/status/vuthuanphat6-byte/lmti-atlas/ci.yml?branch=main&label=CI&logo=githubactions)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Version](https://img.shields.io/badge/version-0.1.0--alpha.1-orange)

LMTI Atlas is a local-first project memory and safety layer for AI coding
agents.

It helps coding agents reuse project knowledge, route context, check privacy
boundaries, and preserve lessons without treating memory as a replacement for
source-code verification.

## Alpha Status

LMTI Atlas is in public alpha. Commands, storage layout, package boundaries,
and output schemas may change before a stable release.

Run the project from source for now. Package installation and global CLI usage
are release targets, not the primary verified path for this alpha.

## What LMTI Is

- A local project memory layer for AI coding workflows.
- A privacy-aware context router for project knowledge.
- A safety gate for publish, prompt, and memory workflows.
- A source-controlled toolchain that agents can call through documented CLI
  commands.
- A way to capture reviewed lessons so future agent sessions repeat less
  reasoning.

## What LMTI Is Not

- LMTI is not a full AI framework.
- LMTI is not an artificial mind.
- LMTI is not a replacement for tests, static analysis, human review, or source
  inspection.
- LMTI is not a hosted cloud service.
- LMTI is not a secret scanner replacement.
- LMTI is not a production agent runtime.

LMTI does not replace source-code verification, tests, or human review. It
reduces repeated reasoning and leakage risk by giving agents safer local
context.

## Features Available Now

- TypeScript CLI runnable from source.
- Local `.lmti/` workspace initialization.
- Project compilation into a Project Atlas / AMF summary.
- Task-specific context generation.
- Privacy-aware preflight checks for external model targets.
- Publish preflight checks for public release, PR, and remote-change workflows.
- SQLite-backed memory commands in the current TypeScript path.
- Lesson candidate proposal and approval flow.
- Skill routing through Thoth without executing tasks.
- Machine-readable JSON output for simplified agent command paths.
- Security and privacy documentation for local-alpha usage.

## Experimental Features

- Go core command surfaces under `cmd/lmti`.
- Advanced Thoth diagnostics.
- Framework detection and verification metadata.
- Action, cognition, world-model, and mind command families.
- Adapter contract inspection.
- Legacy JSON memory migration through the Go core path.

Experimental features are useful for development, but they are not stable public
contracts yet.

## Planned Features

- TypeScript-friendly `lmti migrate from-json` parity.
- Published package installation and global `lmti` command usage.
- Stronger adapter test harnesses.
- Broader CI coverage for Go core once a Go toolchain is available.
- More complete JSON schema validation for all agent-facing command output.
- Additional agent integrations beyond the current Codex-first workflow.

## Quick Start

Requirements:

- Node.js 24 for the full current test path.
- Corepack with pnpm.
- Git.

Install dependencies:

```bash
corepack enable
pnpm install
```

Build:

```bash
pnpm build
```

Run tests:

```bash
pnpm test
```

Run the CLI from source:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js publish check
```

The root package also exposes convenience scripts after build:

```bash
pnpm lmti doctor
pnpm lmti compile
pnpm lmti publish check
```

Future package installs should support global commands such as:

```bash
lmti doctor
lmti publish check
lmti context "fix a routing bug"
```

Treat global usage as package-distribution ergonomics unless you have linked or
installed the CLI locally.

## CLI Usage

| Command | Status | Purpose |
|---|---|---|
| `lmti init` | Implemented | Create local `.lmti/` state. |
| `lmti doctor` | Implemented | Check local health and security posture. |
| `lmti check` | Implemented | Friendly alias for doctor-style checks. |
| `lmti compile` | Implemented | Build the Project Atlas / AMF summary. |
| `lmti inspect` | Implemented | Inspect compiled project metadata. |
| `lmti context "<task>"` | Implemented | Build task-specific project context. |
| `lmti preflight "<task>"` | Implemented | Build privacy-aware context for model targets. |
| `lmti publish check` | Implemented | Gate public publish, PR, release, and remote work. |
| `lmti publish preflight` | Implemented | Advanced alias for publish check. |
| `lmti memory ...` | Implemented | Add, search, retrieve, and review memory. |
| `lmti memory lesson ...` | Implemented | Propose, inspect, approve, or reject lessons. |
| `lmti skill list/route/show/validate` | Implemented | Route skill instructions without executing tasks. |
| `lmti thoth ...` | Experimental | Advanced skill-routing diagnostics. |
| `lmti framework ...` | Experimental | Local framework detection metadata. |
| `lmti migrate from-json` | Experimental | Go-core migration path; TypeScript parity is planned. |
| `lmti adapter list/test` | Planned | Future adapter workflow commands. |

Use `--json` on supported commands when an agent needs machine-readable output.

## Local Storage

LMTI writes local runtime state under `.lmti/`. That directory can contain
compiled project metadata, memory databases, logs, action traces, audit records,
and temporary files.

Do not commit local `.lmti/` or legacy `.atlas/` runtime state. This repository
still contains a few tracked `.lmti/` documentation/boundary files from the
local-alpha setup; new runtime state is ignored.

SQLite is the target durable memory storage. JSON is used at the CLI and API
boundary, plus for migration/import/export paths.

## Security Model

LMTI assumes project knowledge is sensitive.

- Secret-like values are redacted before safe CLI output where the privacy
  layer is used.
- Memory marked `secret` or `do_not_prompt` must not enter model context.
- External model targets should receive the minimum useful context.
- Publish preflight checks repository identity, branch safety, package
  metadata, open-source docs, and protected local paths.
- Agents must treat memory as prior belief, not source of truth.

[CẢNH BÁO BẢO MẬT] Do not commit `.env`, tokens, private keys, certificates,
SQLite memory databases, customer data, private prompts, deployment notes, or
raw `.lmti/` runtime state. If a real secret reaches Git history, rotate it
before publishing.

## Project Structure

```text
packages/
  cli/          TypeScript CLI
  compiler/     Project Atlas / AMF compilation
  memory/       Local memory and lesson flows
  privacy/      Redaction, access rules, egress checks
  context/      Context selection
  runtime/      Runtime orchestration primitives
  security/     Policy and tool safety
  tools/        Tool registry support
  agents/       Agent-facing helpers
  frameworks/   Framework detection metadata
  migration/    Migration helpers
  cognition/    Experimental reasoning helpers
  world-model/  Experimental project model helpers
cmd/
  lmti/         Experimental Go core CLI
internal/       Experimental Go core packages
pkg/            Experimental Go public contracts
docs/           Architecture, security, CLI, and release documentation
skills/         Skill routing instructions
apps/           Local demo and assistant surfaces
```

## Documentation

- [CLI](docs/cli.md)
- [Commands](docs/commands.md)
- [Security Model](docs/security.md)
- [Privacy Model](docs/privacy-model.md)
- [Publish Preflight](docs/publish-preflight.md)
- [Open Source Readiness](docs/open-source-readiness.md)
- [Reality Checklist](docs/reality-checklist.md)
- [Roadmap](docs/roadmap.md)
- [Thoth](docs/thoth.md)
- [Skills](docs/skills.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. Keep changes small,
testable, and honest about local-alpha scope.

At minimum:

```bash
pnpm build
pnpm test
node packages/cli/dist/index.js publish check
```

Run publish preflight before public release work, opening a PR, pushing to a
public repository, creating a release, or changing a Git remote.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Author

Created and maintained by Edgar Vu - Cyno Software.
