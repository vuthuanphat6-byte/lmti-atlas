# Host Project Boundary

LMTI can be installed or attached inside another repository to help AI coding
agents understand the host project.

When installed in a host repository, LMTI is not part of the host application
runtime.

LMTI is connected by context, not by runtime ownership.

## Agent Rules

- Treat `.lmti/` as external intelligence infrastructure.
- Do not import LMTI into host application runtime code.
- Do not move LMTI into host `src`, `app`, `pages`, `components`, `services`,
  `controllers`, `routes`, `modules`, or feature folders.
- Do not treat LMTI as a backend module, frontend module, service, controller,
  route, repository, or business domain component.
- Do not delete `.lmti` memory, index, lesson, privacy, or runtime data during
  normal host project cleanup.
- Modify LMTI only when the task explicitly asks for LMTI changes.
- Treat LMTI memory as prior belief, not truth.
- Verify against source code, tests, command output, and explicit user
  instruction before acting.

## Privacy Boundary

Do not store raw chat, raw secrets, raw customer data, or unverified
hallucinations as LMTI memory.

Do not bypass privacy gates to make context retrieval easier.

External models should receive only the minimum policy-safe context required for
the task.
