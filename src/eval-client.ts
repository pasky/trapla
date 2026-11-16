// The main thread's side of the evaluation workers: what is asked, in which order, and which replies
// still count. (What to DO with a result — the profile, the 3D rebuild, the score — stays with the host.)
//
// Two tiers: while a drag is in progress (uncommitted store updates) the preview worker runs the fast
// approximate evaluation of the dragged route; the full evaluation of the whole project follows once the
// drag pauses (FULL_AFTER_IDLE_MS) or ends. Each request has a rising id; a reply older than one already
// handled is dropped, and so is one the project has moved on from (core/project-protocol.ts
// acceptsProjectMessage: exact identity for full results, the current gesture's rising sequence for previews).
import type { Design } from './core/evaluate';
import type { ProjectIdentity, ProjectSnapshot, RouteId } from './core/project';
import { acceptsProjectMessage, type NoiseBandOut, type ProjectWorkerIn, type ProjectWorkerOut } from './core/project-protocol';
import type { WorkerOut } from './worker-protocol';

/** A full evaluation follows a preview once nothing has been asked for this long, ms. */
export const FULL_AFTER_IDLE_MS = 150;

/** What a request was made for: an intermediate result is shown with the design it was computed for. */
export interface EvalRequest { snapshot: ProjectSnapshot; design: Design | null; routeId: RouteId | null }

export interface EvalHost {
  /** the project, the active road's design and id, read when a request is posted and when a reply is judged */
  snapshot(): ProjectSnapshot;
  design(): Design | null;
  activeRouteId(): RouteId | null;
  /** the last full result's prices, at which a preview's single grade solve is priced */
  previewPrices(): { materialValue?: number; structureValue?: number };
  /** the project result on screen (the worker's change lists are relative to it) */
  displayed(): ProjectIdentity | null;
  /** just before / after a request leaves */
  willPost(): void;
  didPost(): void;
  /** accepted replies, newest only; `request`: what the reply's request was made for */
  preview(message: Extract<ProjectWorkerOut, { type: 'project-preview' }>, request: EvalRequest | undefined): void;
  full(message: Extract<ProjectWorkerOut, { type: 'project-result' }>): void;
  error(message: string): void;
  /** the reply to the newest noise-band request */
  band(message: NoiseBandOut): void;
}
type Port = { postMessage(message: ProjectWorkerIn): void; onmessage: ((ev: MessageEvent<WorkerOut>) => void) | null };

export class EvalClient {
  /** ids of the newest request posted and of the newest reply handled */
  posted = 0;
  received = 0;
  private inflight = new Map<number, EvalRequest>();
  private fullTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private gesture: { id: string; sequence: number; lastDisplayedSequence: number } | null = null;
  /** the newest request: a full one for this design needs no repeat when the drag ends */
  private lastPost: { full: boolean; identity: string } | null = null;
  private bandAsked = 0;

  constructor(private worker: Port, private previewWorker: Port, private host: EvalHost) {
    worker.onmessage = previewWorker.onmessage = (ev) => this.handle(ev.data);
  }

  /** the newest request is a full one and its result is in */
  get settled(): boolean { return this.received === this.posted && !this.fullTimer; }
  /** A preview window is valid for one gesture only: end it on commit / cancel, undo / redo, load, route switch. */
  endGesture(): void { this.gesture = null; }
  /** the last full result could not be shown: the next request for the same design is not a repeat */
  forgetLastPost(): void { this.lastPost = null; }

  request(preview = false): void {
    clearTimeout(this.fullTimer); this.fullTimer = 0;
    const snapshot = this.host.snapshot(), identity = `${snapshot.epoch}:${snapshot.revision}`;
    if (!preview && this.lastPost?.full && this.lastPost.identity === identity) return;
    this.host.willPost();
    this.posted++;
    this.lastPost = { full: !preview, identity };
    const routeId = this.host.activeRouteId();
    this.inflight.set(this.posted, { snapshot, design: this.host.design(), routeId });
    if (preview && !this.gesture) this.gesture = { id: crypto.randomUUID(), sequence: 0, lastDisplayedSequence: -1 };
    if (preview && routeId) {
      const prices = this.host.previewPrices();
      this.previewWorker.postMessage({ type: 'project-preview', id: this.posted, snapshot, routeId, materialValue: prices.materialValue,
        structureValue: prices.structureValue, gesture: { id: this.gesture!.id, sequence: ++this.gesture!.sequence } });
    } else this.worker.postMessage({ type: 'project-eval', id: this.posted, snapshot, displayedResult: this.host.displayed() });
    if (preview) this.fullTimer = setTimeout(() => { this.fullTimer = 0; this.request(false); }, FULL_AFTER_IDLE_MS);
    this.host.didPost();
  }

  /** The noise view's band for a route of the displayed full result (served after evaluations). */
  requestBand(identity: ProjectIdentity, routeId: RouteId, crownWidth: number): void {
    this.worker.postMessage({ type: 'noise-band', id: ++this.bandAsked, identity, routeId, crownWidth });
  }

  private handle(m: WorkerOut): void {
    if (m.type === 'ready') return;
    if (m.type === 'noise-band') { if (m.id === this.bandAsked) this.host.band(m); return; }
    const request = this.inflight.get(m.id);
    for (const k of this.inflight.keys()) if (k <= m.id) this.inflight.delete(k);
    if (m.id < this.received || !acceptsProjectMessage(this.host.snapshot(), m, this.host.activeRouteId() ?? undefined, this.gesture ?? undefined)) return;
    this.received = m.id;
    if (m.type === 'project-error') { this.host.error(m.message); return; }
    if (m.type === 'project-preview') {
      if (this.gesture && m.gesture) this.gesture.lastDisplayedSequence = m.gesture.sequence;
      this.host.preview(m, request);
      return;
    }
    this.host.full(m);
  }
}
