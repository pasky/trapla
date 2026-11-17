// A later finish of an evaluation builds only the crossings near what it changed (src/core/crossings-kept.ts):
// what is built again, what is taken from the earlier finish, and when the whole route is built instead.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { regressionContext, regressionPackAvailable } from '../scripts/eval-regression';
import { buildCrossings, LOCAL_RETRY, type CrossingInputs, type KeptCrossings, type LocalBuildReport } from '../src/core/crossings-kept';
import type { CrossingGeometry, CrossingIssue, CrossingResult } from '../src/core/crossings';
import { evaluate, type Design } from '../src/core/evaluate';
import { stateHash } from './state-hash';

const was = { ...LOCAL_RETRY };
afterEach(() => { LOCAL_RETRY.local = was.local; LOCAL_RETRY.check = was.check; });

interface Finish {
  /** chainage → the chainage of the crossing the build leads it to */
  led?: Record<number, number>;
  /** chainages the build cannot build (an issue of the build) / whose treatment has an issue of its choice */
  bad?: number[]; unresolved?: number[];
  /** chainages whose price depends on how many crossings are built together */
  shifty?: number[];
  /** chainages of reroutes the player shaped; chainage → a point of the crossing's works */
  shaped?: number[]; works?: Record<number, { x: number; y: number }>;
  /** houses our road demolished: [building, station] */
  gone?: [number, number][];
}
/** A 20 km road, a station every 10 m, a track across it every 500 m: straight, or (`hairpin`) turning back at
 * km 14 to run 300 m beside itself. The build marks each crossing with how many were built together
 * (`linkLength`: 41 for the whole route), so a crossing built again shows. */
function road(hairpin = false) {
  const n = 2001, s = Float64Array.from({ length: n }, (_, i) => i * 10);
  const px = (at: number) => hairpin && at > 14000 ? 28000 - at : at, py = (at: number) => hairpin && at > 14000 ? 300 : 0;
  const frame = { s, x: s.map(px), y: s.map(py) };
  const inputs = () => ({ grade: new Float64Array(n), kind: new Uint8Array(n), width: new Float64Array(n).fill(20), left: new Float64Array(n).fill(10), right: new Float64Array(n).fill(10), urban: new Uint8Array(n) }) satisfies CrossingInputs;
  const kept: KeptCrossings[] = [], calls: number[] = [], paths: LocalBuildReport['path'][] = [];
  let rolls = false, resolves = 0;
  const issue = (c: CrossingResult, code: CrossingIssue['crossing']['code']): CrossingIssue => ({ kind: 'crossing', basis: 'game', rule: '', s0: c.s, s1: c.s, title: code, fix: '', crossing: { roadId: c.roadId, requested: 'overbridge', code } });
  const finish = (now: CrossingInputs, o: Finish = {}) => {
    const crossings: CrossingResult[] = Array.from({ length: 41 }, (_, k) => ({ s: k * 500, i: k * 50, x: px(k * 500), y: py(k * 500), cls: 'track', roadId: 100 + k, h: 0, type: 'atGrade', cost: 0 }));
    const resolve = () => {
      resolves++;
      return crossings.flatMap(c => {
        for (const q of ['issues', 'targetS', 'targetRoadId', 'linkLength', 'geometry', 'via'] as const) delete c[q];
        c.type = 'atGrade'; c.cost = 0;
        if (o.shaped?.includes(c.s)) c.via = [[], []];
        if (!o.unresolved?.includes(c.s)) return [];
        const v = issue(c, 'reach'); c.issues = [v]; return [v];
      });
    };
    const build = (items: CrossingResult[]) => {
      calls.push(items.length);
      return items.flatMap(c => {
        c.type = 'overbridge'; c.cost = now.grade[c.i] * 1000 + 1 + (o.shifty?.includes(c.s) ? items.length : 0); c.linkLength = items.length;
        if (o.led?.[c.s] !== undefined) { c.type = 'diversion'; c.targetS = o.led[c.s]; c.targetRoadId = 100 + o.led[c.s] / 500; }
        if (o.works?.[c.s]) c.geometry = { width: 4, schematic: false, road: [{ ...o.works[c.s], z: 0, ground: 0, surface: 'terrain' }] } as CrossingGeometry;
        if (!o.bad?.includes(c.s)) return [];
        const v = issue(c, 'geometry'); (c.issues ??= []).push(v); return [v];
      });
    };
    const issues = buildCrossings(kept, frame, now, new Map(o.gone ?? []), crossings, resolve(), build, resolve, () => rolls, path => paths.push(path));
    return { crossings, issues };
  };
  /** the chainages built again (not taken from an earlier finish) */
  const again = (f: { crossings: CrossingResult[] }) => f.crossings.filter(c => c.linkLength !== 41).map(c => c.s);
  return { inputs, finish, again, kept, calls, paths, roll: (on: boolean) => { rolls = on; }, resolves: () => resolves };
}
const at = (list: readonly CrossingResult[], s: number) => list.find(c => c.s === s)!;
const every500 = (from: number, to: number) => Array.from({ length: (to - from) / 500 + 1 }, (_, k) => from + k * 500);
/** a grade changed at km 10 */
const changed = (r: ReturnType<typeof road>) => { const b = r.inputs(); b.grade[1000] = 1; return b; };

