// Decoder for the pack's vector render data (vector.bin.gz, written by pipeline/vectors.py).
// Coordinates are local metres (x east, y north) — the same frame as the game and overlays.json.

export interface PolyLayer {
  name: string;
  /** x,y pairs */
  verts: Float32Array;
  idx: Uint32Array;
  /** [vertex offset, vertex count, index offset, index count] per spatial chunk; indices are chunk-local */
  chunks: [number, number, number, number][];
}

export interface LineLayer {
  name: string;
  verts: Float32Array;
  /** polyline k uses vertices starts[k] .. starts[k+1]-1 */
  starts: Uint32Array;
}

export interface BuildingData {
  count: number;
  /** ring vertices (counter-clockwise, not closed), x,y pairs */
  verts: Float32Array;
  starts: Uint32Array;
  /** roof triangles, ring-local vertex indices */
  tris: Uint16Array;
  triStarts: Uint32Array;
  heights: Uint8Array;
  heightScale: number;
}

export interface VectorPack {
  chunk: number;
  polys: PolyLayer[];
  lines: LineLayer[];
  buildings: BuildingData | null;
}

interface Ref { type: 'f32' | 'u32' | 'u16' | 'u8'; offset: number; length: number }

export function parseVectorPack(buf: ArrayBuffer): VectorPack {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x58565254) throw new Error('vector pack: bad magic'); // "TRVX"
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`vector pack: unsupported version ${version}`);
  const jsonLen = dv.getUint32(8, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, jsonLen)));
  const base = 12 + jsonLen;
  const arr = <T>(r: Ref): T => {
    const C = { f32: Float32Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array }[r.type];
    return new C(buf, base + r.offset, r.length) as T;
  };
  const b = h.buildings;
  return {
    chunk: h.chunk,
    polys: h.polys.map((p: { name: string; verts: Ref; idx: Ref; chunks: [number, number, number, number][] }) => (
      { name: p.name, verts: arr<Float32Array>(p.verts), idx: arr<Uint32Array>(p.idx), chunks: p.chunks })),
    lines: h.lines.map((l: { name: string; verts: Ref; starts: Ref }) => (
      { name: l.name, verts: arr<Float32Array>(l.verts), starts: arr<Uint32Array>(l.starts) })),
    buildings: b ? {
      count: b.count, heightScale: b.heightScale, verts: arr<Float32Array>(b.verts), starts: arr<Uint32Array>(b.starts),
      tris: arr<Uint16Array>(b.tris), triStarts: arr<Uint32Array>(b.triStarts), heights: arr<Uint8Array>(b.heights),
    } : null,
  };
}
