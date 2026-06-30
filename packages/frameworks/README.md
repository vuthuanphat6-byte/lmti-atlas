# @atlas/frameworks

Universal Framework Support Layer for LMTI.

This package detects project frameworks, package managers, monorepo maps,
framework-aware risk zones and verification plans without coupling LMTI core to
one stack.

The detector reads metadata only. It does not read raw `.env`, `wp-config.php`,
`appsettings.json`, Django secret settings, Laravel keys or connection strings.
All CLI/UI-facing strings should pass through the Privacy Gate before output.
