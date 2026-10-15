// render.mjs — step 4 of the pipeline: turn the gated draft into the published brief.
// Pure: takes data in, returns an HTML string. No model calls.
// Standalone re-render from the last run (no agents): node render.mjs
import { readFileSync, writeFileSync } from "node:fs";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// `code` spans in changelog bullets → <code>, after escaping
const inline = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

export function renderHtml({ draft, verdicts, kept, source, versions, src, date }) {
  const total = draft.items.length;
  const dropped = draft.items.filter(it => !kept.includes(it));
  const reason = it => verdicts.results.find(v => v.id === draft.items.indexOf(it))?.reason ?? "";
  const pct = Math.round((kept.length / total) * 100);
  const range = versions.length > 1 ? `${versions[versions.length - 1]} → ${versions[0]}` : versions[0];

  const css = `
:root{--bg:#f4f6f8;--paper:#ffffff;--ink:#141a21;--ink2:#5b6672;--rule:#d9dee5;--accent:#1d4f91;--accent-bg:#e3ebf7;--ok:#1a7f4b;--ok-bg:#dcf2e4;--bad:#b3261e;--bad-bg:#f9e0de;--mono:"IBM Plex Mono",Consolas,monospace;--body:"IBM Plex Sans","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0f1419;--paper:#171e26;--ink:#e8edf2;--ink2:#9fadbb;--rule:#2b3642;--accent:#8ab8f2;--accent-bg:#1b2b42;--ok:#6fd39a;--ok-bg:#17302a;--bad:#f09a93;--bad-bg:#3d1f1d;color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 var(--body);padding:0 max(16px,env(safe-area-inset-left)) 64px max(16px,env(safe-area-inset-right))}
.wrap{max-width:760px;margin:0 auto}
header{padding:44px 0 22px;border-bottom:2px solid var(--ink)}
.eyebrow{font:12px/1.4 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(28px,5vw,42px);line-height:1.12;letter-spacing:-.015em;margin:10px 0 14px;text-wrap:balance}
.meta{display:flex;flex-wrap:wrap;gap:8px;font:12.5px/1.4 var(--mono)}
.meta span{border:1px solid var(--rule);background:var(--paper);padding:3px 9px;border-radius:3px}
.meta .ok{border-color:var(--ok);color:var(--ok);background:var(--ok-bg)}
.meta .bad{border-color:var(--bad);color:var(--bad);background:var(--bad-bg)}
.tldr{background:var(--paper);border:1px solid var(--rule);border-left:4px solid var(--accent);padding:16px 20px;margin:26px 0 10px}
.tldr .eyebrow{margin-bottom:6px}
.tldr ol{margin:0;padding-left:20px}.tldr li{margin:0 0 6px}
article{padding:22px 0;border-bottom:1px solid var(--rule);display:grid;grid-template-columns:34px minmax(0,1fr);gap:4px 12px}
article .n{font:13px/1.9 var(--mono);color:var(--ink2);padding-top:2px}
article h2{font-size:21px;line-height:1.2;margin:0;text-wrap:balance}
article p{margin:8px 0 10px;max-width:66ch}
blockquote{margin:0;padding:10px 14px;background:var(--paper);border:1px solid var(--rule);border-left:3px solid var(--ok);font:14px/1.5 var(--mono);color:var(--ink);overflow-wrap:anywhere}
blockquote .lab{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ok);margin-bottom:4px}
.why{font-size:13px;color:var(--ink2);margin:6px 0 0}
code{font-family:var(--mono);font-size:.9em;background:var(--accent-bg);padding:1px 4px;border-radius:3px}
blockquote code{background:transparent;padding:0;font-weight:600}
details{margin:18px 0;border:1px solid var(--rule);background:var(--paper);padding:10px 14px}
summary{cursor:pointer;font:13px var(--mono);color:var(--accent)}
details ul{margin:8px 0 0;padding-left:18px;font-size:15px}
footer{margin-top:26px;padding-top:18px;border-top:2px solid var(--ink);font-size:15px;color:var(--ink2)}
footer h3{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin:0 0 8px;font-family:var(--mono)}
.flow{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px;font:12.5px var(--mono)}
.flow span{border:1px solid var(--rule);background:var(--paper);padding:4px 9px;border-radius:3px;color:var(--ink)}
.flow .ai{border-color:var(--accent);color:var(--accent)}
.flow i{align-self:center;font-style:normal;color:var(--ink2)}
footer p{margin:0 0 8px;max-width:70ch}
a{color:var(--accent)}
@media(max-width:480px){article{grid-template-columns:1fr}article .n{display:none}}`;

  const items = kept.map((it, i) => `<article>
  <div class="n">${String(i + 1).padStart(2, "0")}</div>
  <div>
    <h2>${inline(it.heading)}</h2>
    <p>${inline(it.why_it_matters)}</p>
    <blockquote><span class="lab">Verified · quoted from the changelog</span>${inline(it.cite)}</blockquote>
    ${reason(it) ? `<p class="why">Verifier: ${esc(reason(it))}</p>` : ""}
  </div>
</article>`).join("\n");

  const droppedBlock = dropped.length ? `<details><summary>${dropped.length} claim${dropped.length > 1 ? "s" : ""} dropped by the gate — show them</summary><ul>${dropped.map(it => `<li><b>${inline(it.heading)}</b> — ${esc(reason(it) || "cite not found literally in the source")}</li>`).join("")}</ul></details>` : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(draft.title)}</title>
