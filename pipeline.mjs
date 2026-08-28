// ctaio-pipeline — fetch → write → verify → gate → publish
// Agent runtime: `claude -p` (Claude Code headless). No API key; uses local Claude Code auth.
// Run: node pipeline.mjs   (needs: node 24+, claude CLI, curl)
import { spawnSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md";
const VERSIONS = 3;                 // how many releases to cover
const MIN_SUPPORT = 0.9;            // gate: publish only if >=90% claims supported
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);

// ---------- step 0: fetch (deterministic) ----------
mkdirSync("out", { recursive: true });
execSync(`curl -sL ${SRC} -o changelog.md`);
const full = readFileSync("changelog.md", "utf8");
const blocks = full.split(/\n(?=## )/).filter(b => b.startsWith("## ")).slice(0, VERSIONS);
const source = blocks.join("\n");
const versions = blocks.map(b => b.match(/^## (\S+)/)[1]);
log("fetched", versions.join(", "), `${source.length} chars`);

// ---------- helper: one agent call, JSON out ----------
function agent(name, prompt) {
  const t = Date.now();
  // FIX #0: prompt via stdin — a 20k-char changelog as an argv blew Windows' 8191-char command-line limit
  const r = spawnSync("claude", ["-p", "--output-format", "json", "--model", "sonnet"], {
    input: prompt, encoding: "utf8", maxBuffer: 64e6, shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(`${name} failed: ${r.stderr}`);
  const env = JSON.parse(r.stdout);
  let text = env.result.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = text.indexOf("{"), last = text.lastIndexOf("}");
  const obj = JSON.parse(text.slice(first, last + 1));           // FIX #1: strip fences/prose
  log(name, `${((Date.now() - t) / 1000).toFixed(0)}s`, `$${(env.total_cost_usd ?? 0).toFixed(3)}`);
  writeFileSync(`out/${name}.json`, JSON.stringify(obj, null, 2));
  return obj;
}

// ---------- step 1: writer agent ----------
const draft = agent("writer", `You write for ctaio.dev, a site for senior engineers using agentic coding tools. Tone: dry, concrete, no hype.
From the Claude Code changelog below, write a practitioner brief covering versions ${versions.join(", ")}.
Rules: every claim must be traceable to one changelog bullet; quote that bullet verbatim in "cite". Do not invent versions or features.
Return ONLY JSON: {"title":str,"tldr":[str x3],"items":[{"heading":str,"why_it_matters":str,"cite":str}] (6-10 items)}

CHANGELOG:
${source}`);

// ---------- step 2: verifier agent (sees only source + claims) ----------
const claims = draft.items.map((it, i) => ({ id: i, claim: `${it.heading} — ${it.why_it_matters}`, cite: it.cite }));
const verdicts = agent("verifier", `You are a fact-checker. For each claim, decide if it is SUPPORTED by the changelog text below. A claim is supported only if its "cite" appears (near-verbatim) in the changelog AND the claim does not overstate it.
Return ONLY JSON: {"results":[{"id":int,"verdict":"supported"|"unsupported","reason":str}]}

CHANGELOG:
${source}

CLAIMS:
${JSON.stringify(claims, null, 1)}`);

// ---------- step 3: deterministic gate (code, not model) ----------
const ok = new Set(verdicts.results.filter(v => v.verdict === "supported").map(v => v.id));
const kept = draft.items.filter((it, i) => ok.has(i) && source.includes(it.cite.trim().slice(0, 60))); // FIX #2: literal cite check
const badVersion = JSON.stringify(draft).match(/\b\d+\.\d+\.\d+\b/g)?.some(v => !versions.includes(v));
const support = kept.length / draft.items.length;
log(`gate: ${kept.length}/${draft.items.length} supported (${(support * 100).toFixed(0)}%), badVersion=${!!badVersion}`);
if (support < MIN_SUPPORT || badVersion) { log("GATE FAILED — not publishing"); process.exit(2); }

// ---------- step 4: publish (render html) ----------
const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const html = `<!doctype html><meta charset=utf-8><title>${esc(draft.title)}</title>
<style>body{max-width:720px;margin:40px auto;font:16px/1.5 system-ui;padding:0 16px}blockquote{color:#555;border-left:3px solid #ddd;margin:4px 0 0;padding-left:10px;font-size:14px}small{color:#777}</style>
<h1>${esc(draft.title)}</h1><small>Auto-generated ${new Date().toISOString().slice(0, 10)} · ${kept.length} claims, each fact-checked against the source by a second agent · ${draft.items.length - kept.length} dropped</small>
<ul>${draft.tldr.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
${kept.map(it => `<h3>${esc(it.heading)}</h3><p>${esc(it.why_it_matters)}</p><blockquote>${esc(it.cite)}</blockquote>`).join("")}
<p><small>Pipeline: fetch → writer agent → verifier agent → code gate → publish. Source: <a href="${SRC}">CHANGELOG.md</a></small></p>`;
writeFileSync("out/index.html", html);
log("wrote out/index.html");
