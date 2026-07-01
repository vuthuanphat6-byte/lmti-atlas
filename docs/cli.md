# CLI

Run the CLI from source until package distribution is finalized:

```bash
node packages/cli/dist/index.js --help
```

If the package is linked or installed locally, use the equivalent `lmti ...`
commands.

## Current Status

- Stable local workflow: `init`, `compile`, `inspect`, `context`,
  `preflight`, `doctor`, `attach codex`, `memory`, and `task done`.
- Experimental or diagnostic surfaces: `framework`, `actions`, `mind`,
  `cognition`, `world`, `experiment`, `benchmark`, and `privacy audit`.
- Planned names are listed at the end of this file. They should not be shown as
  working aliases until the CLI implements them.

## Core Commands

### `lmti init`

Creates local `.lmti` storage.

```bash
node packages/cli/dist/index.js init
```

Privacy note: `.lmti/` is local runtime state and should not be committed.

### `lmti compile [projectPath]`

Builds `.lmti/project.amf.json`.

```bash
node packages/cli/dist/index.js compile ./examples/sample-project
```

Privacy note: compile treats target projects as untrusted input and should skip
ignored secret files.

### `lmti inspect [amfPath]`

Prints Project Atlas / AMF stats.

```bash
node packages/cli/dist/index.js inspect
```

### `lmti context "<task>"`

Builds a task-specific Context Pack.

```bash
node packages/cli/dist/index.js context "fix packing label bug"
```

Expected output: JSON with inferred intent, selected modules/files, memory
selection, and filtered counts.

### `lmti preflight "<task>"`

Builds a policy-safe MVP context package with hard memory gates.

```bash
node packages/cli/dist/index.js preflight "permission routing issue" --role developer --model-target external_model
```

Expected output: JSON with observer frame, selected memories, blocked memories,
risk signals, predicted failures, constraints, final context package, egress
scan result, adapter sandbox result, and metrics.

### `lmti doctor [--fix|--security]`

Diagnoses storage, AMF noise, ignore rules, migration state, and security
posture.

```bash
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js doctor --security
```

## Codex Workflow

### `lmti attach codex`

Adds LMTI guidance to `AGENTS.md` without deleting existing content.

```bash
node packages/cli/dist/index.js attach codex
```

## Memory Commands

```bash
node packages/cli/dist/index.js memory init
node packages/cli/dist/index.js memory add --title "Packing rule" --content "A label can print only after all items are completed."
node packages/cli/dist/index.js memory search "packing label"
node packages/cli/dist/index.js memory retrieve "fix packing label bug"
node packages/cli/dist/index.js memory lesson propose --task "Packing fix" --lesson "Verify label-group completion before printing." --files-touched src/orders/packing.ts:modified --commands "npm test:0" --tests "npm test:pass" --outcome pass
node packages/cli/dist/index.js memory lesson candidates
node packages/cli/dist/index.js memory lesson show <candidateId>
node packages/cli/dist/index.js memory lesson approve <candidateId>
node packages/cli/dist/index.js memory lesson reject <candidateId>
node packages/cli/dist/index.js memory stats
node packages/cli/dist/index.js memory privacy-check
node packages/cli/dist/index.js memory context "fix packing label bug"
```

Privacy note: memory writes and retrieval pass through privacy checks. Lesson
proposal is Level 2 only: it does not train a model, does not store raw diffs,
and does not auto-approve candidates. Pending lesson candidates are not
included in context retrieval.

Short memory:

```bash
node packages/cli/dist/index.js memory short:add --title "Current checkpoint" --content "Inspect preflight next." --priority medium
node packages/cli/dist/index.js memory short:retrieve "preflight"
node packages/cli/dist/index.js memory short:expire
node packages/cli/dist/index.js memory short:cleanup --dry-run
node packages/cli/dist/index.js memory short:evaluate <noteId>
node packages/cli/dist/index.js memory short:promote <noteId> --reason "Durable lesson"
```

Lifecycle:

```bash
node packages/cli/dist/index.js memory consolidate
node packages/cli/dist/index.js memory decay
node packages/cli/dist/index.js memory reinforce <id> --success true
node packages/cli/dist/index.js memory review
node packages/cli/dist/index.js memory associations <id>
node packages/cli/dist/index.js memory explain "partner permission route"
```

## Task And Lesson Commands

```bash
node packages/cli/dist/index.js remember --kind rule --title "Route rule" --content "Partner users route through /partner." --tags routing,permission --prompt-policy summarize_only
node packages/cli/dist/index.js task done --title "Partner route fix" --summary "Confirmed routing behavior." --lesson "Partner users route through /partner."
node packages/cli/dist/index.js memory lesson candidates --approval-status pending
node packages/cli/dist/index.js memory lesson approve <candidateId>
```

`task done --lesson` and `memory lesson propose` create lesson candidates.
Approval is a separate step so a privacy warning, weak evidence, or low
confidence score does not become long-term memory automatically. `remember` is
for deliberate non-lesson memory such as rules and decisions.

## Experimental Framework Commands

These commands expose local framework detection and verification metadata. They
are useful for development, but they are not a complete framework integration
platform.

```bash
node packages/cli/dist/index.js framework detect
node packages/cli/dist/index.js framework list
node packages/cli/dist/index.js framework info
node packages/cli/dist/index.js framework commands
node packages/cli/dist/index.js framework risk-zones
node packages/cli/dist/index.js framework verify-plan --task "fix auth middleware" --files middleware.ts
node packages/cli/dist/index.js framework monorepo-map
```

## Experimental Action View Commands

These commands write local session metadata for Codex-oriented workflow
inspection. They are not a hosted dashboard or team audit product.

```bash
node packages/cli/dist/index.js actions start --task "fix permission routing"
node packages/cli/dist/index.js actions log --session-id <id> --type file_read --file src/auth/middleware.ts
node packages/cli/dist/index.js actions command --session-id <id> --command "npm test" --exit-code 0
node packages/cli/dist/index.js actions decision --session-id <id> --decision "Keep least privilege" --reason "403 is expected for partner role"
node packages/cli/dist/index.js actions reflection --session-id <id> --summary "Fixed route safely" --tests-run "npm test"
node packages/cli/dist/index.js actions end --session-id <id> --status completed
node packages/cli/dist/index.js actions list
node packages/cli/dist/index.js actions show <session-id>
node packages/cli/dist/index.js actions risks
node packages/cli/dist/index.js actions replay <session-id>
```

Privacy note: Action View stores summaries and metadata. It is not a secret
vault.

## Experimental And Diagnostic Commands

These commands exist in the current CLI, but they are best treated as
diagnostic/development surfaces rather than the primary user workflow.

```bash
node packages/cli/dist/index.js migrate --yes
node packages/cli/dist/index.js experiment thinking "fix packing label bug"
node packages/cli/dist/index.js mind context "fix permission routing issue 403"
node packages/cli/dist/index.js mind explain "deploy production"
node packages/cli/dist/index.js cognition run "permission routing issue"
node packages/cli/dist/index.js world check "fix partner dashboard 403"
node packages/cli/dist/index.js privacy audit --verify
node packages/cli/dist/index.js privacy check
node packages/cli/dist/index.js benchmark preflight "permission routing issue" --runs 5
```

## Not Implemented As Aliases Today

These names may appear in roadmap discussions, but they are not current CLI
commands:

```text
lmti atlas build
lmti atlas inspect
lmti context build --task "..."
lmti context explain --task "..."
lmti adapter list
lmti adapter test
```

Use the real commands documented above.
