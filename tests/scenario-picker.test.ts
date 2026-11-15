import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenarioAvailable } from '../src/ui/scenario-picker';

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

  it('rejects wrong identity or unsafe file names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...meta, id: 'other' })));
    expect(await scenarioAvailable('d11')).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...meta, heights: { file: '../outside' } })));
    expect(await scenarioAvailable('d11')).toBe(false);
  });
});
