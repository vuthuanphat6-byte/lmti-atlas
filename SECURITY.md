# Security Policy

LMTI handles project memory, context routing, and privacy gates for AI coding
agents. Security reports are taken seriously, especially anything that can leak
private project knowledge into an agent prompt.

## Reporting A Vulnerability

If GitHub private vulnerability reporting is enabled for this repository, use
that channel.

If private reporting is not available yet, open a minimal public issue that says
you have a security report, but do not include exploit details, secrets, tokens,
private paths, customer data, or raw memory content. The maintainer should then
provide a private contact path.

TODO for project owner: choose and publish an official security contact before
public release.

## Do Not Include Secrets

Never include real secrets in a report:

- API keys or access tokens.
- Passwords or session cookies.
- Private keys or certificates.
- Database URLs.
- `.env` contents.
- Private customer, server, or deployment details.

Use placeholders such as `example_token_do_not_use` when describing a class of
issue.

## Security Scope

Useful security reports include:

- Secret leakage through context, preflight, adapters, CLI output, or logs.
- Privacy gate bypasses.
- Unsafe context export to external model targets.
- Path traversal or unsafe file access.
- Compiler reads outside the intended project boundary.
- Destructive `doctor`, `compile`, `preflight`, or migration behavior.
- Adapter manifest sandbox bypasses.
- Raw memory exposure through MCP, runtime, or action replay paths.
- Cross-project memory contamination.

## Supported Versions

LMTI is in Local Alpha. There are no supported stable release lines yet.

Security fixes currently target the default branch until the project publishes a
versioned release policy.

## Responsible Disclosure

Please give maintainers reasonable time to investigate before public disclosure.
For high-impact issues, include:

- A minimal reproduction.
- The command or API used.
- Expected safe behavior.
- Actual unsafe behavior.
- Whether the issue affects prompt/context export.
- Sanitized logs without secrets.

