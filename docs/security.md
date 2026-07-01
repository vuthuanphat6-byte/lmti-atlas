# Security Model

> Status: Local-alpha documentation

LMTI is a local AI memory and safety layer. Its default posture is to minimize
data exposure and block risky workflows before they publish or leak context.

Privacy levels:

| Privacy | Rule |
| --- | --- |
| `public` | May be exported or published. |
| `internal` | Local use; summarize before agent prompt delivery when possible. |
| `private` | Do not export publicly. |
| `secret` | Never print raw. |
| `do_not_prompt` | Never include in agent context. |

Required guardrails:

- Agent adapters must not read SQLite directly.
- Memory retrieval filters privacy before returning context.
- Publish, push, PR, deploy, memory export, sensitive file read, context
  retrieval, and database migration must pass through a policy gate.
- Protected file paths such as `.env`, key files, secret folders, and private
  SQLite stores are blocked by publish preflight.
- JSON output must include versioned envelopes and clear error codes.
