import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";

const INDEX = "scripts/seed-data/kniga3-tp-index.json";
const OUT = "scripts/seed-data/kniga3-edges-batch-0.json";
const SLICE_START = 0;
const SLICE_END = 60;

const index = JSON.parse(readFileSync(INDEX, "utf8"));
const slice = index.slice(SLICE_START, SLICE_END);

// pair: <a .../tp/ESR ...>NAME</a></td> <td ...text-center...>KM</td>
const RE =
  /\/tp\/(\d{6})"[^>]*>([^<]*)<\/a>\s*<\/td>\s*<td[^>]*text-center[^>]*>\s*(\d+)\s*<\/td>/g;

function fetchHtml(esr) {
  const url = `https://tr4.info/tp/${esr}`;
  try {
    const html = execFileSync(
      "curl",
      ["-sL", "--max-time", "40", "--retry", "2", "--retry-delay", "2", url],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return { html, url };
  } catch (e) {
    return { html: "", url, err: String(e.message || e) };
  }
}

function parse(html) {
  const i = html.indexOf("<tbody>");
  const j = html.indexOf("</tbody>");
  if (i < 0 || j < 0) return null;
  const tb = html.slice(i, j);
  const pairs = [];
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(tb))) pairs.push({ esr: m[1], km: +m[3] });
  return pairs;
}

const edges = [];
const seen = new Set();
const unfetched = [];
let tpProcessed = 0;

for (const tp of slice) {
  const src = tp.esr;
  const { html, url, err } = fetchHtml(src);
  // sanity: page title must reference this ESR
  const ok = html && html.includes(`(${src})`) && html.includes("<tbody>");
  if (!ok) {
    unfetched.push(`${src} ${tp.name}${err ? " [" + err + "]" : " [no-render]"}`);
    continue;
  }
  const pairs = parse(html);
  if (!pairs || pairs.length === 0) {
    unfetched.push(`${src} ${tp.name} [empty-table]`);
    continue;
  }
  for (const { esr: dst, km } of pairs) {
    if (dst === src) continue;
    if (!Number.isFinite(km) || km <= 0) continue;
    const aEsr = src < dst ? src : dst;
    const bEsr = src < dst ? dst : src;
    const key = `${aEsr}|${bEsr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ aEsr, bEsr, km, source: url });
  }
  tpProcessed++;
}

writeFileSync(OUT, JSON.stringify(edges));
const summary = {
  batch: 0,
  tpProcessed,
  edgesFound: edges.length,
  unfetched,
  sliceSize: slice.length,
};
writeFileSync("/tmp/batch-0-summary.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
