// A later finish of an evaluation builds only the crossings near what it changed (src/core/crossings-kept.ts):
// what is built again, what is taken from the earlier finish, and when the whole route is built instead.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { regressionContext, regressionPackAvailable } from '../scripts/eval-regression';
import { buildCrossings, LOCAL_CONTEXT, LOCAL_CORE, LOCAL_RETRY, type CrossingInputs, type KeptCrossings, type LocalBuildReport } from '../src/core/crossings-kept';
import type { CrossingIssue, CrossingResult } from '../src/core/crossings';
import { evaluate, type Design } from '../src/core/evaluate';
import { stateHash } from './state-hash';

const was = { ...LOCAL_RETRY };
afterEach(() => { LOCAL_RETRY.local = was.local; LOCAL_RETRY.check = was.check; });

/** A 20 km road, a station every 10 m, a track across it every 500 m; a build that prices each crossing by our
 * grade there plus the number of crossings built with it (so a crossing built in a subset shows). */
function road() {
  const n = 2001, s = Float64Array.from({ length: n }, (_, i) => i * 10), frame = {};
  const inputs = () => ({ grade: new Float64Array(n), kind: new Uint8Array(n), width: new Float64Array(n).fill(20), left: new Float64Array(n).fill(10), right: new Float64Array(n).fill(10), urban: new Uint8Array(n) }) satisfies CrossingInputs;
  const kept: KeptCrossings[] = [], calls: number[] = [], paths: LocalBuildReport['path'][] = [];
  let rolls = false, resolves = 0;
  const issue = (c: CrossingResult, code: CrossingIssue['crossing']['code']): CrossingIssue => ({ kind: 'crossing', basis: 'game', rule: '', s0: c.s, s1: c.s, title: code, fix: '', crossing: { roadId: c.roadId, requested: 'overbridge', code } });
  /** `led`: crossings (chainage → target chainage) the build leads to another; `bad`: chainages it cannot build */
  const finish = (now: CrossingInputs, o: { led?: Record<number, number>; bad?: number[]; gone?: [number, number][]; unresolved?: number[] } = {}) => {
    const crossings: CrossingResult[] = Array.from({ length: 41 }, (_, k) => ({ s: k * 500, i: k * 50, x: k * 500, y: 0, cls: 'track', roadId: 100 + k, h: 0, type: 'atGrade', cost: 0 }));
    const resolve = () => {
      resolves++;
      return crossings.flatMap(c => { delete c.issues; delete c.targetS; delete c.targetRoadId; c.type = 'atGrade'; c.cost = 0;
        if (!o.unresolved?.includes(c.s)) return [];
        const v = issue(c, 'reach'); c.issues = [v]; return [v]; });
    };
    const build = (items: CrossingResult[]) => {
      calls.push(items.length);
      return items.flatMap(c => {
        c.type = 'overbridge'; c.cost = now.grade[c.i] * 1000 + items.length;
        if (o.led?.[c.s] !== undefined) { c.type = 'diversion'; c.targetS = o.led[c.s]; c.targetRoadId = 100 + o.led[c.s] / 500; }
        if (!o.bad?.includes(c.s)) return [];
        const v = issue(c, 'geometry'); (c.issues ??= []).push(v); return [v];
      });
    };
    const issues = buildCrossings(kept, frame, s, now, new Map(o.gone ?? []), crossings, resolve(), build, resolve, () => rolls, path => paths.push(path));
    return { crossings, issues };
  };
  return { inputs, finish, kept, calls, paths, roll: (on: boolean) => { rolls = on; }, resolves: () => resolves };
}
const at = (list: readonly CrossingResult[], s: number) => list.find(c => c.s === s)!;

