import { describe, expect, it } from 'vitest';
import type { TransportGraphData } from '../src/core/project-transport';
import { validateTransportGraph } from '../src/core/project-transport-validation';

function graph(): TransportGraphData {
  return {
    version: 1, vectorData: 'vectors-fixture',
    nodes: [
      { id: 'node-a', xy: [0, 0] }, { id: 'junction', xy: [3, 4] }, { id: 'node-c', xy: [6, 4] },
      // Same XY, different identity: a grade-separated rail crossing, NOT a junction.
      { id: 'rail-crossing', xy: [3, 4] }, { id: 'rail-end', xy: [3, 14] },
      { id: 'branch-end', xy: [3, -6] },
    ],
    renderFeatures: [
      { id: 'road-drawing', layer: 'roads', polylineIndex: 0 },
      { id: 'rail-drawing', layer: 'railways', polylineIndex: 0 },
    ],
    sources: [
      { id: 'road', osmWayId: '12345678901234567890', kind: 'road', nodes: ['node-a', 'junction', 'node-c'],
        xy: [0, 0, 3, 4, 6, 4], stations: [0, 5, 8], layer: 0, bridge: false, tunnel: false,
        elevation: 'terrain', tags: { highway: 'secondary' }, parallelSourceIds: ['branch'],
        render: [{ featureId: 'road-drawing', sourceId: 'road', s0: 1, s1: 8, width: 7,
          // A clipped source interval mapped onto a simplified, reversed render feature.
          correspondence: [{ sourceS: 1, renderS: 12 }, { sourceS: 5, renderS: 7 }, { sourceS: 8, renderS: 4 }] }] },
      { id: 'rail', osmWayId: '456', kind: 'railway', nodes: ['rail-crossing', 'rail-end'],
        xy: [3, 4, 3, 14], stations: [0, 10], layer: 1, bridge: true, tunnel: false,
        elevation: 'unknown', tags: {},
        render: [{ featureId: 'rail-drawing', sourceId: 'rail', s0: 0, s1: 10, width: 3,
          correspondence: [{ sourceS: 0, renderS: 0 }, { sourceS: 10, renderS: 9 }] }] },
      { id: 'branch', osmWayId: '789', kind: 'road', nodes: ['junction', 'branch-end'],
        xy: [3, 4, 3, -6], stations: [0, 10], layer: 0, bridge: false, tunnel: false,
        elevation: 'surveyed', z: [100, 99], elevationEvidence: 'survey fixture', tags: {}, render: [] },
    ],
  };
}

it('accepts real piecewise mappings, identity-based branches and unknown rail metadata without mutation', () => {
  const input = graph(), before = structuredClone(input);
  expect(validateTransportGraph(input, 'vectors-fixture')).toEqual([]);
  expect(input).toEqual(before);
  expect(input.sources[1].tags).toEqual({});
  expect(input.sources[1].nodes[0]).not.toBe(input.sources[0].nodes[1]);
});

it('permits raw rail tags without interpreting tracks as way count or imposing gauge/electrification policy', () => {
  const input = graph();
  input.sources[1].tags = { tracks: '2;3', gauge: '1435;1520', electrified: 'unknown', maxspeed: 'signals', voltage: '' };
  expect(validateTransportGraph(input, 'vectors-fixture')).toEqual([]);
});

it('permits explicit uncovered ground and keeps covered sources usable with unresolved or surveyed elevations', () => {
  const input = graph();
  Object.assign(input.sources[0].tags, { covered: 'no' });
  Object.assign(input.sources[1].tags, { covered: 'yes' });
  input.sources[2].layer = -1;
  input.sources[2].tunnel = true;
  expect(validateTransportGraph(input, 'vectors-fixture')).toEqual([]);
  Object.assign(input.sources[0].tags, { covered: '' });
  expect(validateTransportGraph(input, 'vectors-fixture')).toEqual([]);
});

it('allows numerical station serialization tolerance but not XY snapping or station drift', () => {
  const input = graph();
  input.sources[0].stations[1] += 0.0001;
  expect(validateTransportGraph(input, 'vectors-fixture')).toEqual([]);
  input.sources[0].stations[1] += 0.01;
  expect(validateTransportGraph(input, 'vectors-fixture').join('\n')).toContain('cumulative XY length');
  input.sources[0].stations[1] = 5;
  input.sources[0].xy[2] += 1e-10;
  expect(validateTransportGraph(input, 'vectors-fixture').join('\n')).toContain('referenced node');
});

