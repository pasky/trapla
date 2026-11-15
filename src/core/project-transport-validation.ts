// Validation of additive C0 transport JSON only; no topology or metadata is inferred.
// Resource limits are parser safety limits, not transport/engineering policy.
const MAX_COLLECTION = 250_000;
const MAX_ARRAY = 1_000_000;
const MAX_ENTRIES = 4_000_000;
const MAX_TEXT = 16_000_000;
const MAX_DIAGNOSTICS = 100;
const TAGS = ['highway', 'railway', 'name', 'ref', 'lanes', 'tracks', 'gauge', 'electrified',
  'voltage', 'frequency', 'maxspeed', 'oneway', 'service', 'usage', 'covered'] as const;
type RecordValue = Record<string, unknown>;

/** Returns bounded programmer/data diagnostics, never throws or mutates the input.
 * XY identity is exact. Stations tolerate 1 mm + 1e-9 of cumulative metres for numerical
 * serialization, not coordinate snapping. Layer/index existence and renderS upper bounds
 * require the vector binary and must additionally be checked by its loader. expectedVectorData
 * is the SHA256 of DECOMPRESSED vector.bin, not its gzip bytes; metadata alone cannot recompute it.
 */
export function validateTransportGraph(value: unknown, expectedVectorData: string): string[] {
  const errors: string[] = [];
  let entries = 0, text = 0;
  const stop = Symbol('validation limit');
  function fail(path: string, message: string): void {
    errors.push(`${path}: ${message}`);
    if (errors.length >= MAX_DIAGNOSTICS) throw stop;
  }
  function record(v: unknown, path: string): RecordValue | undefined {
    if (v === null || typeof v !== 'object' || Array.isArray(v)
      || (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)) {
      fail(path, 'expected object'); return;
    }
    return v as RecordValue;
  }
  function array(v: unknown, path: string, max = MAX_ARRAY): unknown[] | undefined {
    if (!Array.isArray(v)) { fail(path, 'expected array'); return; }
    entries += v.length;
    if (v.length > max || entries > MAX_ENTRIES) {
      fail(path, 'array size exceeds validation budget'); throw stop;
    }
    return v;
  }
  function string(v: unknown, path: string, max = 1024, raw = false): v is string {
    if (typeof v !== 'string' || v.length > max || (!raw && !v.trim())) {
      fail(path, `expected ${raw ? '' : 'nonempty '}string of at most ${max} characters`); return false;
    }
    text += v.length;
    if (text > MAX_TEXT) { fail(path, 'text size exceeds validation budget'); throw stop; }
    return true;
  }
  function finite(v: unknown, path: string): v is number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { fail(path, 'expected finite number'); return false; }
    return true;
  }
  function index(v: unknown, path: string): v is number {
    if (!Number.isSafeInteger(v) || (v as number) < 0) {
      fail(path, 'expected nonnegative safe integer'); return false;
    }
    return true;
  }
  function unique(v: unknown, path: string, ids: Set<string>): v is string {
    if (!string(v, path)) return false;
    if (ids.has(v)) { fail(path, 'duplicate ID'); return false; }
    ids.add(v); return true;
  }
  function numbers(v: unknown, path: string): number[] | undefined {
    const a = array(v, path);
    if (!a) return;
    let valid = true;
    for (let i = 0; i < a.length; i++) if (!finite(a[i], `${path}[${i}]`)) valid = false;
    return valid ? a as number[] : undefined;
  }
  try {
    const graph = record(value, 'transport');
    if (!graph) return errors;
    if (graph.version !== 1) fail('version', 'expected version 1');
    if (string(graph.vectorData, 'vectorData') && graph.vectorData !== expectedVectorData)
      fail('vectorData', 'vector fingerprint mismatch');
    const nodes = array(graph.nodes, 'nodes', MAX_COLLECTION);
    const sources = array(graph.sources, 'sources', MAX_COLLECTION);
    const features = array(graph.renderFeatures, 'renderFeatures', MAX_COLLECTION);
    if (!nodes || !sources || !features) return errors;

    const nodeIds = new Set<string>(), nodeXY = new Map<string, number[]>();
    for (let i = 0; i < nodes.length; i++) {
      const path = `nodes[${i}]`, node = record(nodes[i], path);
      if (!node) continue;
      const idOK = unique(node.id, `${path}.id`, nodeIds);
      const xy = numbers(node.xy, `${path}.xy`);
      if (xy && xy.length !== 2) fail(`${path}.xy`, 'expected one XY pair');
      if (idOK && xy?.length === 2) nodeXY.set(node.id as string, xy);
    }
    const featureIds = new Set<string>(), featureLocations = new Map<string, Set<number>>();
    for (let i = 0; i < features.length; i++) {
      const path = `renderFeatures[${i}]`, feature = record(features[i], path);
      if (!feature) continue;
      unique(feature.id, `${path}.id`, featureIds);
      const layerOK = string(feature.layer, `${path}.layer`);
      const indexOK = index(feature.polylineIndex, `${path}.polylineIndex`);
      if (layerOK && indexOK) {
        const layer = feature.layer as string, polylineIndex = feature.polylineIndex as number;
        let indices = featureLocations.get(layer);
        if (!indices) featureLocations.set(layer, indices = new Set());
        if (indices.has(polylineIndex)) fail(path, 'duplicate layer/polylineIndex identity');
        indices.add(polylineIndex);
      }
    }
    const sourceIds = new Set<string>();
    // Index IDs first so forward references and cycles of parallel neighbours are valid.
    const sourceRecords: (RecordValue | undefined)[] = [];
    for (let i = 0; i < sources.length; i++) {
      const source = record(sources[i], `sources[${i}]`);
      sourceRecords.push(source);
      if (source) unique(source.id, `sources[${i}].id`, sourceIds);
    }
    if (graph.unresolvedSources !== undefined) {
      const unresolved = array(graph.unresolvedSources, 'unresolvedSources', MAX_COLLECTION);
      // These IDs are never added to sourceIds or nodeIds: visibility is not usable topology.
      const unresolvedIds = new Set<string>();
      if (unresolved) for (let i = 0; i < unresolved.length; i++) {
        const path = `unresolvedSources[${i}]`, source = record(unresolved[i], path);
        if (!source) continue;
        if (unique(source.id, `${path}.id`, unresolvedIds) && sourceIds.has(source.id))
          fail(`${path}.id`, 'unresolved ID also exists in valid sources');
        string(source.osmWayId, `${path}.osmWayId`);
        if (source.kind !== 'road' && source.kind !== 'railway') fail(`${path}.kind`, 'expected road or railway');
        if (source.reason !== 'conflicting-snapshots') fail(`${path}.reason`, 'expected conflicting-snapshots');
        for (const key of ['nodes', 'xy', 'stations', 'render', 'z', 'elevation', 'elevationEvidence', 'parallelSourceIds'])
          if (source[key] !== undefined) fail(`${path}.${key}`, 'unresolved source cannot carry geometry or topology authority');
        const refs = array(source.renderFeatureIds, `${path}.renderFeatureIds`), seen = new Set<string>();
        if (refs) for (let j = 0; j < refs.length; j++) {
          const ref = refs[j], refPath = `${path}.renderFeatureIds[${j}]`;
          if (unique(ref, refPath, seen) && !featureIds.has(ref)) fail(refPath, 'unknown render feature ID');
        }
        if (source.legacyNetIndices !== undefined) {
          const indices = array(source.legacyNetIndices, `${path}.legacyNetIndices`), seenIndices = new Set<number>();
          if (indices) for (let j = 0; j < indices.length; j++) {
            const value = indices[j], indexPath = `${path}.legacyNetIndices[${j}]`;
            if (!index(value, indexPath)) continue;
            if (seenIndices.has(value)) fail(indexPath, 'duplicate legacy net index');
            seenIndices.add(value);
          }
        }
      }
    }
    for (let i = 0; i < sourceRecords.length; i++) {
      const source = sourceRecords[i], path = `sources[${i}]`;
      if (!source) continue;
      string(source.osmWayId, `${path}.osmWayId`);
      if (source.kind !== 'road' && source.kind !== 'railway') fail(`${path}.kind`, 'expected road or railway');
      if (!Number.isSafeInteger(source.layer)) fail(`${path}.layer`, 'expected safe integer');
      for (const key of ['bridge', 'tunnel'])
        if (typeof source[key] !== 'boolean') fail(`${path}.${key}`, 'expected boolean');
      if (source.legacyNetIndex !== undefined) index(source.legacyNetIndex, `${path}.legacyNetIndex`);
      if (source.corridorId !== undefined) string(source.corridorId, `${path}.corridorId`);
      if (source.direction !== undefined && source.direction !== 'forward' && source.direction !== 'reverse')
        fail(`${path}.direction`, 'expected forward or reverse');
      const tags = record(source.tags, `${path}.tags`);
      if (tags) for (const key of TAGS)
        if (tags[key] !== undefined) string(tags[key], `${path}.tags.${key}`, 4096, true);

      const refs = array(source.nodes, `${path}.nodes`);
      const xy = numbers(source.xy, `${path}.xy`), stations = numbers(source.stations, `${path}.stations`);
      if (refs && refs.length < 2) fail(`${path}.nodes`, 'expected at least two nodes');
      if (refs && xy && xy.length !== refs.length * 2) fail(`${path}.xy`, 'expected one XY pair per source node');
      if (refs && stations && stations.length !== refs.length) fail(`${path}.stations`, 'expected one station per source node');
      if (refs) for (let j = 0; j < refs.length; j++) {
        const ref = refs[j];
        if (!string(ref, `${path}.nodes[${j}]`)) continue;
        if (!nodeIds.has(ref)) fail(`${path}.nodes[${j}]`, 'unknown node ID');
        const point = nodeXY.get(ref);
        if (point && xy && (point[0] !== xy[2 * j] || point[1] !== xy[2 * j + 1]))
          fail(`${path}.xy[${2 * j}]`, 'source XY differs from referenced node');
      }
      if (stations) {
        if (stations[0] !== 0) fail(`${path}.stations`, 'canonical origin must be zero');
        let cumulative = 0;
        for (let j = 1; j < stations.length; j++) {
          if (stations[j] <= stations[j - 1]) fail(`${path}.stations[${j}]`, 'stations must strictly increase');
          if (xy && xy.length === stations.length * 2) {
            const segment = Math.hypot(xy[2 * j] - xy[2 * j - 2], xy[2 * j + 1] - xy[2 * j - 1]);
            cumulative += segment;
            if (!(segment > 0) || !Number.isFinite(cumulative))
              fail(`${path}.xy[${2 * j}]`, 'expected positive finite segment length');
            else if (Math.abs(stations[j] - cumulative) > 0.001 + 1e-9 * cumulative)
              fail(`${path}.stations[${j}]`, 'station disagrees with cumulative XY length');
          }
        }
      }
      if (source.elevation === 'terrain') {
        if (source.bridge === true || source.tunnel === true || source.layer !== 0
          || (Boolean(tags?.covered) && tags?.covered !== 'no'))
          fail(`${path}.elevation`, 'bridge/tunnel, nonzero layer or covered source cannot use terrain elevation');
      } else if (source.elevation === 'surveyed') {
        const z = numbers(source.z, `${path}.z`);
        if (refs && z && z.length !== refs.length) fail(`${path}.z`, 'expected one surveyed elevation per source node');
        string(source.elevationEvidence, `${path}.elevationEvidence`, 16_384);
      } else if (source.elevation !== 'unknown') fail(`${path}.elevation`, 'expected terrain, unknown or surveyed');
      if (source.elevation !== 'surveyed' && (source.z !== undefined || source.elevationEvidence !== undefined))
        fail(`${path}.elevation`, 'surveyed values/evidence require surveyed elevation');

      if (source.parallelSourceIds !== undefined) {
        const parallel = array(source.parallelSourceIds, `${path}.parallelSourceIds`), seen = new Set<string>();
        if (parallel) for (let j = 0; j < parallel.length; j++) {
          const ref = parallel[j], refPath = `${path}.parallelSourceIds[${j}]`;
          if (!unique(ref, refPath, seen)) continue;
          if (!sourceIds.has(ref)) fail(refPath, 'unknown source ID');
          if (ref === source.id) fail(refPath, 'parallel source cannot reference itself');
        }
      }
      const render = array(source.render, `${path}.render`);
      if (!render) continue;
      for (let j = 0; j < render.length; j++) {
        const p = `${path}.render[${j}]`, interval = record(render[j], p);
        if (!interval) continue;
        if (string(interval.featureId, `${p}.featureId`) && !featureIds.has(interval.featureId))
          fail(`${p}.featureId`, 'unknown render feature ID');
        if (string(interval.sourceId, `${p}.sourceId`) && interval.sourceId !== source.id)
          fail(`${p}.sourceId`, 'mapping must reference its containing source');
        const s0OK = finite(interval.s0, `${p}.s0`), s1OK = finite(interval.s1, `${p}.s1`);
        if (s0OK && s1OK) {
          const s0 = interval.s0 as number, s1 = interval.s1 as number;
          if (s0 < 0 || s1 <= s0 || (stations?.length && s1 > stations[stations.length - 1]))
            fail(p, 'expected increasing interval within canonical source bounds');
        }
        // Nominal display centreline/casing width, not an engineering cross-section width.
        if (finite(interval.width, `${p}.width`) && interval.width <= 0) fail(`${p}.width`, 'expected positive width');
        const knots = array(interval.correspondence, `${p}.correspondence`);
        if (!knots) continue;
        if (knots.length < 2) fail(`${p}.correspondence`, 'expected at least two correspondence knots');
        let previousSource: number | undefined, previousRender: number | undefined, direction = 0;
        for (let k = 0; k < knots.length; k++) {
          const kp = `${p}.correspondence[${k}]`, knot = record(knots[k], kp);
          if (!knot) continue;
          if (finite(knot.sourceS, `${kp}.sourceS`)) {
            if ((s0OK && knot.sourceS < (interval.s0 as number)) || (s1OK && knot.sourceS > (interval.s1 as number)))
              fail(`${kp}.sourceS`, 'knot outside source interval');
            if (previousSource !== undefined && knot.sourceS <= previousSource)
              fail(`${kp}.sourceS`, 'source knots must strictly increase');
            if ((k === 0 && knot.sourceS !== interval.s0) || (k === knots.length - 1 && knot.sourceS !== interval.s1))
              fail(`${kp}.sourceS`, 'correspondence must include exact interval endpoints');
            previousSource = knot.sourceS;
          }
          if (finite(knot.renderS, `${kp}.renderS`)) {
            if (knot.renderS < 0) fail(`${kp}.renderS`, 'expected nonnegative rendered chainage');
            if (previousRender !== undefined) {
              const step = Math.sign(knot.renderS - previousRender);
              if (step === 0 || (direction !== 0 && direction !== step))
                fail(`${kp}.renderS`, 'render knots must strictly increase or strictly decrease');
              if (direction === 0) direction = step;
            }
            previousRender = knot.renderS;
          }
        }
      }
    }
  } catch (error) {
    // JSON cannot contain hostile accessors/proxies; unknown callers still get a diagnostic.
    if (error !== stop && errors.length < MAX_DIAGNOSTICS) errors.push('transport: unable to read input data');
  }
  return errors;
}
