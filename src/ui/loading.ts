// The loading card over the map while a mission opens: what is loading, a bar with the megabytes so far (from
// the pack's manifest sizes), then what the game is doing; on failure, why and a way to try again.
import './loading.css';
import { onPackProgress, packProgress } from '../pack-fetch';
import { megabytes } from '../packs';

export class Loading {
  readonly el: HTMLElement;
  private bar: HTMLElement;
  private line: HTMLElement;
  private stop: (() => void) | null = null;

  constructor(host: HTMLElement, title: string) {
    document.getElementById('loading')?.remove();
    this.el = document.createElement('section');
    this.el.id = 'loading';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    const head = document.createElement('div'); head.className = 'loading-kicker'; head.textContent = 'Loading the map';
    const name = document.createElement('b'); name.textContent = title;
    const track = document.createElement('div'); track.className = 'loading-track';
    this.bar = document.createElement('i'); track.append(this.bar);
    this.line = document.createElement('div'); this.line.className = 'loading-line';
    this.el.append(head, name, track, this.line);
    host.append(this.el);
    this.step('Starting…');
  }

  /** follow these downloads: "3.1 of 9.6 MB" */
  track(files: { url: string; bytes: number }[]) {
    this.stop?.();
    const total = files.reduce((n, f) => n + f.bytes, 0);
    if (!total) return;
    // what came before this card (fetched ahead on the start screen) counts too
    const done = new Map<string, number>(files.map(f => [f.url, packProgress(f.url)])), wanted = new Set(files.map(f => f.url));
    const show = () => {
      const got = [...done.values()].reduce((n, b) => n + b, 0);
      this.el.classList.remove('busy');
      this.bar.style.width = `${Math.min(100, 100 * got / total).toFixed(1)}%`;
      this.line.textContent = `${megabytes(got).replace(/ MB$/, '')} of ${megabytes(total)}`;
      if (got >= total && !performance.getEntriesByName('trapla:downloaded').length) performance.mark('trapla:downloaded');
    };
    this.stop = onPackProgress((url, bytes) => { if (wanted.has(url)) { done.set(url, bytes); show(); } });
    show();
  }

  /** a step without a measure of its progress */
  step(text: string) {
    this.stop?.(); this.stop = null;
    this.el.classList.add('busy');
    this.bar.style.width = '';
    this.line.textContent = text;
  }

  fail(message: string) {
    this.stop?.(); this.stop = null;
    this.el.classList.remove('busy'); this.el.classList.add('failed');
    this.el.setAttribute('role', 'alert');
    this.el.querySelector('.loading-kicker')!.textContent = 'The map could not be loaded';
    this.line.textContent = message;
    const again = document.createElement('button'); again.type = 'button'; again.textContent = 'Try again';
    again.onclick = () => location.reload();
    this.el.append(again);
  }

  done() { this.stop?.(); this.stop = null; this.el.remove(); }
}
