import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = "/Users/mishanikhinkirtill/Desktop/SimpleCargo";
const index = JSON.parse(readFileSync(`${ROOT}/scripts/seed-data/kniga3-tp-index.json`, "utf8"));
const slice = index.slice(420, 480);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const PAIR_RE = /\/tp\/(\d{6})[^>]*>[^<]*<\/a>\s*<\/td>\s*<td[^>]*text-center[^>]*>\s*(\d+)\s*<\/td>/g;

function fetchHtml(esr) {
  const url = `https://tr4.info/tp/${esr}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync("curl", [
        "-sL", "--max-time", "40", "-A", UA,
        "-w", "\n__HTTP__%{http_code}", url,
      ], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
      const idx = out.lastIndexOf("\n__HTTP__");
      const code = out.slice(idx + 9).trim();
      const body = out.slice(0, idx);
      if (code === "200" && body.includes("Тран")) return { url, body };
    } catch (e) { /* retry */ }
  }
  return { url, body: null };
}

function parseEdges(html, fromEsr, source) {
  const edges = [];
  let m;
  PAIR_RE.lastIndex = 0;
  while ((m = PAIR_RE.exec(html))) {
    const toEsr = m[1];
    const km = parseInt(m[2], 10);
    if (toEsr === fromEsr || !Number.isFinite(km) || km <= 0) continue;
    const [a, b] = fromEsr < toEsr ? [fromEsr, toEsr] : [toEsr, fromEsr];
    edges.push({ aEsr: a, bEsr: b, km, source });
  }
  return edges;
}

const edgeMap = new Map(); // key a|b -> {aEsr,bEsr,km,source}
const unfetched = [];
let tpProcessed = 0;
const sourceUrls = [];

for (const tp of slice) {
  const { url, body } = fetchHtml(tp.esr);
  if (!body) {
    unfetched.push({ esr: tp.esr, name: tp.name, reason: "page did not render (non-200 after 3 attempts)" });
    process.stderr.write(`UNFETCHED ${tp.esr} ${tp.name}\n`);
    continue;
  }
  sourceUrls.push(url);
  const edges = parseEdges(body, tp.esr, url);
  if (edges.length === 0) {
    unfetched.push({ esr: tp.esr, name: tp.name, reason: "rendered but no distance rows parsed" });
    process.stderr.write(`NODATA ${tp.esr} ${tp.name}\n`);
    continue;
  }
  for (const e of edges) {
    const key = `${e.aEsr}|${e.bEsr}`;
    const prev = edgeMap.get(key);
    if (!prev || e.km < prev.km) edgeMap.set(key, e); // keep shortest verbatim
  }
  tpProcessed++;
  process.stderr.write(`OK ${tp.esr} ${tp.name} edges=${edges.length}\n`);
}

const all = [...edgeMap.values()];
const compact = "[" + all.map(e => JSON.stringify(e)).join(",") + "]";
writeFileSync(`${ROOT}/scripts/seed-data/kniga3-edges-batch-7.json`, compact);

const summary = { batch: 7, tpProcessed, edgesFound: all.length, unfetched, sourceCount: sourceUrls.length };
writeFileSync("/tmp/batch7-summary.json", JSON.stringify(summary, null, 2));
process.stderr.write("\n=== SUMMARY ===\n" + JSON.stringify(summary, null, 2) + "\n");
