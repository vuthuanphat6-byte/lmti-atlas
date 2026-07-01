# Adapter Security

> Status: Security documentation

Date: 2026-06-29

Adapters are untrusted sinks unless explicitly proven local and policy-safe.

## Supported Adapter IDs

`codex`, `claude-code`, `cursor`, `aider`, `continue`, `mcp`,
`openai-agents`, `langchain`, `crewai`, `autogen`, `generic`, `custom`.

## Default Profile

```json
{
  "allowRawSecret": false,
  "allowRawConfidential": false,
  "requiresEgressScan": true,
  "defaultModelTarget": "external_model"
}
```

## Adapter Rules

1. Adapter output must pass memory hard gate, context privacy filter, adapter
   sandbox, egress scan and safe rendering.
2. Adapter manifests may only be read from inside the project directory.
3. Forbidden scopes: `memory:read`, `memory:write`, `secret:read`, `audit:read`.
4. Direct memory store access is forbidden by default.
5. Network and filesystem sandbox access are disabled by default.
6. MCP resources must be policy-safe summaries, never raw `.lmti` files.

## CLI

```bash
lmti preflight "<task>" --adapter codex
lmti context "<task>" --adapter codex
```

`--adapter-manifest <path>` is allowed only for files inside the project
directory and is normalized to a deny-raw privacy profile.