describe('a later finish builds only the crossings near what it changed', () => {
  it('the reference builds the whole route in every finish and keeps nothing', () => {
    LOCAL_RETRY.local = false;
    const r = road(), a = r.inputs(), b = r.inputs();
    b.grade[1000] = 1;
    r.finish(a); r.finish(b);
    expect(r.calls).toEqual([41, 41]);
    expect(r.kept.length).toBe(0);
  });

  it('builds again within the core of a change, with context, and takes the rest as the earlier finish built it', () => {
    LOCAL_RETRY.local = true;
    const r = road(), a = r.inputs(), b = r.inputs();
    b.grade[1000] = 1; // km 10
    const first = r.finish(a, { bad: [2000], unresolved: [2000, 10000] }), second = r.finish(b, { bad: [2000], unresolved: [2000, 10000] });
    const inSubset = second.crossings.filter(c => Math.abs(c.s - 10000) <= LOCAL_CORE + LOCAL_CONTEXT).length;
    expect(r.calls).toEqual([41, inSubset]);
    expect(r.paths).toEqual(['first', 'local']);
    for (const c of second.crossings) {
      const d = Math.abs(c.s - 10000), before = at(first.crossings, c.s);
      // (built again: priced with the subset; kept: the earlier finish's, a copy on this finish's own object)
      expect(c.cost).toBe(d <= LOCAL_CORE ? (c.s === 10000 ? 1000 : 0) + inSubset : 41);
      expect(c).not.toBe(before);
      if (d > LOCAL_CORE) expect({ ...c, issues: undefined }).toEqual({ ...before, issues: undefined });
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
    const r = road(), a = r.inputs();
    r.finish(a); r.finish(r.inputs());
    expect(r.calls).toEqual([41]);
    r.finish(r.inputs(), { gone: [[7, 300]] }); // a house at km 3 our road now takes
    expect(r.calls[1]).toBe(15); // km 0 … 7
    r.finish(r.inputs(), { unresolved: [18000] }); // against the first finish: km 18's treatment
    expect(r.calls[2]).toBe(13); // km 14 … 20
    expect(r.paths).toEqual(['first', 'local', 'local', 'local']);
  });

  it('takes the earlier finish that differs at the fewest stations', () => {
    LOCAL_RETRY.local = true;
    const r = road(), a = r.inputs(), b = r.inputs(), c = r.inputs();
    for (let i = 0; i < 2001; i++) b.grade[i] = 2;
    c.grade[1000] = 1;
    r.finish(a); r.finish(b); r.finish(c);
    expect(r.paths).toEqual(['first', 'share', 'local']);
    expect(r.calls).toEqual([41, 41, 17]);
  });

  it('builds the whole route when the earlier build or this one rolled back', () => {
    LOCAL_RETRY.local = true;
    const r = road(), b = r.inputs();
    b.grade[1000] = 1;
    r.roll(true); r.finish(r.inputs()); r.roll(false); r.finish(b);
    expect(r.paths).toEqual(['first', 'rollback']);
    expect(r.calls).toEqual([41, 41]);
    const q = road();
    q.finish(q.inputs()); q.roll(true); q.finish(b);
    expect(q.paths).toEqual(['first', 'rollback']);
    expect(q.calls).toEqual([41, 17, 41]);
  });

  it('builds the whole route when a crossing built again is led to one outside the core that came out differently', () => {
    LOCAL_RETRY.local = true;
    const r = road(), b = r.inputs();
    b.grade[1000] = 1;
    r.finish(r.inputs());
    const before = r.resolves(), second = r.finish(b, { led: { 12000: 12500 } });
    expect(r.paths).toEqual(['first', 'target']);
    expect(r.calls).toEqual([41, 17, 41]);
    expect(r.resolves()).toBe(before + 2); // resolved again before the whole route was built
    expect(at(second.crossings, 12000).cost).toBe(41);
  });

  it('builds the whole route when a kept crossing is led to one that changed', () => {
    LOCAL_RETRY.local = true;
    const r = road(), b = r.inputs();
    b.grade[1000] = 1;
    r.finish(r.inputs(), { led: { 12500: 12000 } }); r.finish(b, { led: { 12500: 12000 } });
    expect(r.paths).toEqual(['first', 'follower']);
    expect(r.calls).toEqual([41, 17, 41]);
  });

  it('check: reports where the local build is not the whole route\'s and goes on with the whole route\'s', () => {
    const reports: LocalBuildReport[] = [];
    LOCAL_RETRY.local = false; LOCAL_RETRY.check = report => reports.push(report);
    const r = road(), b = r.inputs();
    b.grade[1000] = 1;
    r.finish(r.inputs());
    const second = r.finish(b);
    expect(r.calls).toEqual([41, 17, 41]);
    expect(second.crossings.every(c => c.cost === (c.s === 10000 ? 1041 : 41))).toBe(true);
    // (this build prices by how many are built together: every crossing built again differs, no kept one)
    expect(reports[1].path).toBe('local');
    expect(reports[1].differs!.map(x => x.s)).toEqual(second.crossings.filter(c => Math.abs(c.s - 10000) <= LOCAL_CORE).map(c => c.s));
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
