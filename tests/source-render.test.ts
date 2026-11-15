import { describe, expect, it } from 'vitest';
import type { TransportGraphData, TransportRenderInterval, TransportSource } from '../src/core/project-transport';
import { buildLineGeos } from '../src/render/landcover';
import { finish } from '../src/render/slices';
import { sourceReplacementCuts } from '../src/render/source-intervals';
import type { LineLayer } from '../src/render/vectorPack';

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
});
