# AMF Specification

Artificial Mind Format (AMF) is the local JSON document produced by the LMTI compiler.

AMF stores compiled project understanding, not raw repository contents. It includes project metadata, modules, files, symbols, dependency edges, API/database hints, rules, risks, architecture notes and unresolved questions.

Security constraints:

- ignored secret files are not read
- protected risk evidence is redacted
- large/binary files are summarized only
- local `.lmti` and `.atlas` state are excluded
