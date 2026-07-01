# Changelog

All notable changes to LMTI Atlas will be documented in this file.

This project follows an alpha-first release process. Until a stable release
exists, commands and storage contracts may change with migration notes.

## v0.1.0-alpha.1

Initial public alpha preparation.

### Added

- Release-facing README with honest alpha status and capability boundaries.
- Apache-2.0 license file and package license metadata.
- pnpm-based CI for build and test verification.
- Publish preflight documentation for release, PR, and remote-change workflows.
- Open-source readiness checklist with current pass, warning, and blocked
  items.
- Security and contributing guidance for local memory, secrets, and docs.

### Changed

- Normalized workspace package versions to `0.1.0-alpha.1`.
- Updated `.gitignore` to protect local `.lmti/`, legacy `.atlas/`, temporary
  files, package-manager debug logs, and secret-like files.
- Clarified that LMTI is a local-first project memory and safety layer, not a
  full AI framework or replacement for tests and human review.

### Known Limitations

- The repository may still contain tracked local-alpha `.lmti/` documentation
  files from earlier setup. New `.lmti/` runtime state is ignored.
- Go-core verification requires a local Go toolchain.
- Package installation and global CLI usage are release targets; source-based
  commands are the verified alpha path.
- Publish preflight can remain blocked while the working tree is dirty or the
  Git remote does not match the expected public repository identity.
