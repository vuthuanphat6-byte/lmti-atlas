# Skill: Publish Preflight

## Purpose
Use this skill before publishing, pushing, opening a pull request, creating a release, changing Git remotes, or preparing open-source distribution.

## When to use
- The user mentions publish, push, pull request, open source, release, or GitHub exposure.
- The task could move local code or project knowledge outside the current machine.
- The task combines cleanup with publishing; publish safety runs first.

## Inputs needed
- Repository root.
- Current branch and target branch.
- Configured publish remote.
- Current Git status summary.

## Required commands
- `lmti publish preflight`
- `lmti publish preflight --json` for agent automation.

## Safety rules
- Do not push, publish, open a PR, create a release, or change remotes before the preflight passes.
- Do not print raw `.env`, key, certificate, token, private memory, or SQLite memory content.
- Treat warnings as review items before continuing.
- Keep LMTI identity as LMTI, with ATLAS only as legacy/internal naming.

## Block conditions
- Preflight returns blocked or error.
- Protected files are staged or tracked for publishing.
- Repository identity or remote target does not match the configured publish target.
- Secrets or private project knowledge may leave the machine.

## Output expected
Summarize the preflight result, blockers, warnings, and the next safe action. Do not include raw secret content.

## Notes
Thoth only selects this skill. The publish preflight command owns the actual safety gate.

