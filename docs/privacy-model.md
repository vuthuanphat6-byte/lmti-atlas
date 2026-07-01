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

## Test Expectations

Changes to privacy-sensitive code should test:

- Secret-like strings are redacted or blocked.
- Blocked memory is not ranked as context.
- External model targets receive summaries instead of raw confidential content.
- CLI output does not print raw secrets.
- Adapter manifests cannot request direct memory or secret access in the MVP.

