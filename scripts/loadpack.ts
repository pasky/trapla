// Node-side loader for the scenario pack (bench + sanity scripts).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { BuildingIndex } from '../src/core/buildings';
import { decodeHeights, Terrain } from '../src/core/terrain';

export function loadPack(dir = 'public/scenarios/d11') {
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8'));
  const hb = gunzipSync(readFileSync(`${dir}/${meta.heights.file}`));
  const delta = new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2);
  const q = decodeHeights(delta, meta.nx, meta.ny);
  const lc = new Uint8Array(gunzipSync(readFileSync(`${dir}/${meta.landcover.file}`)));
  const terrain = new Terrain({ nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale, q, lc });
  const ov = JSON.parse(readFileSync(`${dir}/overlays.json`, 'utf8'));
  return { meta, terrain, overlays: ov, buildings: new BuildingIndex(ov.buildings) };
}
