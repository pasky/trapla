import { describe, expect, it } from 'vitest';
import type { ProjectIssue, ProjectResult } from '../src/core/project';
import { listProjectIssues, notCheckedYet, projectBadge, unpricedText } from '../src/ui/project-issues';

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
    // a motorway mission: its other direction is ours too; a new motorway's two directions are one change
    const mw = { fwd: 'Motorway D3', rev: 'Motorway D3', nf: 'New motorway', nr: 'New motorway' };
    expect(unpricedText([{ routeId: 'rev' }, { routeId: 'nf' }, { routeId: 'nr' }], new Set(['fwd', 'rev']), mw, { nf: 'c', nr: 'c' })).toBe('New motorway not priced yet');
    // lines named alike (two rebuilt stretches, or one named like ours) are separate changes
    expect(unpricedText([{ routeId: 'old' }], 'rail', { rail: 'Railway', old: 'Railway' })).toBe('Railway not priced yet');
    expect(unpricedText([{ routeId: 'a' }, { routeId: 'b' }], 'rail', { rail: 'Railway', a: 'Railway', b: 'Railway' })).toBe('2 road changes not priced yet');
  });
});
