import { describe, expect, it } from 'vitest';
import type { ProjectIssue, ProjectResult } from '../src/core/project';
import { czk } from '../src/ui/costgroups';
import { aloneText, billChangeText, lineBills, listProjectIssues, notCheckedYet, projectBadge, StepResults, unpricedText } from '../src/ui/project-issues';

const issue = (title: string, routeIds: string[], blocking: ProjectIssue['blocking'], basis: 'engine' | 'game' | 'norm', s0?: number): ProjectIssue => ({
  code: title, blocking, check: basis === 'engine' ? 'not-checked' : 'violation', scope: { routeIds }, locations: s0 === undefined ? [] : [{ routeId: routeIds[0], s0, s1: s0 + 10 }],
  violation: { kind: 'crossing', basis, title, fix: 'fix', rule: 'rule' },
});
const unfinished = issue('Road checks are not finished', ['side'], 'incomplete', 'engine');
const issues = [unfinished, { ...unfinished }, issue('Road ends nowhere', ['side'], 'incomplete', 'game'),
  issue('Too steep: 8 % climb', ['side'], 'invalid', 'norm', 230), issue('Too steep: 8 % climb', ['road'], 'invalid', 'norm', 450)];

describe('project issue list', () => {
  it('keeps engine-limit items out of the violations, once each, and names other roads', () => {
    const { violations, notChecked } = listProjectIssues(issues, 'road', { road: 'Road', side: 'Valley road' });
    expect(notChecked.map(i => [i.k, i.title, i.road])).toEqual([[0, 'Road checks are not finished', 'Valley road']]);
    expect(violations.map(i => [i.k, i.title, i.road ?? null])).toEqual([
      [2, 'Road ends nowhere', 'Valley road'], [3, 'Too steep: 8 % climb', 'Valley road'], [4, 'Too steep: 8 % climb', null]]);
  });

  it("follows core's check kind, and words a meeting at a road's end as a join", () => {
    expect(notCheckedYet({ ...issues[3], check: 'not-checked' })).toBe(true);
    expect(notCheckedYet({ ...unfinished, check: 'violation' })).toBe(false);
    const meet = (s: number): ProjectIssue => ({ ...issue('Roads cross here', ['road', 'side'], 'incomplete', 'engine'), code: 'roads-cross',
      locations: [{ routeId: 'road', s0: 500, s1: 500 }, { routeId: 'side', s0: s, s1: s }], at: { x: 1, y: 2 } });
    const names = { road: 'Road', side: 'Valley road' }, lengths = { road: 1000, side: 800 };
    expect(listProjectIssues([meet(400)], 'road', names, lengths).notChecked[0]).toMatchObject({ title: 'Roads cross here', s0: 500 });
    expect(listProjectIssues([meet(800)], 'road', names, lengths).notChecked[0]).toMatchObject({ title: 'Roads join here', fix: 'This join is not checked yet' });
    expect(listProjectIssues([meet(0)], 'side', names, lengths).notChecked[0]).toMatchObject({ title: 'Roads join here', s0: 0 });
  });

  it('shows a verdict only for a priced project; only not-checked items give a neutral NOT PRICED', () => {
    const unpriced = { complete: false, valid: false } as ProjectResult;
    expect(projectBadge(unpriced, false, 0)).toEqual({ text: 'NOT PRICED', cls: 'neutral' });
    expect(projectBadge(unpriced, false, 2)).toEqual({ text: '✗ NOT VALID', cls: 'bad' });
    expect(projectBadge({ complete: true, valid: true } as ProjectResult, false, 0).cls).toBe('ok');
    expect(projectBadge(unpriced, true, 2).cls).toBe('preview');
  });
  it('counts road changes, not our road caught up in a crossing, and names a single one', () => {
    const names = { road: 'Road', side: 'Valley road', track: 'Track' };
    expect(unpricedText([{ routeId: 'road' }, { routeId: 'side' }, { routeId: 'side' }], 'road', names)).toBe('Valley road not priced yet');
    expect(unpricedText([{ routeId: 'side' }, { routeId: 'track' }, { routeId: 'road' }], 'road', names)).toBe('2 road changes not priced yet');
    expect(unpricedText([{ routeId: 'road' }], 'road', names)).toBe('Our road is not priced yet');
    // a motorway is two roads of ours: its other direction is not a "road change"
    expect(unpricedText([{ routeId: 'there' }, { routeId: 'back' }, { routeId: 'side' }], new Set(['there', 'back']), names)).toBe('Valley road not priced yet');
    // a motorway mission: its other direction is ours too; a new motorway's two directions are one change
    const mw = { fwd: 'Motorway D3', rev: 'Motorway D3', nf: 'New motorway', nr: 'New motorway' };
    expect(unpricedText([{ routeId: 'rev' }, { routeId: 'nf' }, { routeId: 'nr' }], new Set(['fwd', 'rev']), mw, { nf: 'c', nr: 'c' })).toBe('New motorway not priced yet');
    // lines named alike (two rebuilt stretches, or one named like ours) are separate changes
    expect(unpricedText([{ routeId: 'old' }], 'rail', { rail: 'Railway', old: 'Railway' })).toBe('Railway not priced yet');
    expect(unpricedText([{ routeId: 'a' }, { routeId: 'b' }], 'rail', { rail: 'Railway', a: 'Railway', b: 'Railway' })).toBe('2 road changes not priced yet');
  });
  it('keeps what is priced in view while there is no total: every other road alone, never added up', () => {
    const names = { road: 'Road', side: 'Valley road', track: 'Track' }, money = (v: number) => `${v} M`, ours = new Set(['road', 'back']);
    // the side road is active (its own price is the big number): our road's price stays visible
    expect(aloneText({ road: 15000, side: 27 }, 'side', ours, names, money)).toBe('Our road alone: 15000 M');
    expect(aloneText({ road: 15000, side: 27 }, 'road', ours, names, money)).toBe('Valley road alone: 27 M');
    expect(aloneText({ road: 15000, side: 27, track: 3 }, 'road', ours, names, money)).toBe('Alone: Valley road 27 M, Track 3 M');
    // the other direction of our motorway is active: our road is not listed against itself
    expect(aloneText({ road: 15000, side: 27 }, 'back', ours, names, money)).toBe('Valley road alone: 27 M');
    expect(aloneText({ road: 15000 }, 'road', ours, names, money)).toBe('');
    // a motorway's two directions (ours or another) are one line, priced once
    const mw = { fwd: 'Motorway D3', rev: 'Motorway D3', side: 'Valley road', nf: 'New motorway', nr: 'New motorway' };
    expect(aloneText({ fwd: 524, rev: 524, side: 27, nf: 9, nr: 9 }, 'side', new Set(['fwd', 'rev']), mw, money, 'our motorway', { nf: 'c', nr: 'c' }))
      .toBe('Alone: our motorway 524 M, New motorway 9 M');
  });

  it('says which roads\' bills one edit changed (QA: rebuilding III/1057 under our bridge, −17 M unexplained)', () => {
    // the owner's case, as measured: the rebuilt road costs 9.8 M; our motorway's bridge over it is 30 m
    // shorter (−35.4 M) and its embankment longer (+10.9 M); a paired motorway's two directions share one result
    const cost = (bridges: number, earthworks: number) => ({ roadBase: 0, earthworks, earthDetail: { culverts: 0 }, bridges, tunnels: 0, crossings: 0,
      noiseWalls: 0, surcharge: 0, landDetail: { land: 0, forest: 0, buildings: 0, noiseBuyouts: 0 } });
    const body = (bridges: number, earthworks: number) => ({ legacy: { cost: cost(bridges, earthworks) } });
    const project = (alone: Record<string, number>, routes: Record<string, unknown>) => ({ cost: { alone }, routes }) as unknown as ProjectResult;
    const was = body(3_877.6e6, 2_000e6), now = body(3_842.2e6, 2_010.9e6), money = (v: number) => czk(v).replace(' CZK', '');
    const ours = new Set(['fwd', 'rev']), names = { fwd: 'Motorway', rev: 'Motorway', r1: 'Road III/1057' };
    const before = lineBills(project({ fwd: 14_219.9e6 }, { fwd: was, rev: was }), ours, names, 'our motorway');
    const after = lineBills(project({ fwd: 14_195.5e6, r1: 9.8e6 }, { fwd: now, rev: now, r1: body(0, 0.6e6) }), ours, names, 'our motorway');
    expect(after.get('ours')!.groups.bridges).toBeCloseTo(3_842.2e6);
    expect(billChangeText(before, after, money)).toBe('Our motorway −24 M (bridges −35 M) · Road III/1057 +9.8 M');
    // one road's own change needs no breakdown (the change line says it)
    expect(billChangeText(before, lineBills(project({ fwd: 14_000e6 }, { fwd: now, rev: now }), ours, names, 'our motorway'), money)).toBe('');
  });

  it('the change line is one step\'s change, by road (QA sweep 3 re-check: a removed road\'s −229 M in the next drag\'s line)', () => {
    const money = (v: number) => czk(v).replace(' CZK', '');
    const project = (alone: Record<string, number>) => ({ cost: { alone }, routes: {} }) as unknown as ProjectResult;
    const ours = new Set(['road']), names = { road: 'Road', side: 'New road', iii: 'Road III/3012', iii2: 'Road III/3012' };
    const bills = (alone: Record<string, number>, lines: Record<string, string> = {}) => lineBills(project(alone), ours, names, 'our road', lines);
    const steps = new StepResults();
    // Build → Road (e:1), Remove road (e:2), then a drag of III/3012 (three changes, one step: e:3 … e:5)
    steps.record('e:1', 9_079e6, bills({ road: 8_850e6, side: 229e6 }));
    steps.note('e:1', true);
    steps.record('e:2', 8_850e6, bills({ road: 8_850e6 }));
    steps.note('e:2', false); steps.note('e:3', false); steps.note('e:4', true);
    const dragged = bills({ road: 8_616e6, iii: 6.5e6 });
    steps.record('e:5', 8_622.5e6, dragged);
    expect(steps.baseline!.total).toBe(8_850e6);
    expect(billChangeText(steps.baseline!.bills!, dragged, money)).toBe('Our road −234 M · Road III/3012 +6.5 M');
    // Undo: the step undone, signs flipped once; Undo again: the removed road back, one line (no breakdown)
    steps.note('e:5', true);
    const undone = bills({ road: 8_850e6 });
    steps.record('e:6', 8_850e6, undone);
    expect(billChangeText(steps.baseline!.bills!, undone, money)).toBe('Our road +234 M · Road III/3012 −6.5 M');
    steps.note('e:6', true);
    steps.record('e:7', 9_079e6, bills({ road: 8_850e6, side: 229e6 }));
    expect(billChangeText(steps.baseline!.bills!, bills({ road: 8_850e6, side: 229e6 }), money)).toBe('');
    // a change from a snapshot whose result never came (edits faster than the checks): no line from another step
    steps.note('e:8', true);
    expect(steps.baseline).toBeNull();
    // a saved design loaded gives the same rebuilt stretch another id: one road, not "−6.5 M · +5.8 M"
    const source = 'source:osm:way:1:0-650';
    expect(billChangeText(bills({ road: 8_616e6, iii: 6.5e6 }, { iii: source }), bills({ road: 8_700e6, iii2: 5.8e6 }, { iii2: source }), money))
      .toBe('Our road +84 M · Road III/3012 −0.7 M');
  });
});
