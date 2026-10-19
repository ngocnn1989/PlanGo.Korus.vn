# Claude Code

Follow AGENTS.md in this folder (same workflow for every agent): `node kv.mjs legal --draft` (mandatory legal gate, exit 0
before any render) → `node kv.mjs make --until stills` → semantic review (`node kv.mjs legal --review-template`, AGENTS.md) → `node kv.mjs make` → `node kv.mjs deliver --preset social,small`.
