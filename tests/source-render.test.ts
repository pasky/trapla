import { describe, expect, it } from 'vitest';
import type { TransportGraphData, TransportRenderInterval, TransportSource } from '../src/core/project-transport';
import { buildLineGeos } from '../src/render/landcover';
import { finish } from '../src/render/slices';
import { sourceReplacementCuts } from '../src/render/source-intervals';
import type { LineLayer, VectorPack } from '../src/render/vectorPack';
import { SourcePicker } from '../src/render/source-pick';

const mapping = (sourceId: string, featureId: string, s0 = 0, s1 = 200): TransportRenderInterval => ({
  sourceId, featureId, s0, s1, width: 9, correspondence: [{ sourceS: s0, renderS: 100 - s0 / 2 }, { sourceS: s1, renderS: 100 - s1 / 2 }],
});
function source(id: string, feature: string): TransportSource {
  return { id, osmWayId: id, kind: 'road', nodes: [`${id}:a`, `${id}:b`], xy: [0, 0, 200, 0], stations: [0, 200],
    layer: 0, bridge: false, tunnel: false, tags: {}, elevation: 'terrain', render: [mapping(id, feature)] };
}
function graph(): TransportGraphData {
  return { version: 1, vectorData: 'fixture', nodes: [], sources: [source('road', 'horizontal'), source('branch', 'vertical')],
    renderFeatures: [{ id: 'horizontal', layer: 'primary', polylineIndex: 0 }, { id: 'vertical', layer: 'primary', polylineIndex: 1 }] };
}
const layer: LineLayer = { name: 'primary', verts: Float32Array.of(0, 0, 100, 0, 50, -50, 50, 50), starts: Uint32Array.of(0, 2, 4) };