type Mutation = [string, (g: TransportGraphData) => void, string];
const mutations: Mutation[] = [
  ['version', g => Object.assign(g, { version: 2 }), 'version'],
  ['fingerprint', g => { g.vectorData = 'other'; }, 'fingerprint mismatch'],
  ['duplicate node', g => { g.nodes[1].id = g.nodes[0].id; }, 'duplicate ID'],
  ['duplicate source', g => { g.sources[1].id = g.sources[0].id; }, 'duplicate ID'],
  ['duplicate feature', g => { g.renderFeatures[1].id = g.renderFeatures[0].id; }, 'duplicate ID'],
  ['duplicate feature location', g => { g.renderFeatures[1].layer = 'roads'; }, 'duplicate layer/polylineIndex'],
  ['empty feature layer', g => { g.renderFeatures[0].layer = ''; }, 'layer'],
  ['negative feature index', g => { g.renderFeatures[0].polylineIndex = -1; }, 'polylineIndex'],
  ['fractional feature index', g => { g.renderFeatures[0].polylineIndex = 0.5; }, 'polylineIndex'],
  ['unsafe feature index', g => { g.renderFeatures[0].polylineIndex = 2 ** 53; }, 'polylineIndex'],
  ['numeric OSM ID', g => Object.assign(g.sources[0], { osmWayId: 123 }), 'osmWayId'],
  ['invalid source kind', g => Object.assign(g.sources[0], { kind: 'tram' }), 'kind'],
  ['invalid layer', g => { g.sources[0].layer = Infinity; }, 'layer'],
  ['invalid structure flag', g => Object.assign(g.sources[0], { bridge: 'yes' }), 'bridge'],
  ['invalid raw tag', g => Object.assign(g.sources[0].tags, { lanes: 2 }), 'tags.lanes'],
  ['unknown node', g => { g.sources[0].nodes[1] = 'not-a-node'; }, 'unknown node ID'],
  ['changed node coordinates', g => { g.nodes[1].xy[0] += 1; }, 'referenced node'],
  ['nonfinite node', g => { g.nodes[0].xy[0] = NaN; }, 'finite number'],
  ['nonfinite source', g => { g.sources[0].xy[0] = Infinity; }, 'finite number'],
  ['missing source point', g => { g.sources[0].xy.pop(); }, 'one XY pair'],
  ['missing station', g => { g.sources[0].stations.pop(); }, 'one station'],
  ['nonfinite station', g => { g.sources[0].stations[1] = NaN; }, 'finite number'],
  ['station origin', g => { g.sources[0].stations[0] = 1; }, 'origin'],
  ['decreasing stations', g => { g.sources[0].stations[2] = 4; }, 'strictly increase'],
  ['station geometry disagreement', g => { g.sources[0].stations[1] = 6; }, 'cumulative XY'],
  ['zero-length segment', g => { g.sources[0].xy.splice(2, 2, 0, 0); }, 'positive finite segment'],
  ['ground bridge', g => { g.sources[0].bridge = true; }, 'cannot use terrain'],
  ['ground tunnel', g => { g.sources[0].tunnel = true; }, 'cannot use terrain'],
  ['ground nonzero layer', g => { g.sources[0].layer = -1; }, 'cannot use terrain'],
  ['ground covered source', g => Object.assign(g.sources[0].tags, { covered: 'yes' }), 'cannot use terrain'],
  ['ground uncertain covering', g => Object.assign(g.sources[0].tags, { covered: 'unknown' }), 'cannot use terrain'],
  ['unknown elevation variant', g => Object.assign(g.sources[0], { elevation: 'guessed' }), 'expected terrain'],
  ['survey without evidence', g => Object.assign(g.sources[2], { elevationEvidence: '' }), 'elevationEvidence'],
  ['survey z count', g => Object.assign(g.sources[2], { z: [100] }), 'one surveyed elevation'],
  ['survey nonfinite z', g => Object.assign(g.sources[2], { z: [100, Infinity] }), 'finite number'],
  ['hidden elevation authority', g => Object.assign(g.sources[0], { z: [100, 100, 100] }), 'require surveyed'],
  ['unknown feature ref', g => { g.sources[0].render[0].featureId = 'missing'; }, 'unknown render feature'],
  ['wrong source ref', g => { g.sources[0].render[0].sourceId = 'rail'; }, 'containing source'],
  ['source bound', g => { g.sources[0].render[0].s1 = 9; }, 'source bounds'],
  ['negative source bound', g => { g.sources[0].render[0].s0 = -1; }, 'source bounds'],
  ['reversed source interval', g => { g.sources[0].render[0].s0 = 8; }, 'source bounds'],
  ['nonfinite bound', g => { g.sources[0].render[0].s0 = NaN; }, 'finite number'],
  ['nonfinite width', g => { g.sources[0].render[0].width = Infinity; }, 'finite number'],
  ['negative width', g => { g.sources[0].render[0].width = -1; }, 'positive width'],
  ['empty knots', g => { g.sources[0].render[0].correspondence = []; }, 'at least two'],
  ['missing endpoint knot', g => { g.sources[0].render[0].correspondence[0].sourceS = 2; }, 'exact interval endpoints'],
  ['unordered source knots', g => { g.sources[0].render[0].correspondence[1].sourceS = 8; }, 'source knots must strictly increase'],
  ['out-of-bounds knot', g => { g.sources[0].render[0].correspondence[1].sourceS = 9; }, 'outside source interval'],
  ['render knot reversal', g => { g.sources[0].render[0].correspondence[1].renderS = 20; }, 'render knots must'],
  ['constant render knots', g => { g.sources[0].render[0].correspondence[1].renderS = 12; }, 'render knots must'],
  ['negative render chainage', g => { g.sources[0].render[0].correspondence[2].renderS = -1; }, 'nonnegative rendered'],
  ['nonfinite knot', g => { g.sources[0].render[0].correspondence[1].sourceS = NaN; }, 'finite number'],
  ['missing parallel ref', g => { g.sources[0].parallelSourceIds = ['missing']; }, 'unknown source ID'],
  ['parallel self ref', g => { g.sources[0].parallelSourceIds = ['road']; }, 'reference itself'],
  ['parallel duplicate ref', g => { g.sources[0].parallelSourceIds = ['rail', 'rail']; }, 'duplicate ID'],
  ['optional direction', g => Object.assign(g.sources[0], { direction: 'sideways' }), 'direction'],
  ['optional legacy index', g => { g.sources[0].legacyNetIndex = -1; }, 'legacyNetIndex'],
];
describe('malformed graph mutations', () => {
  it.each(mutations)('rejects %s', (_name, mutate, diagnostic) => {
    const input = graph();
    mutate(input);
    expect(validateTransportGraph(input, 'vectors-fixture').join('\n')).toContain(diagnostic);
  });
});

