# LMTI Threat Model

> Status: Security documentation

Date: 2026-06-29

LMTI treats project knowledge, memory, context, adapter output and audit
data as sensitive by default. The security posture is deny by default, least
privilege, privacy-first, local-first and no raw secret output.

Naming note: `@atlas/*` remains an internal local-alpha package namespace. It is
not a separate public product identity.

## Threats

### 1. Secret Leakage

- Risk: credentials can be exposed to CLI output, context, AMF, or adapters.
- Path: secret in source, memory, config, adapter output, or audit reason.
- Affected modules: compiler, memory, privacy, kernel, CLI, adapters.
- Current protection: `redactText`, `runEgressSecretScan`, compiler secret
  risks, and memory hard gates.
- Gap: broader release checklist across adapter surfaces.
- Mitigation: keep secret detection in `@atlas/privacy` and run egress scans
  before adapter or CLI output.
- Coverage: privacy redaction, compiler secret, memory/context secret tests.

### 2. Prompt Or Context Leakage

- Risk: internal project knowledge can be sent to an external model raw.
- Path: `context` or `preflight` includes internal/confidential raw content.
- Affected modules: privacy, memory, kernel, CLI, adapters.
- Current protection: effective sink role, hard gate, context filtering, and
  safe summaries.
- Gap: more adapter-specific integration tests.
- Mitigation: external targets receive summaries; adapters deny raw
  secret/confidential memory.
- Coverage: preflight hard gate and adapter privacy tests.

### 3. Memory Poisoning

- Risk: malicious memory can become trusted context.
- Path: user stores an instruction that asks agents to bypass policy.
- Affected modules: memory, cognition, world-model, runtime.
- Current protection: memory encoding detects secret-like content, prompt
  policy, and world model treats memory as prior.
- Gap: more prompt-injection classifiers.
- Mitigation: downgrade suspicious memory to risk/debug notes with
  `summarize_only` or `do_not_prompt`.
- Coverage: memory lifecycle and privacy tests.

### 4. Stale Memory Used As Truth

- Risk: old memory can override source evidence.
- Path: superseded or archived memory selected for context.
- Affected modules: memory, privacy, world-model, cognition.
- Current protection: lifecycle status, hard gate for archived/superseded
  memory, and reality checks.
- Gap: automated source refresh workflow.
- Mitigation: treat memory as prior and inspect source/test/tool evidence
  before security-sensitive edits.
- Coverage: memory supersession and world-model contradiction tests.

### 5. Adapter Output Leaks Sensitive Data

- Risk: adapter receives data beyond policy scope.
- Path: adapter asks for memory/raw-secret scope or receives an unscanned
  package.
- Affected modules: CLI, privacy, adapters.
- Current protection: adapter sandbox, forbidden scopes, egress scan, privacy
  profile.
- Gap: separate adapter package when the surface grows.
- Mitigation: default `requiresEgressScan=true` and raw secret/confidential
  access false.
- Coverage: adapter scope/profile tests.

### 6. CLI Accidentally Prints Secrets

- Risk: a safe upstream object still contains a secret-like value.
- Path: direct `console.log(JSON.stringify(...))` on context, memory, or
  preflight output.
- Affected modules: CLI, privacy.
- Current protection: `printSafeJson` runs egress scan and redaction.
- Gap: audit all future commands.
- Mitigation: use safe renderers for memory, context, preflight, privacy, world,
  and cognition output.
- Coverage: CLI output and egress tests.

### 7. Tool Execution Abuse

- Risk: a tool with admin, database, network, or filesystem permissions runs
  accidentally.
- Path: agent/runtime calls a tool without a permission gate.
- Affected modules: security, tools, runtime.
- Current protection: `ToolRegistry` calls `SecurityGuard.checkToolExecution`;
  denied executions are audited.
- Gap: risk-level type on tools.
- Mitigation: keep tool execution behind `SecurityGuard` and deny dangerous
  permissions by default.
