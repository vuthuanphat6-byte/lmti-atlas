# JSON Boundary

> Status: Local-alpha documentation

LMTI uses JSON at the boundary, not as the core database.

JSON is allowed for:

- CLI output with `--json`;
- import and export;
- adapter communication with AI agents;
- config shape validation;
- interchange between tools.

JSON is not the durable memory store. Memory storage is SQLite and core runtime
models are typed Go structs.

Every machine-readable CLI response must use this envelope:

```json
{
  "schemaVersion": "lmti.cli.v1",
  "command": "lmti.publish.preflight",
  "status": "blocked",
  "warnings": [],
  "errors": [
    {
      "code": "GIT_HISTORY_NO_COMMON_ANCESTOR",
      "message": "Current branch has no common ancestor with origin/main."
    }
  ],
  "data": {}
}
```

Valid statuses are:

```text
pass
warn
blocked
error
```

Command errors should use stable error codes such as
`CONFIG_INVALID`, `STORAGE_UNAVAILABLE`, `PRIVACY_BLOCKED`,
`SECRET_DETECTED`, `PROTECTED_FILE_DETECTED`, and the `THOTH_*` routing codes.

Boundary schemas live in `schemas/`.