describe('accepted source pavement rendering', () => {
  const vectors: VectorPack = { chunk: 2500, polys: [], lines: [layer], buildings: null };
  it('picks any mapped road in render space and keeps a coincident branch pickable after acceptance', () => {
    const picker = new SourcePicker(graph(), vectors), project = (x: number, y: number) => ({ sx: x, sy: y, vis: true });
    expect(picker.at(20, 0, 20, 0, 30, 6, project)).toMatchObject({ sourceId: 'road', s: 160 });
    picker.setAccepted([mapping('road', 'horizontal', 50, 150)]);
    expect(picker.at(50, 0, 50, 0, 30, 6, project)).toMatchObject({ sourceId: 'branch', s: 100 });
    expect(picker.at(40, 0, 40, 0, 30, 6, project)).toBeNull();
    picker.setAccepted([]);
    expect(picker.at(40, 0, 40, 0, 30, 6, project)?.sourceId).toBe('road');
  });

  it('recovers canonical chainage with perspective-correct interpolation, not screen-space station guesses', () => {
    const picker = new SourcePicker(graph(), vectors);
    const project = (x: number, y: number) => ({ sx: x / (1 + x / 100), sy: y / (1 + x / 100), vis: true, depth: 1 + x / 100 });
    const hit = picker.at(25, 0, 100 / 3, 0, 100, 2, project)!;
    expect(hit.sourceId).toBe('road'); expect(hit.x).toBeCloseTo(100 / 3); expect(hit.s).toBeCloseTo(400 / 3);
  });

  it('maps reversed canonical intervals and retains a crossing road at the same pixels', () => {
    const g = graph(), cuts = sourceReplacementCuts(g, [mapping('road', 'horizontal', 50, 150)]);
    expect([...cuts.get('primary')!]).toEqual([[0, [[25, 75]]]]);
    const geos = finish(buildLineGeos(layer, 2500, true, cuts.get('primary')));
    let branch = 0, left = 0, right = 0, artificialEnds = 0;
    for (const { geo } of geos) {
      const p = geo.getAttribute('position'), d = geo.getAttribute('dist'), dir = geo.getAttribute('dir'), index = geo.index!.array;
      for (let i = 0; i < index.length; i += 3) {
        const ids = [index[i], index[i + 1], index[i + 2]];
        if (ids.every(j => p.getX(j) === 50)) { branch++; continue; }
        expect(ids.every(j => p.getX(j) <= 25) || ids.every(j => p.getX(j) >= 75)).toBe(true);
      }
      for (let j = 0; j < p.count; j++) {
        if (p.getY(j) !== 0) continue;
        if (p.getX(j) < 25) left++; if (p.getX(j) > 75) right++;
        if (p.getX(j) === 25 || p.getX(j) === 75) {
          artificialEnds++; expect(dir.getX(j)).toBeCloseTo(0, 8); // no round cap protrudes into the owned gap
          expect(d.getX(j)).toBe(p.getX(j)); // rail/road dash phase stays at original chainage
        }
      }
      geo.dispose();
    }
    expect(branch).toBeGreaterThan(0); expect(left).toBeGreaterThan(0); expect(right).toBeGreaterThan(0); expect(artificialEnds).toBeGreaterThan(0);
    expect(sourceReplacementCuts(g, []).size).toBe(0); // cancel/undo restores untouched vectors
  });

  it.each([['road', 4.5], ['casing', 6.325], ['far-width', 20], ['rail', 1.5]] as const)(
    'clips expanded %s cap pixels at an accepted cut, not only cap centres', (_name, halfWidth) => {
      const straight: LineLayer = { name: 'primary', verts: Float32Array.of(0, 0, 100, 0), starts: Uint32Array.of(0, 2) };
      const geos = finish(buildLineGeos(straight, 2500, true, new Map([[0, [[1, 90] as const]]])));
      let clipped = 0, kept = 0;
      for (const { geo } of geos) {
        const p = geo.getAttribute('position'), dir = geo.getAttribute('dir'), a = geo.getAttribute('trim0'), b = geo.getAttribute('trim1');
        const indices = geo.index!.array;
        for (let t = 0; t < indices.length; t += 3) for (const weights of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [.2, .4, .4], [.6, .2, .2]]) {
          let x = 0, y = 0;
          const planes = [0, 0, 0, 0, 0, 0];
          for (let k = 0; k < 3; k++) {
            const i = indices[t + k], w = weights[k];
            x += w * (p.getX(i) + dir.getX(i) * halfWidth); y += w * (p.getY(i) + dir.getY(i) * halfWidth);
            planes[0] += w * a.getX(i); planes[1] += w * a.getY(i); planes[2] += w * a.getZ(i);
            planes[3] += w * b.getX(i); planes[4] += w * b.getY(i); planes[5] += w * b.getZ(i);
          }
          // The fragment shader applies these planes AFTER style width/minPx expansion.
          if (planes[0] * x + planes[1] * y + planes[2] < -.001 || planes[3] * x + planes[4] * y + planes[5] < -.001) clipped++;
          else { kept++; expect(x <= 1.001 || x >= 89.999).toBe(true); }
        }
        geo.dispose();
      }
      expect(clipped).toBeGreaterThan(0); expect(kept).toBeGreaterThan(0);
    });

  it('does not erase a shared render feature while another source still owns its interval', () => {
    const g = graph(); g.sources.push(source('other-road', 'horizontal'));
    expect(sourceReplacementCuts(g, [mapping('road', 'horizontal', 50, 150)]).size).toBe(0);
    const cuts = sourceReplacementCuts(g, [mapping('road', 'horizontal', 50, 150), mapping('other-road', 'horizontal', 100, 200)]);
    expect([...cuts.get('primary')!]).toEqual([[0, [[25, 50]]]]);
  });

  it('clips across an original vertex without leaving its join disk or deleting another layer', () => {
    const bend: LineLayer = { name: 'primary', verts: Float32Array.of(0, 0, 50, 0, 50, 50), starts: Uint32Array.of(0, 3) };
    const geos = finish(buildLineGeos(bend, 2500, true, new Map([[0, [[40, 60] as const]]])));
    for (const { geo } of geos) {
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) expect(p.getX(i) <= 40 || p.getY(i) >= 10).toBe(true);
      geo.dispose();
    }
  });
  it('the photo overlay draws only mapped polylines, with the same accepted cuts as the map', () => {
    // polyline 1 is not in the transport graph: it must not appear; polyline 0 keeps its accepted cut
    const geos = finish(buildLineGeos(layer, 2500, true, new Map([[0, [[40, 60] as const]]]), new Set([0])));
    let n = 0;
    for (const { geo } of geos) {
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) { n++; expect(p.getY(i)).toBe(0); expect(p.getX(i) <= 40 || p.getX(i) >= 60).toBe(true); }
      geo.dispose();
    }
    expect(n).toBeGreaterThan(0);
  });
});
