// Streaming elevation/clearance audit of every saved design. No mesh or Cartesian-product arrays.
// node --max-old-space-size=2048 --import tsx scripts/crossing-audit.ts [scripts/foo-design.json ...]
import { readFileSync, readdirSync } from 'node:fs';
import { auditCrossingGeometry } from '../src/core/crossings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { loadPack } from './loadpack';
import { crossingSurfaces, groundSegment } from '../src/render/crossing-surface';

const { meta, terrain, buildings, roads } = loadPack();
const ctx = { terrain, buildings, roads, scenario: D11_SCENARIO,
  a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
const args = process.argv.slice(2), strict = args.includes('--strict');
const selected = args.filter(arg => arg !== '--strict');
const files = selected.length ? selected
  : readdirSync('scripts').filter(name => name.endsWith('-design.json')).sort().map(name => `scripts/${name}`);
let failures = 0, infeasible = 0, crossings = 0;
for (const file of files) {
  const r = evaluate(ctx, JSON.parse(readFileSync(file, 'utf8')).design);
  const issues = auditCrossingGeometry(r.crossings, { ...r, width: r.cell.width,
    left: Float64Array.from(r.kind, (kind, i) => kind === KIND.earth ? r.dayL[i] : r.cell.width[i] / 2),
    right: Float64Array.from(r.kind, (kind, i) => kind === KIND.earth ? r.dayR[i] : r.cell.width[i] / 2),
  }, (x, y) => terrain.heightAt(x, y), roads);
  // Audit the same transverse sections used by the renderer and terrain mask, not just core
  // centreline metadata. Every raised non-deck edge must have a side face down to true ground.
  for (const surface of crossingSurfaces(r.crossings, (x, y) => terrain.heightAt(x, y))) {
    const report = (message: string) => { if (!issues.some(v => v.roadId === surface.crossing.roadId && v.message === message))
      issues.push({ s: surface.crossing.s, roadId: surface.crossing.roadId, message, severity: 'error' }); };
    for (let i = 0; i + 1 < surface.sections.length; i++) {
      if (!groundSegment(surface, i)) continue;
      const a = surface.sections[i], b = surface.sections[i + 1];
      for (const section of [a, b]) for (const k of [0, 1] as const) {
        const edge = section.edge[k], toe = section.toe[k];
        if (Math.abs(toe.z - terrain.heightAt(toe.x, toe.y)) > .3) report('Rendered embankment toe floats above terrain');
        if (edge.z > terrain.heightAt(edge.x, edge.y) + .5 && Math.hypot(toe.x-edge.x, toe.y-edge.y) < .1) report('Rendered raised road has no supporting side slope');
      }
      if (a.p.surface !== 'terrain' || b.p.surface !== 'terrain') continue;
      for (const t of [.25, .5, .75]) for (const k of [0, 1] as const) {
        const x = a.edge[k].x + (b.edge[k].x-a.edge[k].x)*t, y = a.edge[k].y + (b.edge[k].y-a.edge[k].y)*t;
        const z = a.edge[k].z + (b.edge[k].z-a.edge[k].z)*t;
        if (z > terrain.heightAt(x,y) + .5) report('Rendered ground-road edge floats between samples');
      }
    }
    for (const section of [surface.sections[0], surface.sections.at(-1)]) if (section) for (const edge of section.edge)
      if (Math.abs(edge.z-terrain.heightAt(edge.x,edge.y)) > .3) report('Rendered road endpoint does not meet terrain');
  }
  const errors = issues.filter(v => v.severity === 'error').length, constraints = issues.length - errors;
  crossings += r.crossings.length; failures += errors; infeasible += constraints;
  console.log(`${file}: ${r.crossings.length} crossings, ${errors} geometry errors, ${constraints} infeasible constraints (${r.valid ? 'VALID' : 'INVALID'} design)`);
  for (const v of issues) console.log(`  ${v.severity.toUpperCase()} km ${(v.s / 1000).toFixed(3)} way ${v.roadId}: ${v.message}`);
}
console.log(`${files.length} designs, ${crossings} crossings: ${failures} geometry errors, ${infeasible} blocking design constraints`);
process.exitCode = failures || (strict && infeasible) ? 1 : 0;
