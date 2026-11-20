// A short message at the bottom of the map with an optional action (e.g. "Started over. [Undo]").

let el: HTMLElement | null = null;
let timer = 0, idle = 0;
/** the countdown's tick: a tick that comes late (the page busy, e.g. building the scene after Start over) counts this much only */
const TICK = 200;

export function toast(text: string, action?: string, onAction?: () => void, ms = 6000) {
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    (document.getElementById('view') ?? document.body).appendChild(el);
  }
  const box = el;
  box.innerHTML = `<span></span>${action ? '<button type="button"></button>' : ''}<button type="button" class="x" title="Close">✕</button>`;
  box.querySelector('span')!.textContent = text;
  const act = box.querySelector<HTMLButtonElement>('button:not(.x)');
  if (act && action) { act.textContent = action; act.onclick = () => { onAction?.(); hide(); }; }
  box.querySelector<HTMLButtonElement>('.x')!.onclick = hide;
  box.hidden = false;
  countdown(ms);
}

/** The time to read it counts only while the page answers: from its next idle moment, in ticks of which a late one
 * counts as on time (a page that froze for seconds after Start over once hid the Undo before the player could reach it). */
function countdown(ms: number) {
  stop();
  let left = ms, last = 0;
  const tick = () => {
    const now = performance.now();
    left -= Math.min(now - last, TICK); last = now;
    if (left <= 0) hide(); else timer = window.setTimeout(tick, Math.min(TICK, left));
  };
  const start = () => { idle = 0; last = performance.now(); timer = window.setTimeout(tick, Math.min(TICK, left)); };
  if (window.requestIdleCallback) idle = window.requestIdleCallback(start, { timeout: ms });
  else timer = window.setTimeout(start, 0);
}
function stop() { clearTimeout(timer); timer = 0; if (idle) window.cancelIdleCallback(idle); idle = 0; }

function hide() { if (el) el.hidden = true; stop(); }

/** take the toast (and its action) away, e.g. once another edit makes its Undo mean something else;
 * with `text`, only if that is what it says (a note about something just turned off) */
export function hideToast(text?: string) { if (text === undefined || el?.querySelector('span')?.textContent === text) hide(); }
