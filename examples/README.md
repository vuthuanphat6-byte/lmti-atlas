# Examples

Examples show how to try LMTI locally without a published package.

## Sample Project

The repository includes:

```text
examples/sample-project/
```

It is a small TypeScript project used by compiler, context, and CLI examples.

## Codex Workflow From Source

From the repository root:

```bash
corepack pnpm install
corepack pnpm build
node packages/cli/dist/index.js init
node packages/cli/dist/index.js compile ./examples/sample-project
node packages/cli/dist/index.js context "fix a failing packing label test"
node packages/cli/dist/index.js preflight "fix a failing packing label test" --role developer --model-target external_model
node packages/cli/dist/index.js doctor
```

Expected context/preflight output should include:

- Task intent.
- Relevant Project Atlas context.
- Relevant project memory when available.
- Privacy status and blocked-memory summaries.
- Verification requirements or suggested checks.
- Constraints for the agent.

## Capture A Lesson

Use a safe, reusable lesson after a task:

```bash
node packages/cli/dist/index.js task done --title "Packing label fix" --summary "Verified label-group completion behavior." --lesson "Before printing a packing label, verify all products in the label group are completed."
```

Do not store raw secrets, private customer data, or internal deployment details
as lesson content.

