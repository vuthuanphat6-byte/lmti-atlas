# Verification Model

LMTI memory is guidance, not truth.

Agents should verify source code, tests, builds, CLI output, runtime behavior,
and explicit user instruction before acting on remembered project knowledge.

## Context Item Contract

Target agent-facing context items should carry:

```ts
{
  verify_required: boolean;
  suggested_verification: string[];
  last_verified_at: string | null;
}
```

- `verify_required`: whether the item must be checked before action.
- `suggested_verification`: concrete checks the agent should run.
- `last_verified_at`: the last real verification timestamp. Do not fake this.

Current implementation note: these exact fields are not yet first-class on every
returned context item. Today, preflight exposes related signals through
`riskSignals`, `predictedFailures`, `executiveConstraints`, `policyDecisionIds`,
blocked-memory summaries, framework verification plans, and world-model checks.

## Suggested Verification Types

Use short, explicit labels:

```text
read_source_file
run_tests
run_typecheck
run_build
inspect_git_diff
inspect_database_schema
check_cli_output
check_runtime_behavior
check_privacy_gate
check_adapter_manifest
```

## When `verify_required` Should Be True

Require verification when context is:

- Old or not recently checked.
- Based on memory instead of current source.
- Related to auth, permissions, secrets, deployment, database schema, migrations,
  billing, or destructive operations.
- Contradicted by source, tests, CLI output, or user instruction.
- From an adapter or memory item with low confidence.

## When It Can Be False

Verification may be false for:

- Freshly inspected source evidence.
- Current command output from the same task.
- Static documentation that was just read.
- Low-risk style or wording guidance that cannot affect security or behavior.

Even then, agents should keep evidence attached to decisions when possible.

