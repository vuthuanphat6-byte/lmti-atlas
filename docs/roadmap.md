# Roadmap

> Status: Planned direction

## Current Direction

```text
Go = Core Runtime
SQLite = Local Memory Storage
TOML = Human Config
JSON = CLI/API Boundary
JSON Schema = Contract Validation
```

## Phase 1

- Keep the existing TypeScript CLI stable.
- Add Go core models, policy interface, JSON envelope, and storage schema.
- Keep `lmti publish preflight` as the safety gate.
- Document TOML config and JSON boundary.

## Phase 2

- Move memory write/search/retrieve paths behind the Go core.
- Add canonical `.lmti/memory.sqlite` migrations.
- Add `lmti migrate from-json`.
- Expand doctor checks for config, migration, adapter, and identity.

## Deferred

- Protobuf.
- gRPC.
- Separate SDKs for C#, Rust, or additional languages.
- Distributed platform features.
