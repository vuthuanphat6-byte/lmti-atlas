# Development

> Status: Local-alpha documentation

This document covers local development for contributors.

## Requirements

- Node.js 20 or newer.
- Corepack with pnpm.
- Node 24 is recommended for SQLite-backed memory flows because `node:sqlite`
  is used by project memory tests and commands.

## Setup

```bash
corepack pnpm install
```

## Build

```bash
corepack pnpm build
```

The build command uses TypeScript project references across packages and apps.

## Test

```bash
corepack pnpm test
```

## CLI Smoke Checks

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js doctor --security
node packages/cli/dist/index.js compile ./examples/sample-project
node packages/cli/dist/index.js context "fix packing label bug"
node packages/cli/dist/index.js preflight "permission routing issue" --role developer --model-target external_model
```

## Privacy Smoke Checks

```bash
node packages/cli/dist/index.js memory privacy-check
node packages/cli/dist/index.js privacy check
```

Do not paste real secrets into test commands. Use obvious fake values if a
fixture requires secret-like text.

## Package Notes

The root package is private. Public package distribution is not finalized.

The `lmti` CLI package currently has workspace dependencies, so publishing needs
a deliberate release process before it should be advertised as installable from
the npm registry.

