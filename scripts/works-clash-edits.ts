// Player edits for the works-clash screen (src/core/works-clash.ts): the earthworks a player's change builds are screened
// as Auto's are. The owner's recurring report ("we have embankment interfering with another road if we drag the crossing
// road") came back each time because the audits only ever screened Auto's designs. Seeded and deterministic, on several
// packs:
//  - a crossing's ring slid along our road (ui/crossing-drag.ts: the crossed mapped road rebuilt between its junctions,
//    its piece moved across its own direction to cross where the ring was dragged);
//  - a crossed road's works dragged (the stretch rebuilt with a bend pulled sideways at the crossing);
//  - a dead end at our works cut back (ui/dead-end.ts: its piece taken up);
//  - the saved players' projects: roads built across ours, slip roads (the diamonds), new railways and motorways, a
//    rebuilt stretch kept on its old road (tests/fixtures/interchange, qa-final, qa3).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { loadPack, projectContext as packProject } from './loadpack';
import { projectContext } from './eval-project';
import { scenarioParams } from '../src/core/data/scenario';
import { evaluateProject } from '../src/core/project-evaluate';
import { ProjectTransportIndex } from '../src/core/project-network';
import { coveredStretches, derivedStretch } from '../src/ui/road-edit';
import { mappedLineKindFor } from '../src/ui/route-kinds';
import { axisPoint, axisStation, carryCrossingChoice, slideAxis, slideSection, slideTo } from '../src/ui/crossing-drag';
import { deadEnds } from '../src/ui/dead-end';
import { nearestLeg } from '../src/core/horizontal';
import type { CategoryId } from '../src/core/data/categories';
import type { ProjectDesign } from '../src/core/project';

/** The packs and missions edited: a motorway, a class I road, the four-lane I/35, a D3 motorway section, the Šternberk
 * bypass (EDIT_PACKS=<scenario:preset,…> narrows it). */
export const EDIT_PACKS = ['d11:d11-motorway', 'd11:d11', 'i35-turnov:i35-turnov-road', 'd3-0303:d3-0303-motorway', 'i46-sternberk:i46-sternberk-road'];
/** Crossings edited per pack (the seeded pick), and how far a ring is slid / a works drag pulls, m. */
const PER_PACK = 5, SLIDES = [-45, 30], PULLS = [25];
/** The saved players' projects screened as they are. */
export const SAVED = ['tests/fixtures/interchange', 'tests/fixtures/qa-final', 'tests/fixtures/qa3'];

