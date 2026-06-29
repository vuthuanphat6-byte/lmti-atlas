# LMTI-Atlas

A local-first project mind layer for AI coding agents.

LMTI-Atlas helps AI agents compile project understanding, retrieve policy-safe context, remember project lessons, and reduce repeated codebase exploration.

## Quick Start

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm test
node packages/cli/dist/index.js init
node packages/cli/dist/index.js compile examples/sample-project
node packages/cli/dist/index.js context "fix packing label bug"
```

## What It Does

- Compiles a repository into an Artificial Mind Format (AMF) summary.
- Builds policy-safe Context Packs for coding agents.
- Stores structured short-term and long-term project memory.
- Applies privacy gates before context/preflight/adapter output.
- Routes tool execution through a least-privilege SecurityGuard.
- Provides a deterministic cognition/world-model layer for focus and reality checks.

## What Works Now

This `v0.1.0-alpha.1` public alpha includes:

- Knowledge compiler
- Mind kernel and Context Pack generation
- Local memory lifecycle and retrieval
- Cognitive privacy layer and audit integrity checks
- Runtime/tool security gate
- CLI commands for init, compile, context, preflight, memory, cognition, world checks and privacy audit
- Sample project under `examples/sample-project`

## Security Model

LMTI treats project knowledge as sensitive by default.

- No external AI API required.
- No cloud service required.
- No vector database required.
- Secrets are never exported into normal context.
- `.lmti` and `.atlas` local state are ignored and must not be published.
- Target projects are treated as untrusted input during compile.
- Adapter output is egress-scanned and policy-safe by default.

See `docs/security/` for the threat model, privacy policy, adapter security and release checklist.

## Local Storage

LMTI stores local runtime state under `.lmti/`. This folder may contain project memory, audit logs and local context artifacts. It is intentionally ignored by git.

## Commands

```bash
node packages/cli/dist/index.js init
node packages/cli/dist/index.js compile [projectPath]
node packages/cli/dist/index.js inspect
node packages/cli/dist/index.js context "<task>"
node packages/cli/dist/index.js preflight "<task>" --adapter codex
node packages/cli/dist/index.js memory list
node packages/cli/dist/index.js memory search "<query>"
node packages/cli/dist/index.js privacy audit --verify
node packages/cli/dist/index.js doctor --security
```

## Roadmap

- Harden adapter integrations.
- Expand MCP policy-safe resources.
- Improve memory poisoning detection.
- Add richer examples and benchmarks.
- Stabilize package APIs for broader use.

## License

Apache License 2.0.
