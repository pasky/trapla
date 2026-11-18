// The scenario packs this site has (the build's manifest, scripts/lib/packs.mjs via vite.config.ts): where each
// lives, its files' sizes and the mission ends, for the start screen and the loading card. Browser only (the
// manifest is a Vite virtual module).
import manifest from 'virtual:trapla-packs';
import { prefetchPackFile, type PackFileSize } from './pack-fetch';

export interface PackInfo {
  id: string; name: string;
  /** relative to the site's base: scenarios/<id> in dev, scenarios/<id>.<content hash> in a build */
  dir: string;
  files: Record<string, PackFileSize>;
  /** what the game loads before its first frame, and its total size on disk */
  startup: string[]; startupBytes: number; totalBytes: number;
  a: [number, number] | null; b: [number, number] | null; officialM: number | null;
}

export const PACKS: Record<string, PackInfo> = manifest;

/** the pack's URL prefix (no trailing slash) */
export const packBase = (id: string) => `${import.meta.env.BASE_URL}${PACKS[id]?.dir ?? `scenarios/${id}`}`;

/** start downloading what the game needs of the pack before its first frame; returns those files' URLs and sizes */
export function prefetchPack(id: string): { url: string; bytes: number }[] {
  const pack = PACKS[id];
  if (!pack) return [];
  return pack.startup.map((file) => {
    const url = `${packBase(id)}/${file}`;
    prefetchPackFile(url, pack.files[file]);
    return { url, bytes: pack.files[file].bytes };
  });
}

/** "5 MB" (one decimal under 10 MB) */
export function megabytes(bytes: number): string {
  const mb = bytes / 1e6;
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : Math.round(mb)} MB`;
}
