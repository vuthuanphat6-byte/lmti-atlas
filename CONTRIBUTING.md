# Contributing

Thanks for helping improve LMTI-Atlas.

Before opening a pull request:

- Do not include `.lmti`, `.atlas`, `.env`, credentials, tokens, keys, certificates or private customer data.
- Run `corepack pnpm build`.
- Run `corepack pnpm test`.
- Keep security-sensitive examples synthetic and clearly fake.
- Prefer local-first behavior and policy-safe output.

Pull requests should explain:

- why the change is needed
- which module owns the responsibility
- whether memory/context/privacy behavior changed
- whether new security risks were introduced