/** a small deterministic generator (mulberry32) */
function random(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export interface PlayerEdit { name: string; design: ProjectDesign }

/** Every edit, its project as the player would leave it (evaluated by the caller). */
export function* playerEdits(packs = process.env.EDIT_PACKS?.split(',') ?? EDIT_PACKS, seed = 7): Generator<PlayerEdit> {
  for (const spec of packs) {
    // (each pack its own sequence: narrowing EDIT_PACKS keeps its edits)
    const rnd = random(seed + [...spec].reduce((h, ch) => Math.imul(h, 31) + ch.charCodeAt(0) | 0, 0));
    const [id, presetId] = spec.split(':'), dir = `public/scenarios/${id}`;
    if (!existsSync(`${dir}/meta.json`)) continue;
    const pack = loadPack(dir), sc = scenarioParams(id, presetId), design = packProject(pack, sc, dir).initial();
    const { ctx, graph } = projectContext(design);
    if (!graph) continue;
    const index = new ProjectTransportIndex(graph, ctx.environment.transportData!, graph.vectorData, pack.terrain, pack.census);
    const owner = design.routes[0], ours = evaluateProject(ctx, { epoch: 'edits', revision: 1, design }).routes[owner.id].legacy!;
    const sourceOf = new Map<number, string>((graph.sources as { id: string; legacyNetIndex?: number }[]).flatMap(s => s.legacyNetIndex === undefined ? [] : [[s.legacyNetIndex, s.id] as [number, string]]));
    const covered = (sid: string) => coveredStretches(index, sid, [{ ...ours, name: 'our road' }]);
    const stationOn = (sid: string, p: { x: number; y: number }) => {
      const q = index.source(sid)!; let best = { s: 0, d: Infinity };
      for (let k = 1; k < q.stations.length; k++) {
        const ax = q.xy[2 * k - 2], ay = q.xy[2 * k - 1], dx = q.xy[2 * k] - ax, dy = q.xy[2 * k + 1] - ay;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(p.x - ax - t * dx, p.y - ay - t * dy);
        if (d < best.d) best = { s: q.stations[k - 1] + t * (q.stations[k] - q.stations[k - 1]), d };
      }
      return best;
    };
    // the crossings a ring or works drag can move (a mapped way, not cut, rebuildable), a seeded pick of them
    const movable = ours.crossings.filter(c => c.roadId !== undefined && !c.designed && c.type !== 'reconnection' && c.type !== 'diversion'
      && sourceOf.has(c.roadId) && index.source(sourceOf.get(c.roadId)!) && mappedLineKindFor(index, sourceOf.get(c.roadId)!).verdict.ok);
    const picked = movable.map(c => ({ c, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, PER_PACK).map(p => p.c).sort((a, b) => a.s - b.s);
    for (const c of picked) {
      const sid = sourceOf.get(c.roadId!)!, kind = mappedLineKindFor(index, sid).kind!;
      const interval = derivedStretch(index, sid, stationOn(sid, c).s, covered(sid));
      if (!interval) continue;
      let command; try { command = kind.rebuild(index, interval, { routeId: 'route:edited', acousticSourceId: 'acoustic:edited' }); } catch { continue; }
      const rebuilt = () => {
        const edited = structuredClone(design);
        edited.routes.push(...structuredClone(command.routes)); edited.connections.push(...structuredClone(command.connections));
        carryCrossingChoice(edited, owner.id, c.roadId!, 'route:edited');
        return { edited, q: edited.routes.find(r => r.id === 'route:edited')! };
      };
      const km = (c.s / 1000).toFixed(2), what = `${presetId} km ${km} ${c.cls} ${c.type}`;
      for (const off of SLIDES) {
        const { edited, q } = rebuilt();
        if (q.alignment.kind !== 'pi' || q.specification.kind !== 'road') continue;
        const axis = slideAxis(ours, c.s), sec = slideSection(q.endpoints.a.position, q.endpoints.b.position, q.alignment.pis,
          q.specification.designSpeed, q.specification.crossSection as CategoryId, c);
        q.alignment.pis = slideTo(sec, axis, axisPoint(axis, axisStation(axis, c) + off));
        yield { name: `${what}: ring slid ${off > 0 ? '+' : ''}${off} m`, design: edited };
      }
      for (const pull of PULLS) for (const sign of [-1, 1]) {
        const { edited, q } = rebuilt();
        if (q.alignment.kind !== 'pi') continue;
        const s = stationOn(sid, c).s, g = index.position(sid, s)!, g2 = index.position(sid, Math.min(s + 5, index.source(sid)!.stations.at(-1)!))!;
        const l = Math.hypot(g2.x - g.x, g2.y - g.y) || 1, at = { x: g.x - (g2.y - g.y) / l * pull * sign, y: g.y + (g2.x - g.x) / l * pull * sign, r: null };
        q.alignment.pis.splice(nearestLeg(q.endpoints.a.position, q.endpoints.b.position, q.alignment.pis, g), 0, at);
        yield { name: `${what}: works pulled ${sign * pull} m`, design: edited };
      }
    }
    // dead ends near our road, cut back half way to where they may go (ui/dead-end.ts)
    let ends = 0;
    for (const c of ours.crossings) {
      if (ends >= 2 || c.roadId === undefined || !sourceOf.has(c.roadId)) continue;
      const sid = sourceOf.get(c.roadId)!;
      for (const e of deadEnds(index, sid, [], [])) {
        if (ends >= 2) break;
        const cut = e.mapped + (e.limit - e.mapped) / 2, s0 = Math.min(cut, e.mapped), s1 = Math.max(cut, e.mapped), at = index.position(sid, cut);
        if (!at || s1 - s0 < 5) continue;
        const edited = structuredClone(design);
        edited.takenUp = [{ interval: { transportData: index.transportData, sourceId: sid, s0, s1 }, end: e.end, at: { x: at.x, y: at.y, z: pack.terrain.heightAt(at.x, at.y) } }];
        ends++;
        yield { name: `${presetId} km ${(c.s / 1000).toFixed(2)} ${c.cls}: dead end cut back ${Math.round(s1 - s0)} m`, design: edited };
      }
    }
  }
  for (const dir of SAVED) if (existsSync(dir)) for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const design = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as ProjectDesign;
    if (design.routes?.length && existsSync(`public/scenarios/${design.packId}/meta.json`)) yield { name: `${dir}/${f}`, design };
  }
}
