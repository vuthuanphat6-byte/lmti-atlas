# LMTI Debug Guide

LMTI is a local project memory/context layer for AI coding agents. Treat it as advisory context. Source code, tests and command output remain the verification source.

## Run Locally

Use the local CLI artifact when global `lmti` is not in `PATH`:

```powershell
node packages\cli\dist\index.js --help
node packages\cli\dist\index.js doctor
node packages\cli\dist\index.js compile
```

Root fallback scripts provide the same path through npm:

```powershell
npm run lmti -- --help
npm run lmti:doctor
npm run lmti:compile
npm run lmti:memory:stats
```

## Link CLI

The package exposes these bins in `packages/cli/package.json`:

- `lmti` - primary public CLI command.
- `atlas` - legacy/internal local-alpha alias.

For local development, prefer `npm exec -- lmti --help` or `.\node_modules\.bin\lmti.CMD --help` on Windows. If a global command is required, link with the workspace package manager after verifying it is available:

```powershell
corepack pnpm --version
corepack pnpm --dir packages/cli link --global
```

Do not install similarly named packages from the public registry unless their source and ownership are verified.

## Configure `.lmtiignore`

`.lmtiignore` is applied by the compiler before AMF generation. Use it to exclude build output, legacy websites, heavy assets, local runtime data and secrets:

```gitignore
node_modules/
dist/
build/
.next/
coverage/
wp-admin/
wp-includes/
wp-content/
public/uploads/
public/assets/
*.min.js
*.map
*.zip
*.bak
*.dump
*.sql
!.env.example
```

Keep `.env`, private keys, certs, tokens and local configs blocked. Keep `.env.example` only if it contains placeholders.

## Rebuild AMF

After changing ignore rules:

```powershell
node packages\cli\dist\index.js compile
node packages\cli\dist\index.js doctor
```

`doctor` reports AMF size, indexed files, top folders, zones, WordPress/assets noise and whether `.lmtiignore` was applied.

## Trust Boundary

Use LMTI to reduce repeated scanning, not to replace verification.

- Memory and AMF are prior belief, not source of truth.
- Verify endpoints, schemas, imports and modules with `rg` or file reads before editing.
- If AMF conflicts with source code, source code wins.
- Do not delete files based only on AMF; prove there are no imports or references.
- Do not expose raw secret memory to external models.
