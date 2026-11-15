import { describe, expect, it } from 'vitest';
import type { ProjectIssue, ProjectResult } from '../src/core/project';
import { listProjectIssues, notCheckedYet, projectBadge } from '../src/ui/project-issues';

const issue = (title: string, routeIds: string[], blocking: ProjectIssue['blocking'], basis: 'engine' | 'game' | 'norm', s0?: number): ProjectIssue => ({
  code: title, blocking, scope: { routeIds }, locations: s0 === undefined ? [] : [{ routeId: routeIds[0], s0, s1: s0 + 10 }],
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

  it("follows core's explicit marker over the fallback", () => {
    expect(notCheckedYet({ ...issues[2], notChecked: true } as ProjectIssue)).toBe(true);
    expect(notCheckedYet({ ...unfinished, notChecked: false } as ProjectIssue)).toBe(false);
  });

  it('shows a verdict only for a priced project; only not-checked items give a neutral NOT PRICED', () => {
    const unpriced = { complete: false, valid: false } as ProjectResult;
    expect(projectBadge(unpriced, false, 0)).toEqual({ text: 'NOT PRICED', cls: 'neutral' });
    expect(projectBadge(unpriced, false, 2)).toEqual({ text: '✗ NOT VALID', cls: 'bad' });
    expect(projectBadge({ complete: true, valid: true } as ProjectResult, false, 0).cls).toBe('ok');
    expect(projectBadge(unpriced, true, 2).cls).toBe('preview');
  });
});
