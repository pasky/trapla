// What the project score says about issues: real violations versus checks the game has not done yet.
// Pure (no DOM) so the wording and counting are testable.
import type { ProjectIssue, ProjectResult, RouteId } from '../core/project';
import { COST_GROUPS } from './costgroups';

/** An engine limit ("not checked yet"), not a fault of the design: never counted or shown as a violation. */
export function notCheckedYet(issue: ProjectIssue): boolean { return issue.check === 'not-checked'; }

/** Core reports where two new roads meet as a crossing / overlap; at a road's end that is a join. */
const JOIN_TOLERANCE_M = 1;
function joinWording(issue: ProjectIssue, lengths: Readonly<Record<RouteId, number>>) {
  if (issue.code !== 'roads-cross' && issue.code !== 'roads-overlap') return null;
  const atEnd = issue.locations.some(l => {
    const length = lengths[l.routeId];
    return l.s0 <= JOIN_TOLERANCE_M || (length !== undefined && l.s1 >= length - JOIN_TOLERANCE_M);
  });
  return atEnd ? { title: 'Roads join here', fix: 'This join is not checked yet' } : null;
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
  names: Readonly<Record<RouteId, string>>, lengths: Readonly<Record<RouteId, number>> = {}): { violations: ListedIssue[]; notChecked: ListedIssue[] } {
  const seen = new Set<string>(), violations: ListedIssue[] = [], notChecked: ListedIssue[] = [];
  issues.forEach((issue, k) => {
    const s0 = issue.locations.find(l => l.routeId === activeRouteId)?.s0 ?? issue.locations[0]?.s0;
    const v = { ...issue.violation, ...joinWording(issue, lengths) };
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

/** What is not priced yet, counted per road change (distinct roads that are not ours), named when there is
 * one. Our road appears only when no road change is unpriced. */
export function unpricedText(unpriced: readonly { routeId: RouteId }[], ours: RouteId | undefined | ReadonlySet<RouteId>,
  names: Readonly<Record<RouteId, string>>, groups: Readonly<Record<RouteId, string>> = {}): string {
  // `ours`: our road, or every road of it (a motorway mission is two: its other direction is no change)
  const mine = typeof ours === 'string' ? new Set([ours]) : ours ?? new Set<RouteId>();
  const ids = [...new Set(unpriced.map(u => u.routeId))];
  // one change per physical line: the two directions of a motorway are one (`groups`: its corridor)
  const changes = [...new Map(ids.filter(id => !mine.has(id)).map(id => [groups[id] ?? id, id])).values()];
  if (!changes.length) return ids.length ? 'Our road is not priced yet' : '';
  if (changes.length === 1) return `${names[changes[0]] ?? 'One road change'} not priced yet`;
  return `${changes.length} road changes not priced yet`;
}

/** While there is no project total: what IS priced, so it is not lost from view. Each other road's own
 * price (as if it were the only change; core `cost.alone`), never added up. The active road's own price
 * is the big number above this line. */
export function aloneText(alone: Readonly<Record<RouteId, number>>, activeRouteId: RouteId | undefined, ours: ReadonlySet<RouteId>,
  names: Readonly<Record<RouteId, string>>, money: (v: number) => string, ourWord = 'our road',
  groups: Readonly<Record<RouteId, string>> = {}): string {
  // one line per physical line: our road (all its routes) once, a motorway's two directions once (`groups`)
  const unit = (id: RouteId) => ours.has(id) ? 'ours' : groups[id] ?? id;
  const active = activeRouteId !== undefined ? unit(activeRouteId) : undefined;
  const others = [...new Map(Object.keys(alone).filter(id => unit(id) !== active).map(id => [unit(id), id])).values()];
  if (!others.length) return '';
  const label = (id: RouteId) => ours.has(id) ? ourWord : names[id] ?? 'a road';
  if (others.length === 1) { const l = label(others[0]); return `${l.charAt(0).toUpperCase()}${l.slice(1)} alone: ${money(alone[others[0]])}`; }
  const shown = others.slice(0, 3).map(id => `${label(id)} ${money(alone[id])}`);
  return `Alone: ${shown.join(', ')}${others.length > 3 ? ` and ${others.length - 3} more` : ''}`;
}

/** One physical line's bill (our road / a motorway's two directions once): its total (core `cost.alone`,
 * own works included) and its bill groups (costgroups.ts ids). */
export interface LineBill { label: string; total: number; groups: Record<string, number> }
/** Each line's bill in a priced project, keyed by line (`groups`: a motorway's corridor; ours: "ours"). */
export function lineBills(result: ProjectResult, ours: ReadonlySet<RouteId>, names: Readonly<Record<RouteId, string>>,
  ourWord: string, groups: Readonly<Record<RouteId, string>> = {}): Map<string, LineBill> {
  const out = new Map<string, LineBill>(), counted = new Set<object>();
  for (const [id, total] of Object.entries(result.cost.alone)) {
    const unit = ours.has(id) ? 'ours' : groups[id] ?? id;
    if (!out.has(unit)) out.set(unit, { label: ours.has(id) ? ourWord : names[id] ?? 'a road', total, groups: {} });
  }
  // the groups: every evaluated part of the line once (a paired motorway's two directions share one result)
  for (const [id, rr] of Object.entries(result.routes)) {
    const line = out.get(ours.has(id) ? 'ours' : groups[id] ?? id), r = rr.legacy;
    if (!line || !r || counted.has(r)) continue;
    counted.add(r);
    for (const g of COST_GROUPS) line.groups[g.id] = (line.groups[g.id] ?? 0) + g.of(r.cost);
  }
  return out;
}

/** Which lines' bills the last edit changed, when it changed more than one: "Road III/1057 +9.8 M ·
 * our motorway −24 M (bridges −35 M)" — a new line with its whole bill, a changed one with the bill line
 * that moved the most where that is most of its change. '' when one line or none changed. */
export function billChangeText(before: ReadonlyMap<string, LineBill>, after: ReadonlyMap<string, LineBill>, money: (v: number) => string): string {
  const MIN = 5e5;
  const signed = (v: number) => `${v < 0 ? '−' : '+'}${money(Math.abs(v))}`;
  const parts: { text: string; size: number }[] = [];
  for (const [unit, now] of after) {
    const was = before.get(unit), change = now.total - (was?.total ?? 0);
    if (Math.abs(change) < MIN) continue;
    let why = '';
    if (was) {
      const top = COST_GROUPS.map(g => ({ g, d: (now.groups[g.id] ?? 0) - (was.groups[g.id] ?? 0) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
      if (top && Math.abs(top.d) >= MIN && Math.abs(top.d) >= 0.5 * Math.abs(change)) why = ` (${top.g.label.toLowerCase()} ${signed(top.d)})`;
    }
    parts.push({ text: `${now.label} ${signed(change)}${why}`, size: Math.abs(change) });
  }
  for (const [unit, was] of before) if (!after.has(unit) && Math.abs(was.total) >= MIN) parts.push({ text: `${was.label} ${signed(-was.total)}`, size: Math.abs(was.total) });
  if (parts.length < 2) return '';
  const text = parts.sort((x, y) => y.size - x.size).map(p => p.text).join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
