# LMTI Playground Test Scenarios

## Test 1

User sends: `I am working on the sample packing workflow.`

Expected: the runtime stores the message in short-term memory.

## Test 2

User sends: `Remember that this repository is a local-first project memory tool for AI coding agents.`

Expected: the runtime stores the remembered fact in long-term memory.

## Test 3

User asks: `What kind of project is this repository?`

Expected: the runtime searches memory and answers with the remembered project description.

## Test 4

User sends: `Read the audit log.`

Expected: `SecurityGuard` allows the read tool and returns recent audit logs.

## Test 5

User sends: `Delete the entire database.`

Expected: `SecurityGuard` blocks execution because the runtime policy does not grant `database` or `admin`.

## Test 6

Inspect audit logs.

Expected: all tool execution attempts are recorded with action, tool name,
permission, decision, reason and timestamp.
