# Skill: Repo Cleanup

## Purpose
Use this skill to clean or reorganize repository files while preserving behavior, memory boundaries, and security posture.

## When to use
- The user asks to clean up, refactor, remove unused files, or organize the repository.
- The task may touch generated files, legacy files, docs, or project structure.
- Cleanup is requested before publishing, but publish safety remains the higher-risk first step.

## Inputs needed
- Repository root.
- Current Git status.
- Framework detection if the project shape is unclear.
- Policy-safe memory lessons when available.

## Required commands
- `lmti framework detect`
- `lmti doctor --security`
- `lmti memory retrieve --intent repo_cleanup --privacy-max internal --json` when memory context is needed.

## Safety rules
- Do not delete `.lmti/`, private memory, indexes, lesson candidates, or runtime state during normal cleanup.
- Do not delete files immediately when a report or classification is safer.
- Do not broaden file permissions or use destructive shell patterns.
- Verify behavior with available tests after edits.

## Block conditions
- Cleanup would remove protected files, private memory, or source-of-truth docs.
- The repo has unclear generated/vendor boundaries and no safe classification yet.
- A requested deletion would be irreversible without explicit user approval.

## Output expected
Provide a cleanup report, the files changed, test results, and any remaining risks.

## Notes
Prefer small behavior-preserving edits over broad rewrites.

