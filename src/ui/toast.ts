// A short message at the bottom of the map with an optional action (e.g. "Started over. [Undo]").

let el: HTMLElement | null = null;
let timer = 0;

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
  clearTimeout(timer);
  timer = window.setTimeout(hide, ms);
}

function hide() { if (el) el.hidden = true; }