- Coverage: tools, security, and runtime tests.

### 8. Path Traversal During Compile

- Risk: compiler reads outside the intended project root.
- Path: symlink or traversal path escapes the source boundary.
- Affected modules: compiler.
- Current protection: symlinks skipped, realpath inside-root check, ignored
  secret files.
- Gap: race-condition hardening for hostile filesystem changes.
- Mitigation: never follow symlinks; check realpath before reading.
- Coverage: compiler symlink and ignored-secret-file tests.

### 9. Unsafe File Read/Write

- Risk: CLI or adapters read arbitrary local files.
- Path: adapter manifest path points outside cwd; future adapter accesses the
  filesystem.
- Affected modules: CLI, adapters, compiler.
- Current protection: adapter manifest path constrained to cwd; adapter
  filesystem sandbox defaults to none.
- Gap: more reusable path guard package.
- Mitigation: resolve and validate local paths before reads.
- Coverage: adapter manifest path coverage should expand.

### 10. Malicious Project Input

- Risk: source files contain payloads that exploit parser/runtime behavior.
- Path: compiler executes target code or installs dependencies.
- Affected modules: compiler.
- Current protection: compiler only reads text and does not execute/install
  target dependencies.
- Gap: fuzz tests for parser patterns.
- Mitigation: keep compiler static and bounded by size/binary checks.
- Coverage: compiler structure tests.

### 11. MCP Resource Exposure

- Risk: MCP serves raw `.lmti` data or secrets.
- Path: resource endpoint exposes memory, AMF, or config directly.
- Affected modules: MCP, privacy, adapters.
- Current protection: policy notes and no raw `.lmti` exposure rule.
- Gap: dedicated MCP policy tests.
- Mitigation: expose policy-safe summaries only.
- Coverage: to add when MCP surface expands.

### 12. Privacy Policy Bypass

- Risk: a package bypasses `@atlas/privacy`.
- Path: direct output path skips hard gate or redaction.
- Affected modules: all.
- Current protection: privacy package centralizes redaction/access decisions;
  architecture tests guard boundaries.
- Gap: static import linting.
- Mitigation: require a privacy gate before context, preflight, adapter, or CLI
  output.
- Coverage: privacy, memory, and CLI tests.

### 13. Audit Log Tampering

- Risk: security events can be edited unnoticed.
- Path: modification of `.lmti/privacy/audit.jsonl`.
- Affected modules: privacy, CLI.
- Current protection: hash chain, verify command, retention.
- Gap: optional external immutable log later.
- Mitigation: run `lmti privacy audit --verify` and `lmti doctor --security`.
- Coverage: audit integrity tests.

### 14. Over-Permissive Role Or Model Target

- Risk: user widens role to make memory retrieval work.
- Path: `--role owner --include-secret` or adapter incorrectly claims local
  execution.
- Affected modules: privacy, CLI, adapters.
- Current protection: effective context role uses sink role; adapter profile
  defaults external.
- Gap: trusted local mode needs stronger UX.
- Mitigation: require explicit flags, audit sensitive access, and default
  adapters to external.
- Coverage: preflight role tests.

### 15. Cross-Project Memory Contamination

- Risk: memory from one project leaks into another.
- Path: shared `.lmti` or mismatched `projectId`.
- Affected modules: memory, privacy, preflight.
- Current protection: hard gate blocks wrong project IDs.
- Gap: more CLI warnings for config/AMF mismatch.
- Mitigation: compare current project, AMF, and memory `projectId`; block
  mismatches.
- Coverage: preflight hard gate tests.

## Non-Goals

- No cloud secret manager is introduced in this pass.
- No external AI API is required.
- No target project code is executed by the compiler.

## Required Release Checks

- `pnpm build`
- `pnpm test`
- `lmti privacy audit --verify`
- `lmti doctor --security`
