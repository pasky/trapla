// First-run introduction over the map: the three basic actions (add a bend, drag it, watch the cost).
// Dismissed with "Got it" (or Esc), remembered in localStorage; "How to play" can show it again.

const KEY = 'trapla.intro.v1';

export class Intro {
  private el: HTMLElement;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'intro';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'How to start');
    this.el.innerHTML = `
      <div class="intro-h">Design the cheapest legal road from <b>A</b> to <b>B</b></div>
      <ol>
        <li><span class="ico">＋</span><div><b>Click the map</b> to add a bend to the route.</div></li>
        <li><span class="ico">✥</span><div><b>Drag a numbered bend</b> to move the route; right-click deletes it.</div></li>
        <li><span class="ico kc">Kč</span><div><b>Watch the cost</b> at the top right — it only counts when the design is <span class="ok">✓ VALID</span>.</div></li>
      </ol>
      <div class="intro-more">Below the map: the road's height profile — drag across it to select a stretch and build a bridge or tunnel. Everything can be undone (<kbd>Ctrl+Z</kbd>).</div>
      <div class="btns"><button type="button" class="primary" id="intro-ok">Got it</button></div>`;
    host.appendChild(this.el);
    this.el.querySelector<HTMLButtonElement>('#intro-ok')!.onclick = () => this.hide();
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
    this.el.hidden = seen;
  }

  get visible() { return !this.el.hidden; }

  show() { this.el.hidden = false; }

  hide() {
    this.el.hidden = true;
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
  }
}
