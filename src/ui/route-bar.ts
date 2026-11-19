import type { ProjectDesign, RouteId, RouteKind } from '../core/project';
import { pairedName } from '../core/data/categories';
import { motorwayCategory } from '../core/route-section';

/** The road list's entries: a paired motorway is one entry (both directions share its alignment); our
 * motorway is "Motorway", another keeps its own name; two the same are numbered. `paired`: each reverse
 * direction's forward one. */
export function routeChoices(project: ProjectDesign): { options: { id: RouteId; name: string }[]; paired: Map<RouteId, RouteId> } {
  const paired = new Map(project.corridors.filter(c => c.mode === 'paired').map(c => [c.children.reverse, c.children.forward]));
  const together = new Set(paired.values());
  const options = project.routes.filter(route => !paired.has(route.id)).map(route => ({ id: route.id,
    name: together.has(route.id) && route.role === 'mission' && route.kind === 'motorway' ? pairedName(motorwayCategory(route)) : route.name }));
  const seen = new Map<string, number>();
  for (const o of options) { const k = (seen.get(o.name) ?? 0) + 1; seen.set(o.name, k); if (k > 1) o.name = `${o.name} ${k}`; }
  return { options, paired };
}
/** Only constructed/changed project routes live here; base roads are selected directly on the map.
 * The list shows only when there are two or more roads to switch between. */
export class RouteBar {
  readonly root = document.createElement('div');
  private select = document.createElement('select');
  private build = document.createElement('button');
  private choices = document.createElement('div');
  onSelect?: (id: RouteId) => void;
  /** `label`: which build kind (two may build the same kind of line: a road and a slip road) */
  onBuild?: (kind: RouteKind, label: string) => void;
  /** Build menu entries: the registered build kinds (ui/route-kinds.ts), in order. */
  constructor(parent: HTMLElement, private kinds: readonly { kind: RouteKind; label: string }[]) {
    this.root.className = 'route-bar'; this.select.setAttribute('aria-label', 'Road to edit');
    this.select.id = 'active-route';
    this.select.onchange = () => this.onSelect?.(this.select.value);
    this.build.textContent = 'Build'; this.build.type = 'button'; this.build.id = 'build-route';
    this.build.setAttribute('aria-expanded', 'false'); this.choices.className = 'route-build-choices'; this.choices.hidden = true;
    this.build.onclick = () => { this.choices.hidden = !this.choices.hidden; this.build.setAttribute('aria-expanded', String(!this.choices.hidden)); };
    for (const { kind, label } of this.kinds) {
      const button = document.createElement('button'); button.textContent = label; button.type = 'button'; button.dataset.kind = kind;
      button.onclick = () => { this.choices.hidden = true; this.build.setAttribute('aria-expanded', 'false'); this.onBuild?.(kind, label); };
      this.choices.append(button);
    }
    this.root.append(this.select, this.build, this.choices); parent.append(this.root);
  }
  set(project: ProjectDesign, activeRouteId: RouteId | null, editing = false) {
    const { options, paired } = routeChoices(project);
    if (activeRouteId && paired.has(activeRouteId)) activeRouteId = paired.get(activeRouteId)!;
    if (JSON.stringify(options) !== this.select.dataset.options) {
      this.select.replaceChildren(...options.map(route => { const option = document.createElement('option'); option.value = route.id; option.textContent = route.name; return option; }));
      this.select.dataset.options = JSON.stringify(options);
    }
    this.select.value = activeRouteId ?? ''; this.select.disabled = editing || !options.length;
    // One road: nothing to switch between (a click on a road on the map selects it anyway).
    this.select.hidden = options.length < 2;
    this.build.hidden = !this.onBuild; this.build.disabled = editing;
  }
}
