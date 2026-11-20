// Guard: player-facing text stays in plain words (src/core/terms.ts). Generates every violation kind
// and every crossing / footprint outcome, and fails on internal terms or a missing title / fix / basis.
// The designs on the real pack are in player-text-pack-*.test.ts (four shards that run side by side).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAlignment, type PI } from '../src/core/horizontal';
import { horizontalRules, speedNorms } from '../src/core/data/norms';
import { categoryViolation, crossingViolation, horizontalViolations, oobViolation, profileViolation, slopeViolation, timeViolation,
  trackEndViolations, verticalViolations, VIOLATION_KINDS } from '../src/core/checks';
import { buildProfile } from '../src/core/vertical';
import { BRIDGE_STYLE_TEXT, CROSSING_CHOICE_TEXT, crossingOutcome, culvertCard, cutOffFix, DIRECTIONS_TEXT, endCard, footprintOutcome, MINOR_CROSSING_TEXT, placeName, togetherHouseText } from '../src/core/terms';
import { CROSSING_CHOICES, type CrossingResult } from '../src/core/crossings';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { evaluate } from '../src/core/evaluate';
import { COST_GROUPS } from '../src/ui/costgroups';
import { ALL_LORE } from '../src/core/data/lore';
import { RECORDS } from '../src/core/data/records';
import { watershedLine } from '../src/core/basins';
import { ROW_HELP, rowHelp } from '../src/ui/hud';
import { D11_SCENARIO, PRESETS } from '../src/core/data/scenario';
import { syntheticTerrain } from '../src/core/terrain';
import { startDesign } from '../src/state';
import { FORCED_CHOICES, PACK_SHARDS, textGuard } from './player-text-helpers';

const { problems, seen, check, checkViolation } = textGuard();

