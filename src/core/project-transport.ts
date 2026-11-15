// Additive transport schema proposal, shared with pipeline before any pack implementation.
// Legacy overlays.net and its objectDataKey remain byte-for-byte independent of this metadata.
import type { RouteKind, SourceId, XYZ } from './project';
export interface TransportMeta { file: string; version: 1; fingerprint: string }
export interface TransportNode { id: string; xy: [number, number] }
export interface TransportTags {
  highway?: string; railway?: string; name?: string; ref?: string;
  lanes?: string;
  /** Raw OSM tags; absence means unknown. tracks is NOT the count of mapped way geometries. */
  tracks?: string; gauge?: string; electrified?: string; voltage?: string; frequency?: string;
  maxspeed?: string; oneway?: string; service?: string; usage?: string;
}
export interface TransportRenderInterval {
  /** Vector feature identity, not its transient GPU buffer index. */
  featureId: string; sourceId: SourceId; s0: number; s1: number;
  /** Centreline display width; masking retains other sources sharing the same pixels. */
  width: number;
}
interface TransportSourceBase {
  id: SourceId; osmWayId: string; kind: 'road' | 'railway';
  /** Shared OSM node identity is connectivity evidence; matching XY alone is not. */
  nodes: string[];
  /** Flat x,y array in canonical OSM orientation, one pair per node. */
  xy: number[];
  /** Horizontal cumulative metres from canonical source origin, one per node. */
  stations: number[];
  layer: number; bridge: boolean; tunnel: boolean;
  tags: TransportTags;
  legacyNetIndex?: number;
  render: TransportRenderInterval[];
  /** Optional sourced grouping, never inferred from nearby parallel polylines. */
  corridorId?: string;
  direction?: 'forward' | 'reverse';
  /** Explicit related source IDs, not an instruction to replace the neighbours. */
  parallelSourceIds?: SourceId[];
}
export type TransportSource = TransportSourceBase & (
  | { elevation: 'terrain' }
  | { elevation: 'unknown' }
  | { elevation: 'surveyed'; z: number[]; elevationEvidence: string }
);
export interface TransportGraphData {
  version: 1;
  nodes: TransportNode[];
  sources: TransportSource[];
}
/** Runtime adapter separates ground sampling from usable transport elevations. null means unknown. */
export interface TransportSurfaceQuery {
  position(sourceId: SourceId, canonicalStation: number): XYZ | null;
  permits(sourceId: SourceId, kind: RouteKind): boolean;
}
