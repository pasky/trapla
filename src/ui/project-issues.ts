// What the project score says about issues: real violations versus checks the game has not done yet.
// Pure (no DOM) so the wording and counting are testable.
import type { ProjectIssue, ProjectResult, RouteId } from '../core/project';

/** An engine limit ("not checked yet"), not a fault of the design: never counted or shown as a violation.
 * Core's explicit marker decides; older results fall back to engine-basis incomplete issues. */
export function notCheckedYet(issue: ProjectIssue): boolean {
  const marked = (issue as ProjectIssue & { notChecked?: boolean }).notChecked;
  return marked ?? (issue.blocking === 'incomplete' && issue.violation.basis === 'engine');
}

export interface ListedIssue {
  /** index into ProjectResult.issues (what a click reports) */
  k: number;
  title: string; fix: string; detail?: string; rule: string; kind: ProjectIssue['violation']['kind'];
  s0?: number;
  /** the road it belongs to, when that is not the active road */
  road?: string;
}

/** One line per distinct message and road (core may report the same unfinished check twice), split
 * into real violations and not-checked-yet items. */
export function listProjectIssues(issues: readonly ProjectIssue[], activeRouteId: RouteId | undefined,
  names: Readonly<Record<RouteId, string>>): { violations: ListedIssue[]; notChecked: ListedIssue[] } {
  const seen = new Set<string>(), violations: ListedIssue[] = [], notChecked: ListedIssue[] = [];
  issues.forEach((issue, k) => {
    const s0 = issue.locations[0]?.s0, v = issue.violation;
    const key = JSON.stringify([v.title, v.fix, issue.scope.routeIds, s0]);
    if (seen.has(key)) return; seen.add(key);
    const own = activeRouteId !== undefined && issue.scope.routeIds.includes(activeRouteId);
    const other = issue.scope.routeIds.find(id => id !== activeRouteId);
    const item: ListedIssue = { k, title: v.title, fix: v.fix, rule: v.rule, kind: v.kind, ...(v.detail ? { detail: v.detail } : {}),
      ...(s0 === undefined ? {} : { s0 }), ...(!own && other && names[other] ? { road: names[other] } : {}) };
    (notCheckedYet(issue) ? notChecked : violations).push(item);
  });
  return { violations, notChecked };
}

/** The score badge: a verdict only for a priced project; real violations are red even unpriced;
 * otherwise a neutral "not priced". */
export function projectBadge(result: ProjectResult | null, pending: boolean, violations: number): { text: string; cls: 'preview' | 'ok' | 'bad' | 'neutral' } {
  if (pending) return { text: '≈ CHECKING', cls: 'preview' };
  if (result?.complete) return result.valid ? { text: '✓ VALID', cls: 'ok' } : { text: '✗ NOT VALID', cls: 'bad' };
  if (violations) return { text: '✗ NOT VALID', cls: 'bad' };
  return { text: 'NOT PRICED', cls: 'neutral' };
}
