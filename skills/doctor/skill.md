# Skill: Doctor

## Purpose
Use this skill to diagnose LMTI health, configuration, schema presence, routing smoke tests, and security posture.

## When to use
- The user asks to check setup, validate health, run doctor, or diagnose LMTI.
- A workflow needs proof that registry, schemas, or output boundaries are sane.
- A high-risk task needs a non-mutating health check first.

## Inputs needed
- Repository root.
- Current command arguments.
- Whether output should be human-readable or JSON.

## Required commands
- `lmti doctor`
- `lmti doctor --security`
- `lmti thoth doctor`
- `lmti thoth doctor --json`

## Safety rules
- Diagnostics should not mutate project state unless the user explicitly asks for a fix command.
- Do not print raw secrets or private memory.
- Treat warnings as review items before publish, migration, or adapter work.

## Block conditions
- Doctor reports blocked or error.
- Required schemas, registry, or protected privacy gates are missing.
- A requested fix would alter files outside the intended workspace.

## Output expected
Report checks, statuses, details, and the next safe remediation step.

## Notes
Doctor is evidence collection, not a replacement for tests.

