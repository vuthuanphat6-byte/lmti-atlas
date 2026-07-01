# Skills

> Status: Local-alpha documentation

Skills are short markdown instructions that help an AI agent perform one kind
of work safely. A skill is not executable code and must not contain secrets.

The registry lives at:

```text
skills/registry.toml
```

Each skill file lives at:

```text
skills/<skill-id>/skill.md
```

## Registry Metadata

```toml
[[skills]]
id = "publish-preflight"
name = "Publish Preflight"
description = "Check Git, branch, remote, protected files, and repository identity before publishing."
file = "skills/publish-preflight/skill.md"
intents = ["publish", "push", "pull_request", "open_source", "release"]
requires_policy = true
requires_memory = false
risk_level = "high"
```

Required fields:

| Field | Purpose |
|---|---|
| `id` | Stable skill id. |
| `name` | Human-readable name. |
| `file` | Path to exactly one `skill.md`. |
| `intents` | Rule-based routing signals. |
| `requires_policy` | Whether the agent must run a policy gate. |
| `requires_memory` | Whether the agent should request safe memory context. |
| `risk_level` | `low`, `medium`, or `high`. |

## Required Sections

Each `skill.md` must include:

```md
# Skill: <Skill Name>

## Purpose
## When to use
## Inputs needed
## Required commands
## Safety rules
## Block conditions
## Output expected
## Notes
```

## Validation

Run:

```bash
lmti skill validate
```

Validation checks:

- Registry exists.
- Skill ids are unique.
- Skill files exist and stay inside the project root.
- Required markdown sections are present.
- Skill files are not unusually large.
- Secret-like patterns are not present.
- Thoth and CLI schemas exist.
- Friendly skill JSON can be serialized as `lmti.cli.v1`.

## Security Rules

- Never place API keys, tokens, passwords, certificates, private keys, raw
  customer data, raw chat, or private memory in a skill.
- Use environment variables or ignored local config for credentials in real
  workflows.
- Do not instruct agents to bypass policy, read protected files, publish,
  deploy, or delete memory as a side effect of skill routing.
- Keep skills short enough for an agent to load only the selected skill.
