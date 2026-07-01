# Skill: Documentation

## Purpose
Use this skill to write or update LMTI documentation accurately and without inflated product claims.

## When to use
- The user asks for README, docs, architecture notes, roadmap text, or agent usage guidance.
- A code change requires matching documentation.
- Public-facing text needs LMTI naming and local-alpha positioning.

## Inputs needed
- Current source behavior.
- Existing docs and naming rules.
- Verification commands or evidence when making claims.

## Required commands
- `lmti thoth show documentation` when routing through Thoth.
- `lmti doctor --security` before public-facing release docs when exposure risk exists.

## Safety rules
- Do not claim LMTI is a complete AI framework or complete Artificial Mind.
- Do not document unimplemented commands as stable user workflows.
- Do not include raw secrets, private memory, raw chat, or customer data.
- Keep ATLAS as legacy/internal naming only.

## Block conditions
- The docs would expose private project knowledge or raw memory.
- The claim cannot be verified from source, tests, or accepted project docs.
- The requested doc change conflicts with product identity rules.

## Output expected
Provide concise docs, changed files, and any claims that still need verification.

## Notes
Good docs reduce repeated reasoning; they should stay smaller than the system they explain.

