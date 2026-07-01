# Skill: Memory Retrieval

## Purpose
Use this skill when an agent needs policy-safe LMTI memory context for a task.

## When to use
- The task is unclear and likely depends on prior lessons, project rules, route notes, or deployment notes.
- The selected skill has `requires_memory = true`.
- The user asks what LMTI remembers about a topic.

## Inputs needed
- Task intent.
- Privacy maximum, normally `internal` for model-bound context.
- Whether lessons or related files are needed.

## Required commands
- `lmti memory retrieve --intent <intent> --privacy-max internal --json`
- `lmti memory context "<task>"` for human-readable local context when appropriate.

## Safety rules
- Do not retrieve `secret` or `do_not_prompt` memory into agent context.
- Do not dump all memory.
- Treat memory as prior belief, not source truth.
- Verify any retrieved claim against source code, tests, command output, or explicit user instruction.

## Block conditions
- The requested memory requires a privacy level higher than the current sink allows.
- The user asks for raw secrets, raw chat, or unreviewed confidential memory.
- The memory command indicates blocked or unsafe output.

## Output expected
Return a concise summary of policy-safe memory used, missing context, and the source checks still required.

## Notes
Thoth returns a memory request hint; it does not fetch memory by itself.

