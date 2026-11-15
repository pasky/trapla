// Noise view (key N): the road's noise at the height that decides — the top floors of the houses beside it —
// as a translucent band, continuously shaded by the level relative to the limit (with one crisp contour on
// the limit itself); every dwelling coloured by its own worst level on the same ramp; wall height labels,
// a one-line legend and a short hover tip (the building's card has the cross-section).
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
import { NOISE_RAMP, noiseColor } from '../ui/noise-section';

/** building colours (sRGB) by noise outcome; walls / buyouts / demolitions match their map symbols */
export const NOISE_COLORS = { wall: 0x18b0b0, cut: 0x4f7fd6, ok: 0x6fb34f, bought: 0xc43c9b, demolished: 0x3d434b };
/** band colour ramp: [dB relative to the limit, colour, opacity], interpolated per pixel; transparent at the
 * first stop (where the worker's footprint fades out), clamped past the last */
const RAMP = NOISE_RAMP;
/** limit contour colour */
const LIMIT_LINE = '#590019';
/** legend tick positions, dB relative to the limit */
const TICKS = [-5, 0, 5, 10, 15];

// raw sRGB numbers: the ShaderMaterial writes them to the canvas without colour management
const glsl = (c: string) => { const k = new THREE.Color().setStyle(c, THREE.LinearSRGBColorSpace); return `vec3(${k.r.toFixed(3)}, ${k.g.toFixed(3)}, ${k.b.toFixed(3)})`; };

const fmt = (v: number, d = 1) => v.toFixed(d).replace('-', '−');


export class NoiseLayer {
  private on = false;
  private r: Result | null = null;
  private crown = 9.5;
  private band = new THREE.Group();
  private built = false;
  private legend: HTMLElement;
  private tip: HTMLElement;
  private labels: { el: HTMLElement; x: number; y: number; z: number }[] = [];
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
    const stop = (k: number) => `vec4(${glsl(RAMP[k][1])}, ${RAMP[k][2].toFixed(3)})`;
    const ramp = RAMP.slice(1).map(([t], k) => `if (d < ${t.toFixed(1)}) return mix(${stop(k)}, ${stop(k + 1)}, (d - ${RAMP[k][0].toFixed(1)}) / ${(t - RAMP[k][0]).toFixed(1)});`)
      .join('\n          ');
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float db; varying float vDb;
        void main() { vDb = db; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // continuous ramp of the per-pixel interpolated level; one anti-aliased dark line on the limit itself
      fragmentShader: `varying float vDb;
        vec4 ramp(float d) {
          ${ramp}
          return ${stop(RAMP.length - 1)};
        }
        void main() {
          if (vDb < ${RAMP[0][0].toFixed(1)}) discard;
          vec4 c = ramp(vDb);
          float w = abs(vDb) / max(fwidth(vDb), 1e-4);
          c = mix(c, vec4(${glsl(LIMIT_LINE)}, 0.9), 1.0 - smoothstep(0.7, 1.4, w));
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
    // the bar shows the ramp at its drawn opacity over the legend's white
    const lo = RAMP[0][0], hi = RAMP[RAMP.length - 1][0], at = (t: number) => ((t - lo) / (hi - lo)) * 100;
    const rgba = (c: string, a: number) => { const k = new THREE.Color().setStyle(c, THREE.LinearSRGBColorSpace); return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a})`; };
    const bar = `linear-gradient(to right, ${RAMP.map(([t, c, a]) => `${rgba(c, a)} ${at(t).toFixed(1)}%`).join(', ')})`;
    const ticks = TICKS.map((t) => `<em style="left:${at(t).toFixed(1)}%"${t === 0 ? ' class="lim"' : ''}>${t === 0 ? `${limit} limit` : `${limit + t}${t === hi ? ' dB' : ''}`}</em>`).join('');
    this.legend.innerHTML = `
      <div><b>${period[0].toUpperCase()}${period.slice(1)} noise at the top floors</b> · houses in their own colour</div>
      <div class="ramp"><div class="bar" style="background:${bar}"><u style="left:${at(0).toFixed(1)}%"></u></div><div class="ticks">${ticks}</div></div>
      <div>${b(NOISE_COLORS.bought, 'bought out')}${b(0x6fa05a, 'quiet')}</div>`;
  }

  // ---- buildings ---------------------------------------------------------------------------
  private mesh(j: number): number { return this.view.buildingMesh(j); }

  private tintBuildings() {
    const bm = this.view.buildingMeshes;
    if (!bm) return;
    const colors = new Map<number, number>();
    const r = this.r;
    if (this.on && r) {
      for (const p of r.noise?.receivers ?? []) { const k = this.mesh(p.j); if (k >= 0) colors.set(k, parseInt(noiseColor(p.mitigated).slice(1), 16)); }
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
    const html = (this.on ? this.buildingTip(p.x, p.y) : null) ?? (this.on || this.view.metresPerPixel < 3 ? this.wallTip(this.extras.wallAt(p.x, p.y)) : null);
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
    return `<b>${w.height} m wall</b> <span class="tip-sub">${w.side === 'L' ? 'left' : 'right'} · ${Math.round(w.s1 - w.s0)} m${n ? ` · protects ${n} house${n > 1 ? 's' : ''}` : ''}</span>`;
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
    const head = `<b>${kind[0].toUpperCase()}${kind.slice(1)}</b> <span class="tip-sub">${levels} floor${levels > 1 ? 's' : ''}</span>`;
    if (r.demolished.some((p) => p.j === j)) return `${head} · demolished`;
    if (r.boughtOut.some((p) => p.j === j)) return `${head} · bought out`;
    if (!rec) return head;
    const limit = fp?.limit ?? NOISE.limitNightDb, level = limit + rec.mitigated;
    return `${head}<div><b class="${rec.mitigated > 1e-6 ? 'tip-bad' : ''}">${fmt(level)} dB</b> at the top floor (limit ${limit})${rec.status === 'wall' ? ` · behind a ${rec.wall} m wall` : rec.status === 'cut' ? ' · shielded by a cut' : ''}</div><div class="tip-sub">click for the cross-section</div>`;
  }
}
