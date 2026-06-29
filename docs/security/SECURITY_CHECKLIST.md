# Security Checklist

Date: 2026-06-29

Use this checklist before release or before enabling a new adapter/tool.

- [ ] No raw secret in CLI output.
- [ ] No target code execution during compile.
- [ ] `.env`, key/cert/token/private files are ignored by compiler.
- [ ] Symlinks are skipped by compiler.
- [ ] Privacy tests pass.
- [ ] Adapter egress scan passes.
- [ ] Tool permission tests pass.
- [ ] Audit integrity verifies with `lmti privacy audit --verify`.
- [ ] `lmti doctor --security` is pass or only accepted warnings.
- [ ] Memory schema has `sensitivity` and `promptPolicy`.
- [ ] Secret-like memory is marked `secret` or `do_not_prompt`.
- [ ] External model output is summary/metadata only for internal/confidential/secret.
- [ ] MCP resources are policy-safe and do not expose raw `.lmti` files.
- [ ] Cross-project memory retrieval is blocked unless explicitly allowed.
- [ ] `pnpm build` passes.
- [ ] `pnpm test` passes.
