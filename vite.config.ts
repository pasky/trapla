import { defineConfig, type Plugin } from 'vite';
import { copyFileSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
// @ts-expect-error plain ESM helper shared with scripts/release.sh's checks (no types)
import { copyPacks, describePacks } from './scripts/lib/packs.mjs';

const PACKS = resolve(import.meta.dirname, 'public/scenarios');
const VIRTUAL = 'virtual:trapla-packs', RESOLVED = '\0' + VIRTUAL;

/** The scenario packs (gitignored, 5–39 MB each): `virtual:trapla-packs` is their manifest (sizes, ends, URL). In
 *  dev the packs are served from public/scenarios/<id>/ as they are; a build copies each ready one into
 *  dist/scenarios/<id>.<content hash>/ (immutable URLs) and the rest of public/ as usual. */
function packs(): Plugin {
  let build = false, outDir = 'dist', manifest: Record<string, unknown> = {};
  return {
    name: 'trapla-packs',
    configResolved(config) { build = config.command === 'build'; outDir = resolve(config.root, config.build.outDir); },
    buildStart() { if (build) manifest = describePacks(PACKS, { hash: true }); },
    resolveId(id) { return id === VIRTUAL ? RESOLVED : null; },
    load(id) {
      if (id !== RESOLVED) return null;
      // dev: read again on every page load, so a pack built while the server runs shows up (no hashing)
      return `export default ${JSON.stringify(build ? manifest : describePacks(PACKS))};`;
    },
    // dev: a pack built while the server runs shows up on the next page load
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.headers.accept?.includes('text/html')) { const m = server.moduleGraph.getModuleById(RESOLVED); if (m) server.moduleGraph.invalidateModule(m); }
        next();
      });
    },
    writeBundle() {
      const pub = resolve(import.meta.dirname, 'public');
      if (existsSync(pub)) for (const name of readdirSync(pub)) if (name !== 'scenarios') cpSync(join(pub, name), join(outDir, name), { recursive: true });
      copyPacks(PACKS, outDir, manifest);
      // Cloudflare Pages / Netlify read their headers from the site's root (docs/deploy.md)
      copyFileSync(resolve(import.meta.dirname, 'deploy/_headers'), join(outDir, '_headers'));
    },
  };
}

export default defineConfig({
  // relative URLs: the built site works under any path of any static host (docs/deploy.md)
  base: './',
  server: { port: 5173 },
  worker: { format: 'es' },
  plugins: [packs()],
  build: {
    copyPublicDir: false, // public/scenarios goes in by content hash (above)
    rolldownOptions: { input: { index: resolve(import.meta.dirname, 'index.html'), about: resolve(import.meta.dirname, 'about.html') } },
  },
  // 30 s: the real-pack tests take 3–8 s each; under a loaded host (several agents) the 5 s default flaked
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
} as any);
