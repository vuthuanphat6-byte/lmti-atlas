# Agent Usage

> Status: Local-alpha documentation

AI agents should use LMTI through JSON output. Prefer the friendly `skill`
commands for normal routing and reserve `thoth` commands for diagnostics.

## Main Flow

```text
1. Receive the user task.
2. Run lmti skill route "<task>" --json.
3. Read data.selectedSkill.
4. Run lmti skill show <skill-id> --json if instructions are needed.
5. If requiresMemory is true, request safe memory by intent.
6. If requiresPolicy is true, run the recommended policy gate.
7. Solve the task using the selected skill.
8. Report changed files, verification, blockers, and lesson candidates.
```

## Commands

| Agent needs | Command |
|---|---|
| Choose skill | `lmti skill route "<task>" --json` |
| Load selected skill | `lmti skill show <skill-id> --json` |
| Inspect metadata | `lmti thoth inspect <skill-id> --json` diagnostic only |
| Get safe memory | `lmti memory retrieve --intent <intent> --json` |
| Run publish safety | `lmti publish check --json` |
| Check LMTI health | `lmti doctor --json` |
| Check policy | `lmti policy check --action <action> --json` |
| Inspect config | `lmti config inspect --json` |

## JSON Envelope

Agent JSON uses:

```json
{
  "schemaVersion": "lmti.cli.v1",
  "command": "lmti.skill.route",
  "status": "pass",
  "warnings": [],
  "errors": [],
  "data": {}
}
```

Valid statuses:

```text
pass
warn
blocked
error
```

## Example

```bash
lmti skill route "Clean the repository and prepare for open-source publishing." --json
```

Expected shape:

```json
{
  "schemaVersion": "lmti.cli.v1",
  "command": "lmti.skill.route",
  "status": "warn",
  "warnings": [
    {
      "code": "THOTH_MULTIPLE_SKILLS_MATCHED",
      "message": "More than one skill matched the request. LMTI selected the highest-risk relevant skill first."
    }
  ],
  "errors": [],
  "data": {
    "intent": "publish",
    "decision": "multiple_candidates",
    "selectedSkill": {
      "id": "publish-preflight",
      "file": "skills/publish-preflight/skill.md",
      "riskLevel": "high"
    },
    "secondarySkills": [
      {
        "id": "repo-cleanup",
        "reason": "repo-cleanup matched too, but publish-preflight has higher risk priority for this request."
      }
    ],
    "requiresPolicy": true,
    "requiresMemory": false,
    "recommendedCommands": ["lmti publish check"]
  }
}
```

## Privacy Boundary

Agents must not read `.lmti/memory.sqlite` or raw memory JSON directly.

When routing returns `requiresMemory = true`, call the memory CLI with a maximum
privacy level appropriate for the sink. Do not retrieve `secret` or
`do_not_prompt` memory into model context.
