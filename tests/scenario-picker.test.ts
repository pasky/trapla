import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickerGroups, scenarioAvailable } from '../src/ui/scenario-picker';
import { PRESETS } from '../src/core/data/scenario';

const meta = { id: 'd11', nx: 2, ny: 2, heights: { file: 'height.i16.gz' }, landcover: { file: 'landcover.u8.gz' } };
afterEach(() => vi.unstubAllGlobals());

describe('scenario availability', () => {
  it('rejects an HTML fallback and a partial pack instead of entering the game', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>')));
    expect(await scenarioAvailable('d11')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('meta.json')
      ? Response.json(meta) : new Response(null, { status: url.endsWith('overlays.json') ? 404 : 200 })));
    expect(await scenarioAvailable('d11')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('meta.json')
      ? Response.json(meta) : new Response(null, { headers: { 'content-type': 'text/html' } })));
    expect(await scenarioAvailable('d11')).toBe(false);
  });

  it('checks optional declared data too and accepts a complete pack', async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith('meta.json')
      ? Response.json({ ...meta, ground: { file: 'ground.u8.gz' } })
      : new Response(null, { headers: { 'content-type': 'application/octet-stream' } }));
    vi.stubGlobal('fetch', fetch);
    expect(await scenarioAvailable('d11')).toBe(true);
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/ground.u8.gz'))).toBe(true);
  });

  it('does not offer a partially rebuilt new pack with old metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('meta.json')
      ? Response.json({ ...meta, id: 'd35' }) : new Response(null, { status: 404 })));
    expect(await scenarioAvailable('d35')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('meta.json')
      ? Response.json({ ...meta, id: 'd35' }) : url.endsWith('ready.json')
        ? Response.json({ id: 'd35', ready: true }) : new Response(null)));
    expect(await scenarioAvailable('d35')).toBe(true);
  });

  it('rejects wrong identity or unsafe file names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...meta, id: 'other' })));
    expect(await scenarioAvailable('d11')).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...meta, heights: { file: '../outside' } })));
    expect(await scenarioAvailable('d11')).toBe(false);
  });
});

describe('picker cards', () => {
  it('groups the D3 sections in order and offers the earlier D3 map only to continue a save', () => {
    const titles = (saved: boolean) => pickerGroups(PRESETS, () => saved).map(g => [g.group, g.presets.map(p => p.presetId ?? p.id)]);
    const fresh = titles(false), d3 = fresh.find(([group]) => group === 'Středočeská D3')!;
    expect(d3[1]).toEqual(['d3-full-motorway', 'd3-0301-motorway', 'd3-0302-motorway', 'd3-0303-motorway', 'd3-0304-motorway', 'd3-0305-motorway']);
    expect(titles(true).find(([group]) => group === 'Středočeská D3')![1]).toContain('d3-motorway');
    expect(fresh.flatMap(([, ids]) => ids)).not.toContain('d3-road');
  });
});
