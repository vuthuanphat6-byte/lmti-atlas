# Security Model

LMTI is security-first, privacy-first and local-first.

Core rules:

- deny by default
- least privilege
- no raw secret output
- all external input is untrusted
- all tool execution must pass SecurityGuard
- all adapter output must be policy-safe
- memory is prior belief, not verified truth

See `docs/security/` for detailed threat model and checklist.
