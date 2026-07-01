# Contributing

Thanks for considering a contribution to LMTI.

LMTI is currently a local-alpha project focused on one practical goal: safe
project memory and verification for AI coding agents, with Codex as the first
workflow. Contributions should make that workflow easier to understand, safer,
or more reliable.

## Local Setup

Requirements:

- Node.js 20 or newer.
- Corepack with pnpm.
- For SQLite-backed project memory commands, a Node runtime that provides
  `node:sqlite`; this path is currently tested on Node 24.

Install dependencies:

```bash
corepack pnpm install
```

Build:

```bash
corepack pnpm build
```

Run tests:

```bash
corepack pnpm test
```

Run the CLI from source:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js compile ./examples/sample-project
node packages/cli/dist/index.js context "fix packing label bug"
node packages/cli/dist/index.js preflight "permission routing issue" --role developer --model-target external_model
```

There is no separate root `typecheck` script today. `corepack pnpm build` is
the current TypeScript verification command.

## Branch And PR Expectations

- Keep PRs focused on one behavior or documentation area.
- Explain why the change is needed and what user workflow it improves.
- Call out privacy, memory, context, adapter, or security impact.
- Update docs when CLI commands, privacy behavior, or output shape changes.
- Do not claim production, enterprise, cloud, or all-agent support unless the
  code and tests prove it.

## Tests

Add or update tests when changing:

- Memory retrieval, scoring, lifecycle, or lesson capture.
- Privacy gates, redaction, egress scan, or audit output.
- Context Pack or preflight output.
- Adapter manifests, sandbox rules, or model-target handling.
- CLI command behavior.
- Compiler source-boundary rules.

At minimum, run:

```bash
corepack pnpm build
corepack pnpm test
```

## Secret Hygiene

Never commit real secrets.

Do not commit:

- `.env` or `.env.*` files, except safe examples such as `.env.example`.
- API keys, tokens, passwords, cookies, sessions, certificates, or private keys.
- Database URLs or production connection strings.
- Local `.lmti/` memory databases, action logs, or private project state.
- Customer, server, deployment, or internal business details that are not meant
  for a public repository.

Fixtures must use obvious placeholders such as `FAKE_TEST_TOKEN_VALUE` or
`your_api_key_here`. If a real secret was committed, rotate it before opening a
PR.

## Documentation Style

Use direct, practical language:

- Say what exists today.
- Mark roadmap items as roadmap.
- Keep broader AI-system language as long-term vision, not current product claims.
- Prefer command examples that work from source.
- Avoid raw private paths, private deployment flows, or customer-specific notes.

## Issues

Use the GitHub issue templates when available. For security issues, do not open
a public issue with exploit details or secrets; follow [SECURITY.md](SECURITY.md).