describe('player-facing text', () => {
  it('outcome labels, card choices and bill lines use plain words', () => {
    for (const type of ['bridge', 'tunnel', 'overbridge', 'junction', 'reconnection', 'diversion', 'underpass', 'atGrade'] as CrossingResult['type'][])
      for (const cls of Object.keys(ROAD_CLASSES)) {
        const o = crossingOutcome({ type, cls, span: 25, approachLength: 120, linkLength: 300, targetS: 1200, underpassLength: 40 });
        for (const text of [o.tag, o.label, o.explain]) { expect(text.trim()).not.toBe(''); check(`outcome ${type}/${cls}`, text); }
      }
    // a mapped bridge or tunnel: kept as it stands, or its bridge rebuilt (too low, too short)
    for (const [type, kept, h] of [['overbridge', true, -9], ['underpass', true, 8], ['overbridge', false, -3], ['overbridge', false, -7]] as const) {
      const o = crossingOutcome({ type, cls: 'unclassified', span: 60, approachLength: kept ? 0 : 80, mapped: type === 'overbridge' ? 'bridge' : 'tunnel', ...(kept ? { kept } : {}), h });
      for (const text of [o.tag, o.label, o.explain]) check(`outcome mapped ${type}${kept ? ' kept' : ''}`, text);
    }
    expect(crossingOutcome({ type: 'diversion', cls: 'track', linkLength: 412, targetS: 2310 }).label)
      .toBe('Rerouted to the nearest crossing at km 2.31 (+412 m of new track)');
    // a way cut where no new road is needed: what each part still reaches and how far round its traffic goes (research/86)
    const reach = (cls: string, way: number) => ({ path: [{ x: 0, y: 0 }, { x: 0, y: 50 }], way, cls });
    const closure = { connected: [true, true] as [boolean, boolean], sides: ['north', 'south'] as [string, string], reach: [reach('tertiary', 7), reach('secondary', 9)] as [ReturnType<typeof reach>, ReturnType<typeof reach>] };
    const names = (way: number) => way === 9 ? 'road II/325' : undefined;
    const closed = crossingOutcome({ type: 'reconnection', cls: 'service', closure: { ...closure, extra: 1900, via: { way: 9, cls: 'secondary' } } }, 'road', names);
    expect(closed.label).toBe('Cut · no new road needed');
    expect(closed.explain).toBe('The service road is cut by our road. The north part still reaches a class III road, the south part road II/325; each just ends at our earthworks. Its traffic goes round 1.9 km further, via road II/325.');
    for (const c of [{ closure }, { closure, farClosure: true as const }, { closure, farClosure: true as const, requestedType: 'reconnection' as const },
      { closure: { ...closure, connected: [true, false] as [boolean, boolean], nothing: [false, true] as [boolean, boolean] } },
      { closure: { ...closure, connected: [false, true] as [boolean, boolean] }, linkLength: 240, targetS: 1200 }])
      for (const cls of ['track', 'service', 'tertiary']) { const o = crossingOutcome({ type: 'reconnection', cls, ...c }, 'road', names); for (const text of [o.label, o.explain]) check(`closure ${cls}`, text); }
    // closed with what it served bought out, cheaper than keeping its way across
    const bought = crossingOutcome({ type: 'diversion', cls: 'track', closure: { ...closure, extra: 2600 }, houses: [1, 2], homes: 0, houseCost: 31e6, buyout: { instead: { type: 'overbridge', cost: 153e6 } } });
    expect([bought.label, bought.explain.split('. ').at(-1)]).toEqual(['Cut · 2 buildings bought out', 'Cheaper to buy out than to keep its access: 2 buildings, 31 M CZK; its bridge over us would cost 153 M CZK.']);
    for (const type of ['underpass', 'overbridge', 'bridge', 'reconnection', 'diversion', 'buyout']) check('cut-off fix', cutOffFix(type, 25e6));
    for (const action of ['relocation', 'retaining-wall', 'culvert', 'channel-relocation', 'blocked'] as const)
      for (const feature of ['road', 'railway', 'water', 'stream', 'nature'] as const) {
        const o = footprintOutcome({ feature, action, cls: 'service', length: 50, affectedLength: 20 });
        for (const text of [o.tag, o.label, o.explain]) check(`footprint ${action}/${feature}`, text);
      }
    check('closure', footprintOutcome({ feature: 'road', action: 'relocation', cls: 'service', length: 0, closed: { length: 60, detour: 140 } }).label);
    expect(CROSSING_CHOICE_TEXT.map(([v]) => v).filter(Boolean).sort()).toEqual([...CROSSING_CHOICES].sort());
    for (const [, label, title] of CROSSING_CHOICE_TEXT) { check('choice label', label); check('choice tooltip', title); }
    for (const text of Object.values(MINOR_CROSSING_TEXT)) check('minor road choice tooltip', text);
    for (const [, label, title] of BRIDGE_STYLE_TEXT) { check('bridge style label', label); check('bridge style tooltip', title); }
    const storeys = [{ height: 1.5, rawDay: 1e6, rawNight: 1e5, day: 1e6, night: 1e5 }];
    for (const together of [{ decision: 'wall', wall: { routeId: 'b', height: 3, length: 120, cost: 4e6 } }, { decision: 'buy', buyout: { routeId: 'a', cost: 5e6 } },
      { decision: 'none', over: 1.2 }, { decision: 'none' }] as const) {
      const text = togetherHouseText({ buildingIndex: 0, height: 1.5, dayDb: 63, nightDb: 53, dayLimit: 60, nightLimit: 50, action: 'retain',
        contributions: ['a', 'b'].map(routeId => ({ sourceId: routeId, routeId, buildingIndex: 0, height: 1.5, dayEnergy: 1e6, nightEnergy: 1e5, policy: 'combined', storeys })),
        together: { prevailing: 'a', storey: 0, ...together } }, id => id === 'a' ? 'our road' : 'Jičínská', v => `${v / 1e6} M CZK`)!;
      check(`house card, decided together (${together.decision})`, text.state); check(`house card, decided together (${together.decision})`, text.why);
    }
    for (const g of COST_GROUPS) check('bill line', g.label);
    // a stream culvert's card: pipe, frame, buried bridge, under each kind of line
    for (const size of [{ type: 'pipe', width: 1, height: 1 }, { type: 'box', width: 4, height: 2.5 }, { type: 'box', width: 2, height: 2, buried: true }] as const)
      for (const line of ['road', 'motorway', 'railway'] as const) {
        const card = culvertCard({ size, length: 42.3, h: 14.2, q100: 2.7, catchmentKm2: 0.9, truncated: true, frameCover: 7, vaultSpan: 3.5 }, line);
        for (const text of [card.title, card.state, ...card.why, ...card.more]) { expect(text.trim()).not.toBe(''); check(`culvert card ${size.type} ${line}`, text); }
        if (line !== 'road') expect([...card.why, ...card.more].join(' ')).not.toMatch(/our road/);
      }
    // the cards of the mission ends (interchanges, roads joined): every mission's, both ends
    let ends = 0;
    for (const sc of PRESETS) check(`${sc.id} photo note`, sc.photoNote);
    for (const sc of PRESETS) for (const end of ['a', 'b'] as const) {
      const info = sc.ends?.[end];
      if (!info) continue;
      ends++;
      const card = endCard(info, end);
      for (const text of [card.title, ...card.lines, ...(info.lore ? [info.lore] : [])]) { expect(text.trim()).not.toBe(''); check(`${sc.id} end ${end}`, text); }
    }
    expect(ends).toBeGreaterThan(8);
    // a tunnel's ends in two seas' basins (research/100)
    const basins = { version: 1 as const, source: 's', basins: [{ sea: 'north' as const, river: 'Elbe', rings: [[0, 0, 10, 0, 10, 10, 0, 10]] }, { sea: 'black' as const, river: 'Danube', rings: [[10, 0, 20, 0, 20, 10, 10, 10]] }] };
    check('watershed line', watershedLine(basins, { x: 5, y: 5, s: 4100 }, { x: 15, y: 5, s: 7080 }) ?? 'missing line');
    // local knowledge on mapped ways' cards (research/96) and records (research/97): one short sentence each
    for (const lore of [...ALL_LORE, ...RECORDS]) for (const text of [lore.line, 'title' in lore ? lore.title : undefined]) {
      check('local knowledge', text);
      if (text) expect(text.split(/\s+/).length, text).toBeLessThanOrEqual(16);
    }
    // a motorway direction is named after the place it leads to, never with its section note in nested
    // brackets (QA: "Drag this direction (Hostěradice (on to 0303)).")
    for (const sc of PRESETS) for (const label of [sc.labels.a, sc.labels.b]) {
      const place = placeName(label);
      for (const text of [DIRECTIONS_TEXT.towards(place), DIRECTIONS_TEXT.one(place), DIRECTIONS_TEXT.oneTitle(place)]) {
        check(`${sc.id} direction`, text);
        expect(text, `${sc.id}: brackets inside brackets`).not.toMatch(/\([^()]*\(/);
      }
    }
    expect(placeName('Hostěradice (on to 0303)')).toBe('Hostěradice');
    const terrain = syntheticTerrain(500, 80, 5, () => 400);
    const r = evaluate({ terrain, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2100, y: 200 } }, startDesign());
    for (const line of ['road', 'motorway', 'railway'])
      for (const key of Object.keys(ROW_HELP)) check(`${line} bill tooltip ${key}`, rowHelp(key, r.cost, D11_SCENARIO, line), false);
    expect(problems).toEqual([]);
  });

  it('every violation kind has a title, a fix, a basis and no internal terms', () => {
    // Horizontal: fuzzed bends with hand-set radii on the 90 km/h rules.
    let seed = 7;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let k = 0; k < 400; k++) {
      const pis: PI[] = [];
      let x = 0;
      for (let j = 0; j < 2 + Math.floor(rand() * 4); j++) {
        x += 60 + rand() * 900;
        pis.push({ x, y: (rand() - 0.5) * 900, r: rand() < 0.6 ? Math.round(100 + rand() * 2500) : null });
      }
      const al = buildAlignment({ x: -500, y: 0 }, { x: x + 800, y: 0 }, pis, horizontalRules(90));
      for (const v of horizontalViolations(al, 90, { a: { x: -500, y: 0 }, b: { x: x + 800, y: 0 }, pis })) checkViolation(v, 'horizontal');
    }
    // Vertical: steep grades, tiny and overlapping roundings.
    const norms = speedNorms(90);
    for (let k = 0; k < 200; k++) {
      const vpis: { s: number; z: number; r: number | null }[] = [{ s: 0, z: 400, r: null }];
      for (let s = 0; s < 3000;) { s += 40 + rand() * 600; vpis.push({ s, z: 400 + (rand() - 0.5) * 120, r: rand() < 0.5 ? Math.round(200 + rand() * 4000) : null }); }
      vpis.push({ s: 3600, z: 400, r: null as number | null });
      // Auto's line and the player's pins (By hand), on a road and on a railway (its "track", never "road")
      for (const rail of [false, true]) for (const byHand of [false, true]) {
        for (const v of verticalViolations(buildProfile(vpis, norms.minCrestRadius, norms.minSagRadius), norms, 0.06, rail, undefined, byHand)) {
          checkViolation(v, `vertical${rail ? ' (railway)' : ''}${byHand ? ' by hand' : ''}`);
          if (rail) expect([v.title, v.fix, v.detail].join(' ')).not.toMatch(/\broads?\b/);
          // On Auto the height points are the game's and not drawn: never named
          if (!byHand) expect([v.title, v.fix, v.detail].join(' ')).not.toMatch(/your height pin at|height points?\b/);
        }
      }
    }
    for (const v of [slopeViolation(100, 200, 12, 0, 60), slopeViolation(100, 200, 0, 12, 60), crossingViolation(500, 'railway', 3, 7.5),
      crossingViolation(500, 'motorway', -2, 7.5, 6), oobViolation(0, 50, 50), profileViolation(1000, 0.06),
      categoryViolation(1000, 'S7.5', 20000, 'S9.5'), timeViolation(20000, 80, 15.4, 14.5),
      ...trackEndViolations({ x: 0, y: 0 }, { x: 3000, y: 0 }, [{ x: 1000, y: 800, r: null }], 3200, { a: { dir: { x: 1, y: 0 } } }, 0.08, 300, 740),
      ...trackEndViolations({ x: 0, y: 0 }, { x: 3000, y: 0 }, [], 3000, { b: { dir: { x: 0, y: 1 } } }, 0.08, 300, 740),
      ...trackEndViolations({ x: 0, y: 0 }, { x: 3000, y: 0 }, [{ x: 1000, y: 800, r: null }], 3200, { a: { dir: { x: 1, y: 0 }, continues: true } }, 0.08, 300, 740),
      ...trackEndViolations({ x: 0, y: 0 }, { x: 3000, y: 0 }, [], 3000, { b: { dir: { x: 0, y: 1 }, continues: true } }, 0.08, 300, 740)]) checkViolation(v, 'checks');
    // The kinds only real ground produces (and every crossing choice forced on every crossed road) come from
    // the real-pack shards, player-text-pack-*.test.ts, each of which fails without the kinds it answers for.
    const fromPack = new Set(PACK_SHARDS.flatMap(shard => shard.kinds));
    for (const kind of VIOLATION_KINDS) expect(seen.has(kind) || fromPack.has(kind), `no generated ${kind} violation`).toBe(true);
    expect(FORCED_CHOICES.flat().sort()).toEqual([...CROSSING_CHOICES].sort());
    expect(problems).toEqual([]);
  });
});

