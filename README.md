# ctaio-pipeline

Multi-agent content pipeline built for the ctaio.dev hiring task (28 Aug 2026, 40-min timebox).

**fetch → writer agent → verifier agent → code gate → publish**

- `pipeline.mjs` — stages 0–3 (fetch, write, verify, gate), 70 lines, Node 24. Agent runtime is `claude -p` (Claude Code headless, JSON output). No API key.
- `render.mjs` — stage 4, a pure `renderHtml()` that turns the gated draft into the brief page. `node render.mjs` re-renders `out/index.html` from the last run without calling any agent.
- `out/writer.json` — draft from agent 1 (every item carries a verbatim `cite`).
- `out/verifier.json` — agent 2's verdict per claim, seeing only source + claims.
- `out/index.html` — published brief; deterministic gate drops unsupported claims and refuses to publish under 90% support or on any invented version number. Each published claim shows its quote and the verifier's reason.

Live: https://ctaio-pipeline.vercel.app

Run: `node pipeline.mjs` · Re-render only: `node render.mjs [date]`
