// Acquire Книга-3 (ТР-4 Книга 3) adjacency for ТП BATCH #2 (index slice [120,180)).
// Source: tr4.info /tp/<esr> — published transit distances between transit points.
// Every km is copied VERBATIM from the fetched page. No invention.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = '/Users/mishanikhinkirtill/Desktop/SimpleCargo';
const INDEX = `${ROOT}/scripts/seed-data/kniga3-tp-index.json`;
const OUT = `${ROOT}/scripts/seed-data/kniga3-edges-batch-2.json`;

const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
const slice = idx.slice(120, 180);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function fetchHtml(esr) {
  const url = `https://tr4.info/tp/${esr}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync('curl', [
        '-sL', '--compressed', '--max-time', '40',
        '-A', UA, '-w', '\nHTTPSTATUS:%{http_code}', url,
      ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      const m = out.match(/HTTPSTATUS:(\d+)\s*$/);
      const status = m ? Number(m[1]) : 0;
      const body = out.replace(/\nHTTPSTATUS:\d+\s*$/, '');
      if (status === 200 && body.length > 500) return { url, body };
    } catch (e) {
      // retry
    }
  }
  return { url, body: null };
}

// Parse pairs: /tp/<esr>">name</a></td> <td ...text-center>km</td>
const PAIR_RE = /\/tp\/(\d{6})"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td[^>]*text-center[^>]*>\s*(\d+)\s*<\/td>/g;

function norm(a, b) {
  return a < b ? [a, b] : [b, a];
}

const edges = [];
const seenPair = new Set(); // global dedup; keep shortest km if seen twice
const edgeKm = new Map();
const unfetched = [];
const sourceUrls = [];
let tpProcessed = 0;

for (const tp of slice) {
  const { url, body } = fetchHtml(tp.esr);
  sourceUrls.push(url);
  if (!body) {
    unfetched.push(`${tp.esr} (${tp.name}) — page did not render`);
    continue;
  }
  PAIR_RE.lastIndex = 0;
  let m;
  let cnt = 0;
  while ((m = PAIR_RE.exec(body)) !== null) {
    const other = m[1];
    const km = Number(m[3]);
    if (other === tp.esr) continue; // skip self
    if (!Number.isFinite(km) || km <= 0) continue;
    const [a, b] = norm(tp.esr, other);
    const key = `${a}|${b}`;
    if (edgeKm.has(key)) {
      if (km < edgeKm.get(key)) edgeKm.set(key, km); // keep shortest published
    } else {
      edgeKm.set(key, km);
      seenPair.add(key);
    }
    cnt++;
  }
  if (cnt === 0) {
    unfetched.push(`${tp.esr} (${tp.name}) — rendered but no distance table parsed`);
  } else {
    tpProcessed++;
  }
  process.stderr.write(`${tp.esr} ${tp.name}: ${cnt} pairs\n`);
}

for (const [key, km] of edgeKm) {
  const [aEsr, bEsr] = key.split('|');
  edges.push({ aEsr, bEsr, km, source: 'tr4.info/tp' });
}

// compact single-line JSON
writeFileSync(OUT, JSON.stringify(edges));

const summary = {
  batch: 2,
  tpProcessed,
  edgesFound: edges.length,
  unfetched,
  sourceUrlsCount: sourceUrls.length,
};
process.stderr.write('\nSUMMARY ' + JSON.stringify(summary) + '\n');
