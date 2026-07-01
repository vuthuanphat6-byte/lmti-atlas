# AMF Specification

AMF is the local Project Atlas JSON document produced by the LMTI compiler.

In current public docs, treat AMF as a compiled project map artifact. Older internal notes may expand AMF differently, but LMTI v0.1 should not claim to be a complete Artificial Mind.

AMF stores compiled project understanding, not raw repository contents. It includes project metadata, modules, files, symbols, dependency edges, API/database hints, rules, risks, architecture notes and unresolved questions.

Security constraints:

- ignored secret files are not read
- protected risk evidence is redacted
- large/binary files are summarized only
- local `.lmti` and `.atlas` state are excluded
