# Adapter Contract

> Status: Local-alpha documentation

LMTI is Codex-first today. Other AI coding agents are planned through the
adapter layer, but this repository should not claim full support for every
agent until adapters are implemented, tested, and documented.

## Goals

Adapters should:

- Receive task-specific, policy-safe context.
- Respect privacy and model-target rules.
- Run preflight before context delivery when needed.
- Avoid direct raw memory-store access.
- Propose safe lesson candidates after a task when explicitly requested.
- Keep agent-specific behavior outside the core memory and privacy packages.

## Conceptual Interface

```ts
interface AgentAdapter {
  name: string;
  capabilities: AgentCapabilityProfile;
  buildContext(task: AgentTask): Promise<AgentContext>;
  runPreflight?(options: PreflightOptions): Promise<PreflightResult>;
  proposeLesson?(lesson: LessonInput): Promise<void>;
}
```

This is a documentation-level interface. The current executable MVP path lives
in the CLI preflight and adapter manifest sandbox.

## Capability Profile

An adapter should declare:

- Supported context delivery mode.
- Whether it targets a local agent or external model.
- Allowed scopes.
- Whether it can write lessons.
- Whether it can execute tools.
- Whether it requires egress scanning.

## Privacy Rules

Default adapter posture:

- No raw secret output.
- No raw confidential output to external model targets.
- No direct memory-store access.
- No audit-store access.
- No filesystem or network access unless explicitly reviewed.
- Egress scan before delivery.

## Current CLI Path

```bash
node packages/cli/dist/index.js preflight "fix adapter preflight logic" --role developer --model-target external_model
node packages/cli/dist/index.js context "fix adapter preflight logic" --adapter codex
```

Known adapter ids exist for manifest validation, but Codex is the current
priority workflow.

## Roadmap

- Move more adapter orchestration out of `packages/cli`.
- Add package-level adapter APIs.
- Add more agent-specific smoke tests.
- Add local dashboard or terminal review for adapter output.
