# Privacy Model

LMTI treats project memory as sensitive by default.

The project is local-first: it does not require a cloud service, external AI
API, hosted vector database, or remote memory backend.

## Privacy Levels

Product-facing vocabulary:

```text
public        Safe to show when relevant.
internal      Local project knowledge; external sinks receive summaries by default.
sensitive     Private/confidential project knowledge.
secret        Blocked from normal context and adapter output.
do_not_prompt Prompt policy that prevents memory from entering normal prompts.
```

Current code-level sensitivities are `public`, `internal`, `confidential`, and
`secret`. In product docs, `sensitive` maps to the private/confidential tier.
`do_not_prompt` is a prompt policy, not a sensitivity enum.

## Secret-Like Material

Do not store or export raw:

- API keys.
- Tokens.
- Passwords.
- Database URLs.
- Private keys.
- Cookies or sessions.
- `.env` values.
- Certificates or key files.
- Private customer, server, or deployment details.

Use placeholders such as `your_api_key_here` or `FAKE_TEST_TOKEN_VALUE` in tests
and docs.

## Default Behavior

If unsure, LMTI should fail closed:

- Secret memory is blocked from normal context.
- `do_not_prompt` memory is blocked from normal context.
- External model targets should not receive raw confidential memory.
- CLI output should pass through safe rendering and egress scanning.
- Adapter output should pass through privacy profile and sandbox checks.

## Privacy Gate Order

The current preflight path uses a metadata-first gate:

1. Read memory metadata.
2. Hard-block secret, `do_not_prompt`, wrong-project, unauthorized, deprecated,
   expired, or pending memory.
3. Load only allowed or summarized content.
4. Rank policy-safe memory.
5. Compile context.
6. Run egress scan.
7. Deliver only if adapter sandbox allows it.

## Lesson Candidate Gate

The Level 2 lesson pipeline proposes candidate lessons after a task. It is not
self-training and it is not automatic long-term memory.

Current rules:

- Store sanitized task observations and evidence summaries, not raw transcripts
  or raw diffs.
- If a diff matters, store only file/change summaries and source refs.
- Default suspicious content to `privacy_status=blocked` and
  `approval_status=needs_review`.
- Score confidence from source refs, files touched, command exit codes, passing
  tests, user decisions, repeated patterns, and privacy status.
- Penalize candidates based only on agent summary, partial or unknown outcomes,
  and privacy warnings.
- Do not include pending or rejected candidates in context retrieval.
- Convert a candidate into long-term project memory only after explicit
  approval.
- `lmti doctor --security` may warn about pending or risky candidates, but it
  must not approve them.

## Test Expectations

Changes to privacy-sensitive code should test:

- Secret-like strings are redacted or blocked.
- Blocked memory is not ranked as context.
- Pending lesson candidates are not ranked as context.
- Privacy-blocked lesson candidates cannot be approved.
- External model targets receive summaries instead of raw confidential content.
- CLI output does not print raw secrets.
- Adapter manifests cannot request direct memory or secret access in the MVP.