/** String and template-literal texts of a TypeScript source (template placeholders become "…"),
 * each with the source text just before it. Comments are skipped; enough for our own sources. */
function literals(src: string): { text: string; before: string }[] {
  const out: { text: string; before: string }[] = [];
  let i = 0;
  const skipString = (q: string) => { let text = ''; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; text += src[i++]; } i++; return text; };
  const template = (): string => {
    let text = ''; i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { text += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; expression('}'); text += '…'; continue; }
      text += src[i++];
    }
    i++; return text;
  };
  const expression = (end: string) => {
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '{') depth++;
      if (ch === '}' && depth === 0 && end === '}') { i++; return; }
      if (ch === '}') depth--;
      if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
      if (ch === '/' && /[(,=:[!&|?{};]$|^$/.test(src.slice(0, i).trimEnd().slice(-1))) { // a regex literal
        i++; let cls = false;
        while (i < src.length && (cls || src[i] !== '/')) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
        i++; continue;
      }
      if (ch === '\'' || ch === '"' || ch === '`') {
        const start = i, text = ch === '`' ? template() : skipString(ch);
        out.push({ text, before: src.slice(Math.max(0, start - 400), start) }); continue;
      }
      i++;
    }
  };
  expression('');
  return out;
}

describe('player-facing text in the sources', () => {
  const read = (file: string) => readFileSync(file, 'utf8');
  it('every human-readable literal in the UI is plain words (source names only in pricing tooltips)', () => {
    // every UI module (new ones included), and the map's player-facing labels and tips
    const files = [...readdirSync('src/ui').filter((f) => f.endsWith('.ts')).map((f) => `src/ui/${f}`), 'src/render/noise.ts', 'src/render/build-tools.ts'];
    for (const file of files) for (const { text } of literals(read(file))) {
      if (!/[a-z] [a-z]/i.test(text)) continue; // identifiers, selectors, CSS
      const titles = [...text.matchAll(/title="([^"]*)"/g)].map(m => m[1]);
      for (const t of [text.replace(/<[^>]*>/g, ' '), ...titles]) check(file, t, false);
    }
    const html = read('index.html').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
    check('index.html', html.replace(/<[^>]*>/g, ' '), false);
    expect(problems.splice(0)).toEqual([]);
  });

  it('every violation title, fix and detail written in the core is plain words', () => {
    const files = readdirSync('src/core').filter(f => f.endsWith('.ts') && f !== 'terms.ts').map(f => `src/core/${f}`);
    let count = 0;
    for (const file of files) for (const { text, before } of literals(read(file))) {
      // Values of title / fix / detail properties, including the branches of a conditional value,
      // and the message arguments of the crossing/footprint/structure violation helpers.
      const line = before.slice(before.lastIndexOf('\n') + 1);
      const property = /\b(title|fix|detail)\s*:\s*(?:[^,]*\?\s*|[^,]*:\s*)?$/.test(line);
      // Helper arguments mix title, fix and the rule line (which may name its source).
      if (!property && !/\b(issue|block|flagRanges)\([^;]*$/.test(before)) continue;
      if (!/[a-z] [a-z]/i.test(text)) continue;
      count++; check(`${file}: ${line.trim().slice(0, 40)}`, text, property);
    }
    expect(count).toBeGreaterThan(60);
    expect(problems.splice(0)).toEqual([]);
  });
});
