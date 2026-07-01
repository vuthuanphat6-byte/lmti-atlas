# Security Boundaries

> Status: Security documentation

Date: 2026-06-29

Naming note: `@atlas/*` package names are internal local-alpha implementation
namespaces for LMTI. They are not a separate product identity.

| Package | Boundary |
| --- | --- |
| `@atlas/compiler` | Reads target projects as untrusted input. It must not execute target code, install target dependencies, follow symlinks or read ignored secret files. |
| `@atlas/privacy` | Owns access decisions, redaction, egress scanning and audit integrity. |
| `@atlas/memory` | Owns memory lifecycle and retrieval. It must not output raw sensitive memory without privacy context. |
| `@atlas/kernel` | Builds Context Packs from AMF and policy-safe memory only. |
| `@atlas/cognition` | Selects focus and broadcasts policy-safe summaries/metadata only. |
| `@atlas/world-model` | Treats memory as prior belief and external/source/test/tool input as observations. |
| `@atlas/security` | Owns tool permission decisions through `SecurityGuard`. |
| `@atlas/tools` | Must declare permissions and execute only after SecurityGuard approval. |
| `@atlas/runtime` | Orchestrates memory, kernel, cognition, tools and security; it must not bypass privacy or tool gates. |
| `@atlas/cli` | Parses commands and renders safe output. It must not print raw secret-like material. |
| `@atlas/adapters` | Render policy-safe output only; no raw memory reads and no self-built context. |
| `@atlas/mcp` | Must not expose raw `.lmti` files or raw memory resources. |

## Default Permission Posture

- Allowed tool permissions: `read`, `execute`
- Denied by default: `write`, `network`, `filesystem`, `database`, `admin`

Dangerous tools must provide a clear denial reason and audit event.
