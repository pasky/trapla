// First-run introduction over the map: drag the road (it starts selected), click anything, watch the cost. Bottom left, so the
// route stays visible. Dismissed with "Got it", Esc or the first edit; remembered; Help shows it again.

const KEY = 'trapla.intro.v2';

export class Intro {
  private el: HTMLElement;

  /** `line`: what the mission builds (road / motorway / railway) */
  constructor(host: HTMLElement, line = 'road') {
    this.el = document.createElement('div');
    this.el.id = 'intro';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'How to start');
    this.el.innerHTML = `
      <div class="intro-h">Build the cheapest legal ${line} from <b>A</b> to <b>B</b></div>
      <ol>
        <li><span class="ico">✥</span><div><b>Drag the orange ${line}</b> to bend it.</div></li>
        <li><span class="ico">☝</span><div><b>Click anything</b> to see its cost and change it.</div></li>
        <li><span class="ico kc">Kč</span><div>Only a <span class="ok">✓ VALID</span> design counts.</div></li>
      </ol>
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
