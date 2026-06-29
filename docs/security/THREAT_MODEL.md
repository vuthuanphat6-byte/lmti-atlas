# LMTI-Atlas Threat Model

Date: 2026-06-29

LMTI-Atlas treats project knowledge, memory, context, adapter output and audit
data as sensitive by default. The security posture is deny by default, least
privilege, privacy-first, local-first and no raw secret output.

| # | Threat | Risk | Attack Path | Affected Modules | Current Protection | Missing Protection | Mitigation | Test Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Secret leakage | Credentials can be exposed to CLI, context, AMF or adapters. | Secret in source, memory, config, adapter output or audit reason. | compiler, memory, privacy, kernel, cli, adapters | Central `redactText`, `runEgressSecretScan`, compiler secret risks, memory hard gate. | Broader release checklist across all adapter surfaces. | Keep secret detection in `@atlas/privacy`; run egress scan before adapter/CLI output. | privacy redaction, compiler secret, memory/context secret tests. |
| 2 | Prompt/context leakage | Internal project knowledge can be sent to an external model raw. | `context` or `preflight` includes internal/confidential raw content. | privacy, memory, kernel, cli, adapters | Effective sink role, hard gate, context filtering, safe summaries. | More adapter-specific integration tests. | External targets receive summaries; adapters deny raw secret/confidential. | preflight hard gate, adapter privacy tests. |
| 3 | Memory poisoning | Malicious memory can become trusted context. | User stores instruction that asks agents to bypass policy. | memory, cognition, world-model, runtime | Memory encoding detects secret-like content, prompt policy, world model treats memory as prior. | More prompt-injection classifiers. | Downgrade suspicious memory to risk/debug note with `summarize_only` or `do_not_prompt`. | memory lifecycle and privacy tests. |
| 4 | Stale memory used as truth | Old memory can override source evidence. | Superseded/archived memory selected for context. | memory, privacy, world-model, cognition | Lifecycle status, hard gate for archived/superseded, reality check. | Automated source refresh workflow. | Treat memory as prior; inspect source/test/tool evidence before security-sensitive edits. | memory supersession, world-model contradiction tests. |
| 5 | Adapter output leaks sensitive data | Adapter receives data beyond policy scope. | Adapter asks for memory/raw secret scope or receives unscanned package. | cli, privacy, adapters | Adapter sandbox, forbidden scopes, egress scan, privacy profile. | Separate package for adapters when surface grows. | Default `requiresEgressScan=true`, raw secret/confidential false. | adapter scope/profile tests. |
| 6 | CLI accidentally prints secrets | Safe upstream object still contains a secret-like value. | `console.log(JSON.stringify(...))` on context/memory/preflight output. | cli, privacy | `printSafeJson` runs egress scan and redaction before printing. | Audit all future commands. | Use safe renderer for memory/context/preflight/privacy/world/cognition output. | CLI output and egress tests. |
| 7 | Tool execution abuse | Tool with admin/database/network/filesystem permissions runs accidentally. | Agent/runtime calls tool without permission gate. | security, tools, runtime | `ToolRegistry` calls `SecurityGuard.checkToolExecution`. Denied executions are audited. | Risk-level type on tools. | Keep all tool execution behind SecurityGuard and deny dangerous permissions by default. | tools/security/runtime tests. |
| 8 | Path traversal during compile | Compiler reads outside intended project root. | Symlink or traversal path escapes source boundary. | compiler | Symlinks skipped, realpath inside-root check, ignored secret files. | Race-condition hardening for hostile FS changes. | Never follow symlinks; check realpath before reading. | compiler symlink and ignored secret file tests. |
| 9 | Unsafe file read/write | CLI/adapters read arbitrary local files. | Adapter manifest path points outside cwd; future adapter accesses FS. | cli, adapters, compiler | Adapter manifest path constrained to cwd; adapter filesystem sandbox defaults none. | More reusable path guard package. | Resolve and validate local paths before reads. | adapter manifest path coverage should be expanded. |
| 10 | Malicious project input | Source files contain payloads that exploit parser/runtime. | Compiler executes target code or installs dependencies. | compiler | Compiler only reads text, does not execute/install target deps. | Fuzz tests for parser patterns. | Keep compiler static and bounded by size/binary checks. | compiler structure tests. |
| 11 | MCP resource exposure | MCP serves raw `.lmti` or secrets. | Resource endpoint exposes memory/AMF/config directly. | mcp, privacy, adapters | Policy notes and no raw `.lmti` exposure rule. | Dedicated MCP policy tests. | Expose policy-safe summaries only, no raw `.lmti` files. | To add when MCP surface expands. |
| 12 | Privacy policy bypass | Package bypasses `@atlas/privacy`. | Direct output path skips hard gate/redaction. | all | Privacy package centralizes redaction/access decisions; architecture tests guard boundaries. | Static import linting. | Require privacy gate before context/preflight/adapter/CLI output. | privacy/memory/CLI tests. |
| 13 | Audit log tampering | Security events can be edited unnoticed. | Modify `.lmti/privacy/audit.jsonl`. | privacy, cli | Hash chain, verify command, retention. | External immutable log optional later. | Run `lmti privacy audit --verify` and `lmti doctor --security`. | audit integrity tests. |
| 14 | Over-permissive role/model target | User widens role to make memory retrieval work. | `--role owner --include-secret` or adapter says local incorrectly. | privacy, cli, adapters | Effective context role uses sink role; adapter profile defaults external. | Policy around trusted local mode needs stronger UX. | Require explicit flags, audit sensitive access, default external for adapters. | preflight role tests. |
| 15 | Cross-project memory contamination | Memory from one project leaks into another. | Shared `.lmti` or mismatched projectId selected. | memory, privacy, preflight | Hard gate blocks wrong project IDs. | More CLI warnings for config/AMF mismatch. | Compare current project, AMF and memory `projectId`; block mismatches. | preflight hard gate tests. |

## Non-Goals

- No cloud secret manager is introduced in this pass.
- No external AI API is required.
- No target project code is executed by the compiler.

## Required Release Checks

- `pnpm build`
- `pnpm test`
- `lmti privacy audit --verify`
- `lmti doctor --security`