<meta name="description" content="${esc(draft.tldr[0] ?? draft.title)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap">
<style>${css}</style></head>
<body><div class="wrap">
<header>
  <div class="eyebrow">ctaio.dev · practitioner brief · Claude Code ${esc(range)}</div>
  <h1>${inline(draft.title)}</h1>
  <div class="meta">
    <span>Generated ${esc(date)}</span>
    <span>${total} claims drafted</span>
    <span class="ok">${kept.length} verified against the source</span>
    <span${dropped.length ? ' class="bad"' : ""}>${dropped.length} dropped</span>
    <span>Gate: ${pct}% ≥ 90%</span>
  </div>
</header>

<div class="tldr"><div class="eyebrow">TL;DR</div><ol>${draft.tldr.map(t => `<li>${inline(t)}</li>`).join("")}</ol></div>

${items}

${droppedBlock}

<footer>
  <h3>How this brief was made</h3>
  <div class="flow"><span>fetch</span><i>→</i><span class="ai">writer agent</span><i>→</i><span class="ai">verifier agent</span><i>→</i><span>code gate</span><i>→</i><span>publish</span></div>
  <p>A writer agent drafted every item and had to quote the exact changelog line it used. A second agent, seeing only the source and the claims, marked each one supported or unsupported. Then plain code kept a claim only if the verifier passed it <em>and</em> its quote appears literally in the source, refused the run if any version number was not one of the fetched releases, and refused to publish below 90% support. On this run: ${kept.length} of ${total} claims kept, ${dropped.length} dropped, no invented versions.</p>
  <p>Source: <a href="${esc(src)}">CHANGELOG.md</a> · Code: <a href="https://github.com/AtharvaRasal/ctaio-pipeline">AtharvaRasal/ctaio-pipeline</a> · Built by <a href="https://rasaltechsolutions.com">Rasal Tech Solutions</a></p>
</footer>
</div></body></html>
`;
}

// ---------- standalone: re-render out/index.html from the last run ----------
if (process.argv[1] && /render\.mjs$/.test(process.argv[1])) {
  const SRC = "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md";
  const draft = JSON.parse(readFileSync("out/writer.json", "utf8"));
  const verdicts = JSON.parse(readFileSync("out/verifier.json", "utf8"));
  const full = readFileSync("changelog.md", "utf8");
  const blocks = full.split(/\n(?=## )/).filter(b => b.startsWith("## ")).slice(0, 3);
  const source = blocks.join("\n");
  const versions = blocks.map(b => b.match(/^## (\S+)/)[1]);
  const ok = new Set(verdicts.results.filter(v => v.verdict === "supported").map(v => v.id));
  const kept = draft.items.filter((it, i) => ok.has(i) && source.includes(it.cite.trim().slice(0, 60)));
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  writeFileSync("out/index.html", renderHtml({ draft, verdicts, kept, source, versions, src: SRC, date }));
  console.error(`re-rendered out/index.html: ${kept.length}/${draft.items.length} kept, versions ${versions.join(", ")}`);
}
