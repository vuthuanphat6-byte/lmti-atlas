# Thoth

> Status: Local-alpha documentation

Thoth is LMTI's skill-routing module. It helps an AI Agent choose the right
`skill.md` for the right problem, then provides the instructions in a simple,
safe, and machine-readable way.

## Scope

Thoth is intentionally small.

It is not a super AI, memory database, policy engine, task executor, publisher,
deployment tool, or code rewriter.

Thoth does not solve tasks. Thoth does not execute actions. Thoth does not
replace the agent. Thoth does not bypass policy. Thoth only routes the current
task to the most suitable `skill.md`.

Thoth only:

1. Loads `skills/registry.toml`.
2. Detects a simple rule-based intent.
3. Selects the best `skill.md`.
4. Loads only the selected skill when asked.
5. Returns policy and memory hints without bypassing those gates.
6. Emits schema-versioned JSON for agents.

## Commands

Primary user commands:

```bash
lmti skill list
lmti skill route "<request>"
lmti skill show <skill-id>
lmti skill validate
```

Advanced Thoth commands:

```bash
lmti thoth list
lmti thoth route "<user request>"
lmti thoth show <skill-id>
lmti thoth validate
lmti thoth doctor
```

Diagnostic commands, implemented for local-alpha development:

```bash
lmti thoth explain "<user request>"
lmti thoth inspect <skill-id>
```

Friendly `skill` commands use the `lmti.cli.v1` envelope for agents. Advanced
Thoth diagnostics may use the `lmti.thoth.v1` envelope.

## Routing Decisions

Thoth can return:

| Decision | Meaning |
|---|---|
| `skill_selected` | One skill clearly matched. |
| `multiple_candidates` | More than one skill matched; higher-risk relevant skill wins first. |
| `no_skill_found` | No registered skill matched. |
| `policy_required` | A selected workflow needs an external policy gate. |
| `memory_required` | A selected workflow needs policy-safe memory retrieval. |
| `blocked` | Routing cannot continue safely. |
| `invalid_registry` | Registry is missing or invalid. |

## Risk Priority

When multiple skills match, Thoth prioritizes safety:

```text
secret/security > publish/push/deploy > migration > repo cleanup > documentation > general memory
```

Example:

```bash
lmti thoth route "publish repo and clean .env before release" --json
```

The security-related wording wins first because secret handling has higher
risk than documentation or cleanup.

## Safety Boundary

Thoth does not retrieve raw memory. If a skill needs memory, Thoth returns a
safe memory request hint:

```json
{
  "memoryRequest": {
    "intent": "repo_cleanup",
    "privacyMax": "internal",
    "includeLessons": true,
    "includeRelatedFiles": true
  }
}
```

The agent or LMTI runtime can then call the memory command. Secret and
`do_not_prompt` memory must never be injected into model context.

Thoth also does not bypass policy. If a skill needs policy, Thoth returns the
gate names and recommended commands. The policy module owns the decision.
