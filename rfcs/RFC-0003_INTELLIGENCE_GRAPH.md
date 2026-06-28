# RFC-0003: Intelligence Graph

Status: Draft

## Question

How does ATLAS represent structured understanding as relationships?

## Scope

This RFC will define the Intelligence Graph as a model of meaning,
relationships, constraints, risks and decisions.

## Required Design Pressure

The RFC must answer:

* What belongs in the graph?
* What must never enter the graph in raw form?
* How are relationships verified?
* How are confidence and uncertainty represented?
* How does the graph evolve after tasks?
* How can the graph backend be replaced?

## Non-Goals

* becoming a generic graph database,
* storing raw source code as nodes,
* exposing confidential relationships to external models.
