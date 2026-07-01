# Skill: Adapter

## Purpose
Use this skill for agent adapter, plugin, connector, or driver integration work.

## When to use
- The user asks to add or change an adapter, plugin, connector, or MCP bridge.
- A workflow needs to pass context to an external agent or tool runtime.
- Scope, sandbox, or manifest permissions are part of the task.

## Inputs needed
- Adapter manifest or proposed scope list.
- Intended hooks and target agent/runtime.
- Policy-safe memory or architecture context when needed.

## Required commands
- `lmti thoth show adapter`
- `lmti doctor --json`
- `lmti memory retrieve --intent adapter --privacy-max internal --json` when memory context is needed.

## Safety rules
- Adapters must not read `.lmti` storage directly.
- Unknown permissions are denied by default.
- Keep network and filesystem access scoped to the manifest.
- Do not bypass privacy or policy gates for adapter convenience.

## Block conditions
- The adapter needs direct raw memory storage access.
- Requested scopes are broader than the task requires.
- The integration would send secret or `do_not_prompt` context to a model or external service.

## Output expected
Return manifest findings, scope risks, required policy gates, and safe integration steps.

## Notes
Adapters translate contracts; they do not own LMTI memory or policy.

