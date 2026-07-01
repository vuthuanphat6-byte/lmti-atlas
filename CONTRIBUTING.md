# Contributing

Thanks for considering a contribution to LMTI Atlas.

LMTI is a local-alpha project focused on safe project memory, context routing,
privacy gates, and verification support for AI coding agents. Contributions
should make that workflow easier to understand, safer, or more reliable.

## How To Contribute

- Pick a focused issue or small documentation gap.
- Keep changes scoped to one behavior, package, or document area.
- Explain what changed, why it matters, and how it was verified.
- Update docs when CLI commands, privacy behavior, storage, or output schemas
  change.
- Mark roadmap or experimental work honestly.

Do not present planned or experimental features as stable product capability.

## Development Setup

Requirements:

- Node.js 24 for the current full test path.
- Corepack with pnpm.
- Git.
- Optional: Go, only when working on the experimental Go core.

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

After build, root scripts also work:

```bash
pnpm lmti doctor
pnpm lmti publish check
```

Future global usage should look like `lmti doctor`, but release verification
must use the source path or a deliberately linked local package.

## Branch Naming

Use short, descriptive branch names:

- `docs/readme-alpha`
- `fix/privacy-egress-scan`
- `feat/publish-check-warning`
- `test/memory-retrieval-gates`

Avoid branch names that include customer names, private server names, secrets,
or issue details that should remain private.

## Commit Style

Use clear, imperative commits:

```text
docs: clarify alpha CLI status
fix: block secret memory from context output
test: cover publish preflight dirty tree
```

Keep generated files out of commits unless they are required source artifacts.

## Pull Request Checklist

Before opening a PR:

- `pnpm build` passes.
- `pnpm test` passes, or the PR explains why a test cannot run.
- `node packages/cli/dist/index.js publish check` has been reviewed.
- Security, privacy, memory, storage, and adapter risks are called out.
- Docs match current behavior.
- New commands have human and agent-facing behavior documented.
- JSON output changes preserve schema/version expectations or document the
  migration.
- No secrets or private local state are included.

## Security Rules

[CẢNH BÁO BẢO MẬT] Never commit real secrets or private local state.

Do not commit:

- `.env` or `.env.*` files, except safe examples such as `.env.example`.
- API keys, tokens, passwords, cookies, or sessions.
- Private keys, certificates, or signing material.
- Database URLs or production connection strings.
- SQLite databases, local memory stores, action logs, or raw `.lmti/` runtime
  state.
- Customer data, private prompts, private deployment notes, or server details.

Fixtures must use obvious placeholders such as `FAKE_TEST_TOKEN_VALUE` or
`your_api_key_here`. If a real secret reaches Git history, rotate it before
publishing or opening a PR.

Security-sensitive changes should prefer least privilege, explicit validation,
safe output rendering, and clear failure states.

## Documentation Rules

- Say what exists today.
- Mark experimental features as experimental.
- Mark planned features as planned.
- Prefer source-based commands until package distribution is verified.
- Keep LMTI framed as local project memory and safety support, not a complete AI
  framework.
- Explain privacy boundaries without printing raw secrets, raw memory, or
  customer data.

For security reports, follow [SECURITY.md](SECURITY.md) instead of opening a
public issue with exploit details.
