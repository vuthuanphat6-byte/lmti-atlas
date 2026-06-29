# Privacy Policy

Date: 2026-06-29

LMTI treats project knowledge as sensitive by default. Privacy decisions must be
explainable and auditable.

## Sensitivity Rules

| Sensitivity | Default | Raw Output |
| --- | --- | --- |
| `public` | Allowed when prompt policy permits. | Allowed unless egress scan blocks it. |
| `internal` | Local trusted roles can use it; external models receive summaries. | Only local trusted roles in explicit raw flows. |
| `confidential` | Summarize by default. | Owner/maintainer with explicit `includeRaw`; never raw to external model. |
| `secret` | Denied from normal context, preflight and adapter output. | Owner only with `includeSecret` and `includeRaw` in allowed local commands. |

## Prompt Policy

- `allow_raw`: raw content may be used only when sensitivity and sink policy allow it.
- `summarize_only`: output summaries, metadata or redacted content only.
- `do_not_prompt`: never enter context, prompt, preflight or adapter output.

## Required Gates

1. Memory metadata hard gate before loading content.
2. Privacy evaluation before raw memory access.
3. Egress scan before adapter output.
4. Safe CLI renderer before printing JSON.
5. Audit event for sensitive access, blocked egress, adapter block and policy violation.

## Secret Handling

Secret detection and redaction are centralized in `@atlas/privacy`:

- `redactSecrets()`
- `redactPII()`
- `redactText()`
- `hasSecretLikeMaterial()`
- `runEgressSecretScan()`

Other packages must not create competing secret regex sets.
