# Skill: Security Check

## Purpose
Use this skill to check for secret leakage, privacy boundary failures, protected-file exposure, and unsafe permission changes.

## When to use
- The user mentions secrets, tokens, credentials, `.env`, private data, privacy, leak checks, or security review.
- The task touches publish, adapter, memory, config, auth, permissions, or external sharing.
- A request mixes cleanup or documentation with secret handling.

## Inputs needed
- Current Git status and changed paths.
- Relevant config filenames, not raw secret contents.
- Policy-safe command output from LMTI security checks.

## Required commands
- `lmti doctor --security`
- `lmti publish preflight --json` when publish or external sharing is involved.

## Safety rules
- Do not print raw secrets, private memory, credentials, certificates, or tokens.
- Do not read protected files just to prove they exist; path metadata is usually enough.
- Use least privilege for permissions and access-control changes.
- Treat model prompts as untrusted egress paths.

## Block conditions
- Secret-like material is detected in tracked or staged content.
- A requested action would bypass policy gates or widen permissions without evidence.
- The user asks to expose private LMTI memory or `do_not_prompt` content.

## Output expected
Report findings by path or category, state whether work is blocked, and give safe remediation steps without raw secret values.

## Notes
Security review is a gate, not a cleanup shortcut.