describe('a later finish builds only the crossings near what it changed', () => {
  it('the reference builds the whole route in every finish and keeps nothing', () => {
    LOCAL_RETRY.local = false;
    const r = road();
    r.finish(r.inputs()); r.finish(changed(r));
    expect(r.calls).toEqual([41, 41]);
    expect(r.kept.length).toBe(0);
  });

  it('builds again within 2 km of a change, with 2 km of context, and takes the rest as the earlier finish built it', () => {
    LOCAL_RETRY.local = true;
    const r = road(), o = { bad: [2000], unresolved: [2000, 10000] };
    const first = r.finish(r.inputs(), o), second = r.finish(changed(r), o);
    expect(r.paths).toEqual(['first', 'local']);
    expect(r.calls).toEqual([41, 17]); // km 6 … 14
    expect(r.again(second)).toEqual(every500(8000, 12000));
    for (const c of second.crossings) {
      const before = at(first.crossings, c.s);
      expect(c.cost).toBe(c.s === 10000 ? 1001 : 1);
      // (kept: the earlier finish's, a copy on this finish's own object)
      expect(c).not.toBe(before);
      if (c.linkLength === 41) expect({ ...c, issues: undefined }).toEqual({ ...before, issues: undefined });
    }
    // the issue list: the choice's issues of this finish, then the build's (a kept crossing's as copies)
    expect(second.issues.map(v => `${v.s0}:${v.crossing.code}`)).toEqual(['2000:reach', '10000:reach', '2000:geometry']);
    const kept2000 = at(second.crossings, 2000), was2000 = at(first.crossings, 2000);
    expect(kept2000.issues).toEqual(was2000.issues);
    expect(kept2000.issues![0]).toBe(second.issues[0]);
    expect(kept2000.issues![1]).toBe(second.issues[2]);
    expect(kept2000.issues![1]).not.toBe(was2000.issues![1]);
  });

  it('builds nothing where nothing changed, and counts a demolished house or another choice as a change', () => {
    LOCAL_RETRY.local = true;
    const r = road();
    r.finish(r.inputs()); r.finish(r.inputs());
    expect(r.calls).toEqual([41]);
    expect(r.again(r.finish(r.inputs(), { gone: [[7, 300]] }))).toEqual(every500(1000, 5000)); // a house at km 3 our road now takes
    expect(r.again(r.finish(r.inputs(), { unresolved: [18000] }))).toEqual(every500(16000, 20000)); // against the first finish
    expect(r.calls).toEqual([41, 15, 13]);
    expect(r.paths).toEqual(['first', 'local', 'local', 'local']);
  });

  it('takes the earlier finish that differs at the fewest stations', () => {
    LOCAL_RETRY.local = true;
    const r = road(), b = r.inputs();
    b.grade.fill(2);
    r.finish(r.inputs()); r.finish(b); r.finish(changed(r));
    expect(r.paths).toEqual(['first', 'share', 'local']);
    expect(r.calls).toEqual([41, 41, 17]);
  });

  it('measures in plan: the other leg of a hairpin beside a change is built again', () => {
    LOCAL_RETRY.local = true;
    const r = road(true);
    r.finish(r.inputs());
    // km 10 lies 300 m from km 18 of the leg coming back
    expect(r.again(r.finish(changed(r)))).toEqual([...every500(8000, 12000), ...every500(16500, 19500)]);
    expect(r.calls).toEqual([41, 29]); // km 6 … 20
  });

  it('builds again a reroute the player shaped, and a kept crossing whose works lie beside the change', () => {
    LOCAL_RETRY.local = true;
    const r = road(), o = { shaped: [17000], works: { 19000: { x: 10040, y: 60 }, 19500: { x: 10040, y: 400 } } };
    r.finish(r.inputs(), o);
    expect(r.again(r.finish(changed(r), o))).toEqual([...every500(8000, 12000), 17000, 19000]);
  });

  it('builds with them what they and their context are led to and from', () => {
    LOCAL_RETRY.local = true;
    const r = road(), o = { led: { 16000: 13000, 16500: 17000 } };
    r.finish(r.inputs(), o);
    const second = r.finish(changed(r), o);
    expect(r.calls).toEqual([41, 18]); // km 6 … 14 and km 16, led to km 13
    expect(r.again(second)).toEqual(every500(8000, 12000));
    expect(at(second.crossings, 16000)).toMatchObject({ type: 'diversion', targetS: 13000, linkLength: 41 });
  });

  it('builds the whole route when the earlier build or this one rolled back', () => {
    LOCAL_RETRY.local = true;
    const r = road();
    r.roll(true); r.finish(r.inputs()); r.roll(false); r.finish(changed(r));
    expect(r.paths).toEqual(['first', 'rollback']);
    expect(r.calls).toEqual([41, 41]);
    const q = road();
    q.finish(q.inputs()); q.roll(true); q.finish(changed(q));
    expect(q.paths).toEqual(['first', 'rollback']);
    expect(q.calls).toEqual([41, 17, 41]);
  });

  it('builds the whole route when a crossing in reach of one built again came out other than it was kept', () => {
    LOCAL_RETRY.local = true;
    const r = road(), o = { shifty: [13500] }; // 1.5 km from km 12, which is built again
    r.finish(r.inputs(), o);
    const before = r.resolves(), second = r.finish(changed(r), o);
    expect(r.paths).toEqual(['first', 'context']);
    expect(r.calls).toEqual([41, 17, 41]);
    expect(r.resolves()).toBe(before + 2); // resolved again before the whole route was built
    expect(r.again(second)).toEqual([]);
    // (one out of reach of every crossing built again may: its result is not taken)
    const q = road(), far = { shifty: [14500], led: { 14500: 13000 } };
    q.finish(q.inputs(), far); q.finish(changed(q), far);
    expect(q.paths).toEqual(['first', 'local']);
    expect(q.calls).toEqual([41, 18]);
  });

  it('builds the whole route when a kept crossing is led to one that changed', () => {
    LOCAL_RETRY.local = true;
    const r = road(), o = { led: { 13000: 12000 }, shifty: [12000] };
    r.finish(r.inputs(), o); r.finish(changed(r), o);
    expect(r.paths).toEqual(['first', 'follower']);
    expect(r.calls).toEqual([41, 17, 41]);
  });

  it('check: reports where the local build is not the whole route\'s and goes on with the whole route\'s', () => {
    const reports: LocalBuildReport[] = [];
    LOCAL_RETRY.local = false; LOCAL_RETRY.check = report => reports.push(report);
    const r = road(), o = { shifty: [9000] };
    r.finish(r.inputs(), o);
    const second = r.finish(changed(r), o);
    expect(r.calls).toEqual([41, 17, 41]);
    expect(r.again(second)).toEqual([]);
    expect(reports.map(x => x.path)).toEqual(['first', 'local']);
    expect(reports[1]).toMatchObject({ crossings: 41, core: 9, subset: 17, changed: 1 });
    // (every crossing built again carries another mark; km 9 another price)
    expect(reports[1].differs!.map(x => x.s)).toEqual(every500(8000, 12000));
    expect(reports[1].differs!.find(x => x.s === 9000)).toMatchObject({ core: true, d: 1000, local: 'overbridge 18', whole: 'overbridge 42' });
  });

  it.skipIf(!regressionPackAvailable())('direct-80: its regrade retry is built locally, the result is the whole-route one', () => {
    const ctx = regressionContext();
    const d = JSON.parse(readFileSync('scripts/direct-80-design.json', 'utf8')).design as Design;
    const skip = new Set<unknown>([ctx.terrain, ctx.roads, ctx.buildings, ctx.scenario, ctx.junctions, d]);
    const hash = (result: ReturnType<typeof evaluate>) => { const { timing: _timing, ...rest } = result; return stateHash(rest, skip); };
    LOCAL_RETRY.local = false;
    const whole = evaluate(ctx, d);
    LOCAL_RETRY.local = true;
    const local = evaluate(ctx, d);
    expect(whole.timing['count.crossings.local']).toBeUndefined();
    expect(local.timing['count.crossings.local']).toBeGreaterThan(0);
    expect(local.cost.total).toBe(whole.cost.total);
    expect(hash(local)).toBe(hash(whole));
  });
});
