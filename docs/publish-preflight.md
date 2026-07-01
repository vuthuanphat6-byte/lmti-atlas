# Publish Preflight

> Status: Implemented safety gate

`lmti publish check` is the required safety gate before public publishing,
opening a PR, creating a release, pushing to a public repository, or changing a
Git remote.

Advanced alias:

```bash
lmti publish preflight
```

From source:

```bash
node packages/cli/dist/index.js publish check
node packages/cli/dist/index.js publish check --json
```

## Checks

Publish preflight checks:

- repository identity;
- origin remote;
- current branch;
- branch history and merge-base with the target branch;
- ahead/behind divergence;
- dirty working tree;
- protected local-state paths;
- package metadata;
- license and open-source docs;
- LMTI naming and product identity.

It does not push, publish, create pull requests, change remotes, rewrite
history, or delete files.

## Exit Codes

| Exit Code | Status | Meaning |
|---:|---|---|
| `0` | Pass | No blocking issue was found. |
| `1` | Warn | Review warnings before continuing. |
| `2` | Blocked | Stop release or remote work until resolved. |

## JSON Output

Machine-readable output:

```bash
lmti publish check --json
```

Agent-facing JSON should include a schema version, status, warnings, errors,
and structured check data. Treat `blocked` as a hard stop.

## Known Blockers

Common blocked states:

- origin remote does not match the expected public repository;
- branch has no merge-base with `origin/main`;
- working tree is dirty;
- local runtime state is tracked or staged;
- package license metadata is missing;
- `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, or open-source readiness docs are
  missing.

## Security Notes

[CẢNH BÁO BẢO MẬT] Publish preflight reduces release risk, but it is not a
secret scanner replacement. Run human review and dedicated secret scanning
before publishing if the repository has ever contained real credentials,
customer data, or private deployment notes.
