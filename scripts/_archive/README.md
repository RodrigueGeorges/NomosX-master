# Archived one-off scripts

One-shot diagnostic, migration, probe and experiment scripts identified as
unused by `knip` (2026-11-07) and with no basename reference anywhere in the
repository (package.json, CI, docs, other scripts). Moved here via `git mv` —
history is preserved; restore any file by moving it back to `scripts/`.

Intentionally NOT archived: scripts still referenced by name in docs, CI,
package.json, or other scripts (see `audit-*`, `probe-*`, `test-*` provider
checks kept in `scripts/`).

Operational scripts live in `scripts/` root. Do not add new one-offs here —
put durable tooling in `scripts/` and ephemeral probes in `tmp-*` (gitignored).
