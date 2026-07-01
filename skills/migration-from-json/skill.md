# Skill: Migration from JSON

## Purpose
Use this skill to migrate legacy JSON memory or config artifacts toward the current SQLite and TOML direction.

## When to use
- The user mentions migrating JSON memory to SQLite.
- The task touches storage upgrades, legacy `.atlas` or `.lmti` JSON, import, or export.
- The work may alter durable memory storage.

## Inputs needed
- Source JSON path or legacy storage location.
- Target SQLite path.
- Dry-run report.
- Privacy and secret-scan results.

## Required commands
- `lmti migrate from-json --dry-run`
- `lmti migrate from-json`
- `lmti doctor --security`

## Safety rules
- Run dry-run before applying migration.
- Do not delete legacy files without explicit confirmation.
- Move unknown fields into metadata instead of dropping them silently.
- Block raw secret import and keep memory privacy labels intact.

## Block conditions
- Dry-run reports secret-like content, invalid schema, or missing backup.
- Target storage path is outside the LMTI boundary.
- Migration would overwrite existing durable memory without a safe plan.

## Output expected
Provide dry-run status, migrated counts, blocked items, backup status, and follow-up verification.

## Notes
JSON is an import/export and CLI boundary format, not the durable memory database.