it('reports malformed structures without throwing', () => {
  const malformed: unknown[] = [null, undefined, [], 'graph', 7, {},
    { ...graph(), nodes: [null] }, { ...graph(), sources: [null] }, { ...graph(), renderFeatures: [null] },
    { ...graph(), sources: [{ ...graph().sources[0], xy: null, stations: {}, nodes: false, render: 'bad' }] },
    { ...graph(), sources: [{ ...graph().sources[0], render: [{ correspondence: [null] }] }] },
    Object.defineProperty({}, 'version', { get() { throw new Error('untrusted accessor'); } }),
  ];
  for (const value of malformed) expect(validateTransportGraph(value, 'vectors-fixture').length).toBeGreaterThan(0);
});

it('rejects oversized sparse collections before visiting entries and caps diagnostics', () => {
  const sparse = new Array(2 ** 30);
  Object.defineProperty(sparse, 0, { get() { throw new Error('must not traverse oversized input'); } });
  expect(validateTransportGraph({ ...graph(), nodes: sparse }, 'vectors-fixture').join('\n')).toContain('size exceeds');
  const errors = validateTransportGraph({ ...graph(), nodes: new Array(1000).fill(null) }, 'vectors-fixture');
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.length).toBeLessThanOrEqual(100);
});

it('validates a many-source shared-node graph with forward parallel references', () => {
  const input = graph(), template = input.sources[2];
  input.sources = Array.from({ length: 10_000 }, (_, i) => ({ ...template, id: `source-${i}`,
    parallelSourceIds: [`source-${(i + 1) % 10_000}`] }));
  expect(validateTransportGraph(input, 'vectors-fixture')).toEqual([]);
});
