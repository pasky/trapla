// Noise view (key N): the road's ground-floor noise footprint as a translucent band in steps over the
// limit, dwellings coloured by their noise outcome, wall height labels, a legend, and hover details.
// Everything comes from Result.noise (computed in the worker by the cost model's own calculator);
// the main thread only draws. Hover over a noise wall works with the view off too.

import * as THREE from 'three';
import { buildingLevels } from '../core/buildings';
import { BUILDING_KINDS, NOISE } from '../core/data/urban';
import type { Result } from '../core/evaluate';
import type { NoiseReceiver, WallStretch } from '../core/noise';
import type { Terrain } from '../core/terrain';
import type { Pack } from '../scenario';
import type { RouteExtras } from './extras';
import type { View } from './view';

/** building colours (sRGB) by noise outcome; walls / buyouts / demolitions match their map symbols */
export const NOISE_COLORS = { wall: 0x18b0b0, cut: 0x4f7fd6, ok: 0x6fb34f, bought: 0xc43c9b, demolished: 0xd7301f };
/** band steps, dB over the limit (ground-floor receivers), and how far below the limit it fades out */
const STEPS: [number, string][] = [[10, '#9e0142'], [5, '#e8501e'], [0, '#f8c22c']];
const FADE = { db: 6, color: '#fff4c2' };

// raw sRGB numbers: the ShaderMaterial writes them to the canvas without colour management
const glsl = (c: string) => { const k = new THREE.Color().setStyle(c, THREE.LinearSRGBColorSpace); return `vec3(${k.r.toFixed(3)}, ${k.g.toFixed(3)}, ${k.b.toFixed(3)})`; };

const fmt = (v: number, d = 1) => v.toFixed(d).replace('-', '−');
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
const km = (s: number) => `km ${(s / 1000).toFixed(2)}`;
const czk = (v: number) => `${(v / 1e6).toFixed(1)} M CZK`;

export class NoiseLayer {
  private on = false;
  private r: Result | null = null;
  private crown = 9.5;
  private band = new THREE.Group();
  private built = false;
  private legend: HTMLElement;
  private tip: HTMLElement;
  private labels: { el: HTMLElement; x: number; y: number; z: number }[] = [];
  /** engine building index → render mesh index (−1: none), filled lazily */
  private meshOf = new Map<number, number>();
  private pending: { x: number; y: number } | null = null;
  private terrain: Terrain;

