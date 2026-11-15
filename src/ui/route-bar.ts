import type { ProjectDesign, RouteId, RouteKind } from '../core/project';

/** Only constructed/changed project routes live here; base roads are selected directly on the map. */
export class RouteBar {
  readonly root = document.createElement('div');
  private select = document.createElement('select');
  private build = document.createElement('button');
  private choices = document.createElement('div');
  onSelect?: (id: RouteId) => void;
  onBuild?: (kind: RouteKind) => void;
  constructor(parent: HTMLElement) {
    this.root.className = 'route-bar'; this.select.setAttribute('aria-label', 'Road to edit');
    this.select.id = 'active-route';
    this.select.onchange = () => this.onSelect?.(this.select.value);
    this.build.textContent = 'Build'; this.build.type = 'button'; this.build.id = 'build-route';
    this.build.setAttribute('aria-expanded', 'false'); this.choices.className = 'route-build-choices'; this.choices.hidden = true;
    this.build.onclick = () => { this.choices.hidden = !this.choices.hidden; this.build.setAttribute('aria-expanded', String(!this.choices.hidden)); };
    for (const [kind, label] of [['road', 'Road'], ['motorway', 'Motorway'], ['railway', 'Railway']] as const) {
      const button = document.createElement('button'); button.textContent = label; button.type = 'button'; button.dataset.kind = kind;
      button.onclick = () => { this.choices.hidden = true; this.build.setAttribute('aria-expanded', 'false'); this.onBuild?.(kind); };
      this.choices.append(button);
    }
    this.root.append(this.select, this.build, this.choices); parent.append(this.root);
  }
  set(project: ProjectDesign, activeRouteId: RouteId | null, editing = false) {
    const options = project.routes.map(route => ({ id: route.id, name: route.name }));
    if (JSON.stringify(options) !== this.select.dataset.options) {
      this.select.replaceChildren(...options.map(route => { const option = document.createElement('option'); option.value = route.id; option.textContent = route.name; return option; }));
      this.select.dataset.options = JSON.stringify(options);
    }
    this.select.value = activeRouteId ?? ''; this.select.disabled = editing || !options.length;
    this.build.hidden = !this.onBuild; this.build.disabled = editing;
  }
}
