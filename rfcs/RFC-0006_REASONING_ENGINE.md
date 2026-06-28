# RFC-0006: Reasoning Engine

Status: Draft

## Question

How does ATLAS reason from structured understanding?

## Scope

This RFC will define how ATLAS creates context, selects knowledge, checks
constraints, makes decisions and verifies reasoning paths.

## Required Design Pressure

The RFC must answer:

* What inputs can reasoning consume?
* How is context generated from structured understanding?
* How are reasoning traces represented?
* How does verification work?
* How are external models used without becoming the architecture?
* How is reasoning benchmarked?

## Non-Goals

* blind prompt construction,
* model-vendor lock-in,
* sending confidential raw memory to external models.
