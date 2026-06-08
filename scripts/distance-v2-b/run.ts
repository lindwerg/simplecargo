/**
 * Runner for the ТР-4 distance-v2-b engine.
 * Loads data, runs the two oracle routes + 4 extra varied pairs, prints
 * computed km + leg breakdown + the узел-path for Route A.
 *
 * Run: npx tsx scripts/distance-v2-b/run.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildIndex,
  computeDistance,
  type UzelGraph,
  type Kniga1Row,
  type HubAdder,
  type SpecialOverride,
  type RouteResult,
  type EngineIndex,
} from './engine';

const SEED = join(__dirname, '..', 'seed-data');
const readJson = (f: string) => JSON.parse(readFileSync(join(SEED, f), 'utf8'));

function loadHubs(): HubAdder[] {
  const h = readJson('hub-distances.json');
  const out: HubAdder[] = [];
  for (const hub of h.hubs ?? []) {
    if (hub.esr && typeof hub.km === 'number') {
      out.push({ esr: hub.esr, name: hub.hub, km: hub.km });
    }
  }
  return out;
}

function loadSpecial(): Map<string, SpecialOverride> {
  const s = readJson('special-distances.json');
  const m = new Map<string, SpecialOverride>();
  // Only ESR-keyed pair overrides apply here; the Moscow-ring override is
  // узел-name keyed (no station ESRs) → cannot match a station pair, skip.
  for (const ov of s.overrides ?? []) {
    if (ov.aEsr && ov.bEsr && typeof ov.km === 'number') {
      const key = ov.aEsr < ov.bEsr ? `${ov.aEsr}|${ov.bEsr}` : `${ov.bEsr}|${ov.aEsr}`;
      m.set(key, { aEsr: ov.aEsr, bEsr: ov.bEsr, km: ov.km });
    }
  }
  return m;
}

function fmt(r: RouteResult): string {
  if (r.km < 0) return `  FAILED: ${r.note}`;
  const lines: string[] = [];
  lines.push(`  km = ${r.km}  (raw ${r.rawKm.toFixed(3)})   method=${r.method}`);
  if (r.method === 'uzel-graph') {
    lines.push(
      `  legs: leg1(→${r.originUzel})=${r.leg1}  +bridgeOrigin=${r.bridgeOrigin}` +
        `  +backbone=${r.backboneKm}  +bridgeDest=${r.bridgeDest}` +
        `  +leg3(${r.destUzel}→)=${r.leg3}  +hub=${r.hubAdder}`,
    );
  } else if (r.note) {
    lines.push(`  ${r.note}`);
  }
  return lines.join('\n');
}

function run() {
  const graph: UzelGraph = readJson('uzel-graph.json');
  const kniga1: Kniga1Row[] = readJson('kniga1-sections.json');
  const hubs = loadHubs();
  const special = loadSpecial();
  const idx: EngineIndex = buildIndex(graph, kniga1, hubs);

  const name = (esr: string) => {
    const row = kniga1.find((r) => r.esr === esr);
    return row ? row.name : esr;
  };

  type Case = { label: string; o: string; d: string; expect?: number };
  const cases: Case[] = [
    { label: 'Route A', o: '021609', d: '612709', expect: 2444 }, // Возрождение→Гремячая
    { label: 'Route B', o: '771500', d: '648503', expect: 699 }, // Исеть→Наб.Челны
    { label: 'Extra 1', o: '060232', d: '851005' }, // Москва-Товарная → Новосибирск-Главный
    { label: 'Extra 2', o: '524404', d: '532909' }, // Краснодар I → Сочи
    { label: 'Extra 3', o: '250302', d: '800008' }, // Казань → Челябинск-Главный
    { label: 'Extra 4', o: '510204', d: '657907' }, // Ростов-Главный → Самара
  ];

  console.log('=== ТР-4 distance-v2-b results ===\n');
  for (const c of cases) {
    const r = computeDistance(idx, c.o, c.d, special);
    console.log(
      `${c.label}: ${name(c.o)} (${c.o}) → ${name(c.d)} (${c.d})` +
        (c.expect !== undefined ? `   [oracle ${c.expect}]` : ''),
    );
    console.log(fmt(r));
    if (c.expect !== undefined && r.km >= 0) {
      const diff = r.km - c.expect;
      const ok = Math.abs(diff) <= 1;
      console.log(`  CHECK: diff=${diff >= 0 ? '+' : ''}${diff} → ${ok ? 'EXACT ✓' : 'MISMATCH ✗'}`);
    }
    console.log('');
  }

  // узел-path for Route A
  const ra = computeDistance(idx, '021609', '612709', special);
  console.log('=== Route A узел-path ===');
  console.log('  ' + (ra.uzelPath ?? []).join(' → '));
}

run();