  constructor(private view: View, private pack: Pack, private extras: RouteExtras, root: HTMLElement, private overlay: HTMLElement) {
    this.terrain = pack.terrain;
    this.band.name = 'noise-band';
    this.band.visible = false;
    view.world.add(this.band);
    this.legend = document.createElement('div');
    this.legend.id = 'noise-legend';
    this.legend.style.display = 'none';
    root.appendChild(this.legend);
    this.tip = document.createElement('div');
    this.tip.className = 'map-tip';
    this.tip.style.display = 'none';
    document.body.appendChild(this.tip);
    const prev = view.onRender;
    view.onRender = () => { prev?.(); this.placeLabels(); };
    const canvas = view.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) { this.hideTip(); return; }
      if (!this.pending) requestAnimationFrame(() => this.hover());
      this.pending = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerleave', () => { this.pending = null; this.hideTip(); });
    canvas.addEventListener('pointerdown', () => this.hideTip());
  }

  setOn(on: boolean) {
    this.on = on;
    this.band.visible = on;
    this.legend.style.display = on ? '' : 'none';
    if (on && !this.built) this.build();
    this.tintBuildings();
    this.buildLabels();
    if (!on) this.hideTip();
    this.view.requestRender();
  }

  setResult(r: Result, crownWidth: number) {
    this.r = r;
    this.crown = crownWidth;
    this.built = false;
    if (this.on) { this.build(); this.tintBuildings(); this.buildLabels(); }
  }

  // ---- band --------------------------------------------------------------------------------
  private build() {
    this.built = true;
    for (const c of [...this.band.children]) {
      this.band.remove(c);
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      this.view.retire(m.material as THREE.Material);
    }
    const fp = this.r?.noise?.footprint, r = this.r;
    this.paintLegend();
    if (!fp || !r) return;
    const K = fp.offsets.length, m = fp.stations.length;
    const pos = new Float32Array(m * 2 * K * 3), db = new Float32Array(m * 2 * K), idx: number[] = [];
    const v = new THREE.Vector3();
    for (let k = 0; k < m; k++) {
      const i = fp.stations[k], nx = -r.ty[i], ny = r.tx[i];
      for (let s = 0; s < 2; s++) {
        const a = fp.start[2 * k + s], sgn = s === 0 ? 1 : -1, base = (2 * k + s) * K;
        if (Number.isNaN(a)) continue;
        for (let o = 0; o < K; o++) {
          const d = a + fp.offsets[o], x = r.x[i] + nx * d * sgn, y = r.y[i] + ny * d * sgn;
          this.view.local(x, y, this.view.drape(x, y) + 1, v);
          pos.set([v.x, v.y, v.z], 3 * (base + o));
          db[base + o] = fp.excess[base + o];
        }
        if (k > 0 && !Number.isNaN(fp.start[2 * (k - 1) + s])) {
          const prev = (2 * (k - 1) + s) * K;
          for (let o = 0; o < K - 1; o++) idx.push(prev + o, base + o, prev + o + 1, base + o, base + o + 1, prev + o + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('db', new THREE.BufferAttribute(db, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const steps = STEPS.map(([t, c]) => `if (vDb >= ${t.toFixed(1)}) c = vec4(${glsl(c)}, 0.55);`).join('\n        else ');
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float db; varying float vDb;
        void main() { vDb = db; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // colour steps of the interpolated level; a dark line on the limit itself
      fragmentShader: `varying float vDb;
        void main() {
          vec4 c;
          ${steps}
          else if (vDb >= -${FADE.db.toFixed(1)}) c = vec4(${glsl(FADE.color)}, 0.5 * (1.0 + vDb / ${FADE.db.toFixed(1)}));
          else discard;
          float w = abs(vDb) / max(fwidth(vDb), 1e-4);
          if (w < 1.2) c = vec4(0.35, 0.0, 0.1, 0.9);
          gl_FragColor = c;
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 3;
    this.band.add(mesh);
    this.view.requestRender();
  }

  private paintLegend() {
    const fp = this.r?.noise?.footprint;
    const period = fp?.controlling ?? 'night', limit = fp?.limit ?? NOISE.limitNightDb;
    const sw = (c: string, extra = '') => `<i style="background:${c};${extra}"></i>`;
    const b = (c: number, label: string) => `<span>${sw(`#${c.toString(16).padStart(6, '0')}`, 'width:10px;height:10px')}${label}</span>`;
    this.legend.innerHTML = `
      <div><b>Noise</b> — ${period} L<sub>Aeq</sub> over the ${limit} dB limit, ground floor (1.5 m), walls and cuts included</div>
      <div>${STEPS.map(([t, c], k) => `<span>${sw(c)}${k ? `+${t}…+${STEPS[k - 1][0]}` : `≥ +${t}`} dB</span>`).join('')}
        <span>${sw(FADE.color, 'box-shadow:inset 0 0 0 1px #d8cf9c')}just below the limit</span><span><i class="lim"></i>limit</span></div>
      <div>Dwellings: ${b(NOISE_COLORS.wall, 'behind a wall')}${b(NOISE_COLORS.cut, 'screened by a cut')}${b(NOISE_COLORS.ok, 'within limit')}
        ${b(NOISE_COLORS.bought, 'bought out')}${b(NOISE_COLORS.demolished, 'demolished (footprint)')}${b(0xe87718, 'retained, over limit')}</div>
      <div class="hint">Top-floor façade decides walls and buyouts. Hover a building or a wall for details.</div>`;
  }

  // ---- buildings ---------------------------------------------------------------------------
  private mesh(j: number): number {
    let k = this.meshOf.get(j);
    if (k === undefined) {
      const b = this.pack.overlays.buildings[j], f = this.pack.overlays.binfo?.[j];
      k = this.view.buildingMeshes?.find(f ? f[3] : b[0], f ? f[4] : b[1]) ?? -1;
      if (k < 0 && f) k = this.view.buildingMeshes?.find(b[0], b[1]) ?? -1;
      this.meshOf.set(j, k);
    }
    return k;
  }

  private tintBuildings() {
    const bm = this.view.buildingMeshes;
    if (!bm) return;
    const colors = new Map<number, number>();
    const r = this.r;
    if (this.on && r) {
      for (const p of r.noise?.receivers ?? []) { const k = this.mesh(p.j); if (k >= 0) colors.set(k, p.unresolved ? 0xe87718 : NOISE_COLORS[p.status]); }
      for (const p of r.boughtOut) { const k = this.mesh(p.j); if (k >= 0) colors.set(k, NOISE_COLORS.bought); }
      for (const p of r.demolished) { const k = this.mesh(p.j); if (k >= 0) colors.set(k, NOISE_COLORS.demolished); }
    }
    bm.tint(colors, this.on);
    this.view.requestRender();
  }

  // ---- wall height labels (noise view) -----------------------------------------------------
  private buildLabels() {
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    const r = this.r;
    if (!this.on || !r) return;
    const off = this.crown / 2 + NOISE.wallEdgeOffset;
    for (const w of r.walls) {
      const i = Math.round((w.i0 + w.i1) / 2), sgn = w.side === 'L' ? 1 : -1;
      const el = document.createElement('div');
      el.className = 'wall-label';
      el.textContent = `${w.height} m`;
      this.overlay.appendChild(el);
      this.labels.push({ el, x: r.x[i] - r.ty[i] * off * sgn, y: r.y[i] + r.tx[i] * off * sgn, z: r.grade[i] + w.height });
    }
    this.view.requestRender();
  }

  private placeLabels() {
    for (const l of this.labels) {
      const s = this.view.project(l.x, l.y, l.z);
      l.el.style.display = s.vis && s.dist < 9000 ? '' : 'none';
      if (s.vis) l.el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
    }
  }

  // ---- hover -------------------------------------------------------------------------------
  private hideTip() { this.tip.style.display = 'none'; }

  private hover() {
    const p = this.pending;
    this.pending = null;
    if (!p || !this.r) return;
    const html = (this.on ? this.buildingTip(p.x, p.y) : null) ?? this.wallTip(this.extras.wallAt(p.x, p.y));
    if (!html) { this.hideTip(); return; }
    this.tip.innerHTML = html;
    this.tip.style.display = '';
    const w = this.tip.offsetWidth, h = this.tip.offsetHeight;
    this.tip.style.left = `${Math.min(window.innerWidth - w - 8, p.x + 16)}px`;
    this.tip.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, p.y + 16))}px`;
  }

  private wallTip(w: WallStretch | null): string | null {
    const r = this.r;
    if (!w || !r) return null;
    const n = (r.noise?.receivers ?? []).filter((p) => p.status === 'wall' && p.side === w.side && p.at >= w.i0 && p.at <= w.i1).length;
    return `<b>Noise wall ${w.height} m high</b>
      <div class="tip-sub">${w.side === 'L' ? 'left' : 'right'} of travel, ${km(w.s0)}–${(w.s1 / 1000).toFixed(2)} (${Math.round(w.s1 - w.s0)} m)</div>
      ${n ? `protects ${n} dwelling${n > 1 ? 's' : ''}; ` : ''}height = the tallest any of them needs (3 / 4 / 5 m), extended ${NOISE.margin} m past the last exposed station`;
  }

  /** building hit by the camera ray under the cursor: oriented footprint box, ground to roof */
  private buildingTip(cx: number, cy: number): string | null {
    const r = this.r!;
    const { o, d } = this.view.rayAt(cx, cy);
    const B = this.pack.overlays.buildings, info = this.pack.overlays.binfo;
    let best: { t: number; j: number; rec?: NoiseReceiver } | null = null;
    const test = (j: number, rec?: NoiseReceiver) => {
      const f = info?.[j], b = B[j];
      const x0 = f ? f[3] : b[0], y0 = f ? f[4] : b[1], hl = f ? f[5] : b[2] / Math.SQRT2, hw = f ? f[6] : b[2] / Math.SQRT2;
      const a = f ? (f[7] * Math.PI) / 180 : 0, ux = Math.cos(a), uy = Math.sin(a);
      const g = this.terrain.heightAt(x0, y0);
      const top = g + buildingLevels(f ? f[1] : 0, f ? f[2] : 0) * NOISE.storeyHeight + 1;
      const ox = o.x - x0, oy = o.y - y0;
      const lo = [ox * ux + oy * uy, -ox * uy + oy * ux, o.z], dir = [d.x * ux + d.y * uy, -d.x * uy + d.y * ux, d.z];
      const half = [[-hl - 1, hl + 1], [-hw - 1, hw + 1], [g - 3, top]];
      let t0 = 0, t1 = Infinity;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(dir[k]) < 1e-12) { if (lo[k] < half[k][0] || lo[k] > half[k][1]) return; continue; }
        let a0 = (half[k][0] - lo[k]) / dir[k], a1 = (half[k][1] - lo[k]) / dir[k];
        if (a0 > a1) [a0, a1] = [a1, a0];
        t0 = Math.max(t0, a0); t1 = Math.min(t1, a1);
        if (t0 > t1) return;
      }
      if (!best || t0 < best.t) best = { t: t0, j, rec };
    };
    for (const p of r.noise?.receivers ?? []) test(p.j, p);
    for (const p of r.demolished) test(p.j);
    for (const p of r.boughtOut) test(p.j);
    for (const p of r.kept) test(p.j);
    if (!best) return null;
    return this.describe((best as { j: number }).j, (best as { rec?: NoiseReceiver }).rec);
  }

  private describe(j: number, rec?: NoiseReceiver): string {
    const r = this.r!, fp = r.noise?.footprint, f = this.pack.overlays.binfo?.[j];
    const kind = BUILDING_KINDS[f ? f[2] : 0]?.label ?? 'building', levels = buildingLevels(f ? f[1] : 0, f ? f[2] : 0);
    const head = `<b>${kind[0].toUpperCase()}${kind.slice(1)}</b> <span class="tip-sub">${levels} storey${levels > 1 ? 's' : ''}</span>`;
    const dem = r.demolished.find((p) => p.j === j);
    if (dem) return `${head}<div class="tip-fact">In the road footprint (${km(r.s[dem.i])}): demolished, ${czk(dem.cost)}</div>`;
    const purchase = r.boughtOut.find((p) => p.j === j);
    if (purchase?.reason === 'manual') return `${head}<div class="tip-fact">Player buyout: acquired and demolished, ${czk(purchase.cost)} including the provisional plot allowance.</div>`;
    if (!rec) return head;
    const period = fp?.controlling ?? 'night', limit = fp?.limit ?? NOISE.limitNightDb;
    const lvl = (e: number) => `${fmt(limit + e)} dB (${signed(e)})`;
    const side = (s: 'L' | 'R') => (s === 'L' ? 'left' : 'right');
    const lines = [
      `<div class="tip-sub">top-floor receiver ${fmt(Math.abs(rec.h))} m ${rec.h >= 0 ? 'above' : 'below'} the road, ${Math.round(rec.d)} m from the axis (${km(r.s[rec.i])}, ${side(rec.side)})</div>`,
      `<div>${period[0].toUpperCase()}${period.slice(1)} L<sub>Aeq</sub> without mitigation: <b>${lvl(rec.raw)}</b>, limit ${limit} dB</div>`,
    ];
    if (rec.unresolved) lines.push(`<div>With actual mitigation: <b>${lvl(rec.mitigated)}</b></div><div class="tip-fact">Retained by your keep/wall decision: ${fmt(rec.unresolved.excess)} dB over the limit. Add adequate walls, change the route, or explicitly buy out this dwelling. This is a blocking violation, not an automatic purchase.</div>`);
    else if (rec.status === 'ok') lines.push('<div>Within the limit — nothing needed.</div>');
    else if (rec.status === 'cut') lines.push(`<div>With mitigation: <b>${lvl(rec.mitigated)}</b></div><div class="tip-fact">Screened by the cut edge: the road runs low enough that no wall is needed.</div>`);
    else if (rec.status === 'wall') {
      const w = r.walls.find((x) => x.side === rec.side && rec.at >= x.i0 && rec.at <= x.i1)
        ?? r.walls.find((x) => rec.at >= x.i0 && rec.at <= x.i1);
      lines.push(`<div>With mitigation: <b>${lvl(rec.mitigated)}</b></div>`,
        `<div class="tip-fact">Protected with the actual ${rec.wall} m wall${w ? ` (${km(w.s0)}–${(w.s1 / 1000).toFixed(2)})` : ''}. ${Number.isFinite(rec.need) ? `The automatic menu recommends ${rec.need} m at the binding receiver.` : 'The automatic 3–5 m menu was insufficient; the player wall now passes.'}</div>`);
    } else {
      const buy = r.boughtOut.find((p) => p.j === j);
      lines.push(`<div>Best mitigation (${NOISE.wallHeights[NOISE.wallHeights.length - 1]} m wall or cut edge): <b>${lvl(rec.mitigated)}</b></div>`,
        `<div class="tip-fact">No wall protects it (${rec.raw > NOISE.maxAttenuationDb ? `the excess is more than the ${NOISE.maxAttenuationDb} dB a wall can give` : 'the top floor sees over the wall or is too little shadowed by it'}) → bought out and demolished${buy ? `, ${czk(buy.cost)}` : ''} (${km(r.s[rec.at])}).</div>`);
    }
    return `${head}${lines.join('')}<div class="tip-sub" style="margin-top:4px">Provisional screening model, not an acoustic assessment.</div>`;
  }
}
