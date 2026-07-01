# Host Project Boundary

LMTI can be installed inside another repository, but it is not part of that repository's application runtime.

## Rule

LMTI is connected by context, not by runtime ownership.

## When Installed In A Host Project

LMTI may create local files such as `.lmti/` for project memory, compiled context, indexes, lessons, runtime metadata, and diagnostics.

Those files support AI agents. They must not be treated as:

- backend modules
- frontend modules
- business features
- production services
- route/controller/service layers
- application deployment dependencies

## Agent Behavior

Agents may read LMTI context and preflight output as guidance.

Agents must still verify source code, tests, build output, runtime behavior, and explicit user instructions before editing.

Memory is prior belief, not truth.

## Privacy Boundary

Do not store raw chat, raw secrets, raw customer data, or unverified hallucinations as LMTI memory.

Do not bypass privacy gates to make context retrieval easier.

External models should receive only the minimum policy-safe context required for the task.
