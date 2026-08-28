# ctaio-pipeline

Multi-agent content pipeline built for the ctaio.dev hiring task (28 Aug 2026, 40-min timebox).

**fetch → writer agent → verifier agent → code gate → publish**

- `pipeline.mjs` — the whole thing, ~90 lines, Node 24. Agent runtime is `claude -p` (Claude Code headless, JSON output). No API key.
- `out/writer.json` — draft from agent 1 (every item carries a verbatim `cite`).
- `out/verifier.json` — agent 2's verdict per claim, seeing only source + claims.
- `out/index.html` — published brief; deterministic gate drops unsupported claims and refuses to publish under 90% support or on any invented version number.

Run: `node pipeline.mjs`
