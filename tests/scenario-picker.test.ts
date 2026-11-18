import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickerLayout, scenarioAvailable } from '../src/ui/scenario-picker';
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
  const ids = (presets: { id: string; presetId?: string }[]) => presets.map(p => p.presetId ?? p.id);
  it('one card per corridor, its sections in order and the whole route last; one mission to start with', () => {
    const fresh = pickerLayout(PRESETS, () => false);
    const d3 = fresh.cards.find(c => c.group === 'Středočeská D3')!, d35 = fresh.cards.find(c => c.group === 'D35')!;
    expect(ids(d3.presets)).toEqual(['d3-0301-motorway', 'd3-0302-motorway', 'd3-0303-motorway', 'd3-0304-motorway', 'd3-0305-motorway', 'd3-full-motorway']);
    expect(ids(d35.presets)).toEqual(['d35-stage1-motorway', 'd35-full-motorway']);
    // Trutnov: the D11 motorway (the real project) first, the class I road beside it as the simpler job
    expect(ids(fresh.cards.find(c => c.group === 'Trutnov')!.presets)).toEqual(['d11-motorway', 'd11']);
    expect(fresh.startHere?.presetId).toBe('d3-0302-motorway');
    // the mission whose real road is already in the ground comes last
    expect(fresh.cards.at(-1)!.presets[0].id).toBe('i16-nova-paka');
  });

  it('never offers a retired mission; a save of one is listed apart', () => {
    const retired = ['d3-road', 'd3-motorway', 'd35-stage1-road', 'd11-railway'];
    const offered = (saved: boolean) => pickerLayout(PRESETS, () => saved).cards.flatMap(c => ids(c.presets));
    for (const saved of [false, true]) expect(offered(saved).filter(id => retired.includes(id))).toEqual([]);
    expect(pickerLayout(PRESETS, () => false).older).toEqual([]);
    expect(ids(pickerLayout(PRESETS, () => true).older).sort()).toEqual([...retired].sort());
  });
});
