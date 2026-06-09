import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const INDEX = 'scripts/seed-data/kniga3-tp-index.json';
const OUT = 'scripts/seed-data/kniga3-edges-batch-10.json';
const SLICE_START = 600;
const SLICE_END = 660;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const ADJ_RE =
  /href="https:\/\/tr4\.info\/tp\/(\d{6})"[^>]*>[^<]*<\/a>\s*<\/td>\s*<td[^>]*text-center[^>]*>\s*([\d]+)\s*<\/td>/g;

async function fetchPage(esr) {
  const url = `https://tr4.info/tp/${esr}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        if (attempt === 3) return { url, ok: false, status: res.status };
        await sleep(1500 * attempt);
        continue;
      }
      const html = await res.text();
      return { url, ok: true, html };
    } catch (err) {
      if (attempt === 3) return { url, ok: false, status: String(err?.name || err) };
      await sleep(1500 * attempt);
    }
  }
  return { url, ok: false, status: 'unknown' };
}

function parseAdjacency(html, selfEsr) {
  const pairs = [];
  ADJ_RE.lastIndex = 0;
  let m;
  while ((m = ADJ_RE.exec(html))) {
    const esr = m[1];
    const km = parseInt(m[2], 10);
    if (esr === selfEsr) continue; // skip self
    if (!Number.isFinite(km) || km <= 0) continue;
    pairs.push({ esr, km });
  }
  return pairs;
}

function normKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const slice = index.slice(SLICE_START, SLICE_END);

const edgeMap = new Map(); // key -> {aEsr,bEsr,km,source}
const unfetched = [];
let tpProcessed = 0;

for (const tp of slice) {
  const esr = tp.esr;
  const r = await fetchPage(esr);
  if (!r.ok) {
    unfetched.push(`${esr} (${tp.name}) HTTP ${r.status}`);
    process.stderr.write(`UNFETCHED ${esr} ${tp.name} -> ${r.status}\n`);
    await sleep(300);
    continue;
  }
  const pairs = parseAdjacency(r.html, esr);
  if (pairs.length === 0) {
    // page rendered but no adjacency parsed -> flag, do not guess
    unfetched.push(`${esr} (${tp.name}) rendered-but-no-edges`);
    process.stderr.write(`NO-EDGES ${esr} ${tp.name}\n`);
    await sleep(300);
    continue;
  }
  tpProcessed++;
  for (const { esr: nb, km } of pairs) {
    const aEsr = esr < nb ? esr : nb;
    const bEsr = esr < nb ? nb : esr;
    const key = normKey(esr, nb);
    const existing = edgeMap.get(key);
    if (!existing || km < existing.km) {
      edgeMap.set(key, { aEsr, bEsr, km, source: r.url });
    }
  }
  process.stderr.write(`OK ${esr} ${tp.name} edges=${pairs.length}\n`);
  await sleep(300);
}

const edges = [...edgeMap.values()];
fs.writeFileSync(OUT, JSON.stringify(edges));

process.stderr.write(
  `\nDONE tpProcessed=${tpProcessed} edgesFound=${edges.length} unfetched=${unfetched.length}\n`,
);
process.stdout.write(
  JSON.stringify({ tpProcessed, edgesFound: edges.length, unfetched }) + '\n',
);
