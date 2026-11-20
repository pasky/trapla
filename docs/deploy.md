# Publishing Trapla as a static site

Trapla needs no server of its own: `npm run build` writes a static site to `dist/` that any web server or static
host can serve over HTTPS, at the root of a domain or under any path. (Over plain `http://` the browser withholds
what the game needs, `crypto.subtle` and `crypto.randomUUID`; such a visit gets a notice to use `https://`.
`localhost` / `127.0.0.1` are fine.) Nothing is published by this repository; choose a host
below. Before publishing, read [Licences](#licences-what-publishing-the-packs-implies): two data sources need
permission first.

## Build and check

```sh
npm run data -- <id>       # each pack you want on the site (public/scenarios/<id>/, gitignored)
scripts/release.sh         # build, check dist/, then smoke / playtest / toolbar / start screen on the built site
scripts/release.sh --serve # build, check, and serve it at http://127.0.0.1:4173/trapla/ to look at
TRAPLA_WITHOUT=ground,traffic scripts/release.sh   # a build without the two layers whose reuse is not cleared (Licences)
```

`scripts/release.sh` serves `dist/` with a plain static server (`scripts/static-serve.mjs`: no Vite, the site under
`/trapla/`, the cache headers below, JSON / JS compressed on the fly, no fallback to `index.html`) and runs the
browser checks against it, once more with `*.gz` sent as `Content-Encoding: gzip`. `scripts/release-check.mjs`
checks `dist/` itself: relative URLs only, every asset of each page present, nothing pointing at the dev server
(`/@fs`, `/@vite`, `localhost`), every ready pack in under its content hash with all its files, no file over
25 MiB, the whole under 1 GB. Any browser script runs on a build the same way: `DIST=dist node scripts/smoke.mjs`.

What is in `dist/` (2026-11-19, all 16 packs, with the four I/35 packs): 245 MB in 221 files, the largest file 13.5 MB
(`d3-full`'s heights).

| | |
|---|---|
| `index.html`, `about.html`, `404.html` | the game, *About Trapla and its data*, a plain not-found page |
| `assets/` | JS and CSS with content hashes in their names; the start screen's code (≈ 23 kB + the 11 kB pack list) loads first, the game (≈ 1.3 MB, 380 kB compressed) and its two evaluation workers while the start screen is up |
| `scenarios/<id>.<hash>/` | each ready pack (`public/scenarios/<id>/` with a `ready.json`, D11 without, and every file its `meta.json` names), its URL carrying a hash of all its files; the pipeline's own `manifest.json` stays out |
| `_headers` | the cache headers for Cloudflare Pages / Netlify (ignored elsewhere) |
| `THIRD-PARTY-NOTICES.txt` | the licence of the bundled three.js (MIT asks for its notice in every copy), linked from the About page |

How it fits a static host:

- **Any path.** Every URL in the build is relative (`base: './'`); the worker scripts are found next to their module.
  A sub-path must be opened with its trailing slash (`/trapla/`, not `/trapla`): redirect the bare one.
- **Packs by content hash.** The build lists the packs in its JS (sizes of every file, the files needed before the
  first frame, the mission ends: `virtual:trapla-packs`, `scripts/lib/packs.mjs`) and copies each into
  `scenarios/<id>.<hash>/`. A rebuilt pack gets a new URL, so packs and assets can be cached for a year as
  immutable; only the HTML pages must be revalidated (`Cache-Control: no-cache`). The start screen shows each
  mission's download size from the list; the loading card counts the megabytes against it.
- **`*.gz` files** (heights, land cover, ground, vectors, watercourses, the road graph) are gzip files. Serve them as
  plain bytes (`application/octet-stream` or `application/gzip`, no `Content-Encoding`): the game unpacks them
  itself (`DecompressionStream`). A host that sends them with `Content-Encoding: gzip` works too (the browser has
  unpacked them already; the game tells by the gzip magic bytes, and counts progress against the unpacked size).
  Do not let the server compress them again; compressing the JSON files (`overlays.json` is 0.7–4 MB) on the way
  is good.
- **No fallback page for missing files.** A host that answers a missing file with `index.html` (an SPA fallback;
  Cloudflare Pages does this when there is no `404.html`) is handled (a page in place of a pack file counts as
  missing), and `404.html` is shipped so it does not happen.
- **Nothing needs the dev server:** no `/@fs` paths, no `pipeline/cache` at run time (only `npm run data` reads
  it), no WebAssembly, no other endpoints. The workers are module workers, bundled.
- **External services:** only the aerial photo (the Photo view): ČÚZK's public ArcGIS export at
  `https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer/export`, over HTTPS, so there is no mixed content
  on an HTTPS site. It answers any origin with `Access-Control-Allow-Origin` (checked 2026-11-18 with
  `Origin: https://example.org`). It is a public viewing service without a promise of availability: when it does not
  answer, the Photo view shows the map instead. Its credit (© ČÚZK, Ortofoto ČR, CC BY 4.0) joins the map's
  credits while the photo is on.

### First load (cold, throttled)

`scripts/cold-load.mjs` (under the exclusive browser lock): no cache, 20 Mbit/s and 40 ms round trip, the page's
main thread 4× slower (the evaluation workers are not throttled: Chromium throttles the page only), real GPU; times
from navigation, the median of 2–3 runs. "map": the mission opened by its link shows its map; "playable": its first
evaluation has settled.

| build | start screen usable | the *Start here* mission by its link: map / playable | the same from *Start here* after reading the start screen for 3 s: map / playable, after the click | Trutnov → Polish border (17 MB) by its link: map / playable |
|---|---|---|---|---|
| before (main bd42ffe, served at `/`; Start here Jílové → Hostěradice, 3.9 MB) | 0.59 s | 2.91 s / 3.77 s | ≈ 2.9 s / 3.8 s (the download starts at the click) | 9.9 s / 12.8 s |
| 2026-11-18 (Jílové → Hostěradice, 3.9 MB) | 0.29 s | 2.95 s / 3.90 s | 1.28 s / 2.12 s | 9.8 s / 12.9 s |
| now (Start here Opatovec → Staré Město: 5.0 MB of pack before the first frame, 5.2 MB downloaded with the page) | 0.27 s | 3.57 s / 5.32 s | 1.47 s / 3.27 s | 9.9 s / 12.6 s |

(2026-11-18, host load ≈ 7–16; the last row 2026-11-20, host load ≈ 7–26. The D35 first section is the Start here
mission since 2026-11-20: a bigger map than the Sázava bridge, 5.0 MB against 3.9, and a 17 km line whose first price
takes ≈ 1.8 s from the map against ≈ 0.9 s; after 3 s of reading its map shows 1.5 s after the click.) A load by link is bound by the download (5.2 MB downloaded take 2.1 s at 20 Mbit/s, 17 MB
6.8 s) and then ≈ 1.5 s (5.2 MB) to ≈ 3 s (17 MB) of 4×-throttled main-thread work: unpacking and decoding the pack,
then building the 3D terrain; the first price follows ≈ 1–3 s later from the worker. What changed for a visitor: the
start screen comes up in half the time (its code is split from the game's, which loads behind it); on a first visit
the *Start here* mission's map downloads while the visitor reads the start screen (stopped if another mission is
picked), and any mission's from when the pointer reaches its Start button (at most one fetched ahead). The loading
card says what loads and how much ("1.3 of 5 MB"), then "Drawing the terrain…"; the map is drawn and can be looked
around before its first price ("Working out the cost…" over the map until then).

## Host 1: a VPS with Caddy or nginx, copied with rsync

1. Build and check: `scripts/release.sh`.
2. Copy: `deploy/rsync.sh user@host:/var/www/trapla/`. It copies the hashed assets and packs first and the pages
   last, and keeps the files of the previous deploy, so a page loaded a minute ago still finds its scripts.
   `deploy/rsync.sh user@host:/var/www/trapla/ --prune` a day later deletes what the current build does not have.
3. Serve: `deploy/Caddyfile` (Caddy gets the certificate itself) or `deploy/nginx.conf` (with certbot). Both set the
   cache headers above, compress JSON / JS / CSS / HTML, send `*.gz` as they are and answer a missing file with
   `404.html`. Under a sub-path of an existing site, see the notes at the end of each file.

## Host 2: Cloudflare Pages (or GitHub Pages)

**Live now on GitHub Pages:** <https://pasky.github.io/trapla/>, source at <https://github.com/pasky/trapla>
(MIT). Redeploy with `deploy/gh-pages.sh` (runs `scripts/release.sh`, then force-pushes a one-commit `gh-pages`
branch that also keeps the previous build's files for the 10-minute cache). Move to Cloudflare Pages if traffic or
repeat visits make the 10-minute cache hurt.

**Cloudflare Pages** fits as is: at most 25 MiB per file (the largest is 13.5 MB) and 20,000 files per site (145);
no total size listed ([limits](https://developers.cloudflare.com/pages/platform/limits/)). Upload
`dist/` directly, without git (the packs are not in the repository):

```sh
scripts/release.sh
npx wrangler pages deploy dist --project-name trapla   # after `npx wrangler login`; creates the project on first use
```

`dist/_headers` (from `deploy/_headers`) sets the year-long immutable cache on `/assets/*` and `/scenarios/*`,
`no-cache` on the pages and `application/octet-stream` on `*.gz`
([headers](https://developers.cloudflare.com/pages/configuration/headers/)). Each deploy is atomic and gets its own
preview URL. Check the headers once after the first deploy: `curl -sI https://<project>.pages.dev/scenarios/<pack>/height.i16.gz`
(no `Content-Encoding` expected; the game works either way).

**GitHub Pages** works too, with drawbacks
([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)): a site may be
1 GB (176 MB now), files under 100 MB, a soft limit of 100 GB of traffic a month (≈ 19,000 first visits of *Start
here* at 5.2 MB, ≈ 5,500 of the D11 at 18 MB). No custom headers: everything gets `max-age=600`, so for up to ten
minutes after a deploy a visitor's cached page can ask for files of the previous build. The packs are not in the
repository, so the site is pushed as a branch of its own built locally, e.g. an orphan `gh-pages` branch replaced
on each deploy, from a fresh directory outside `dist/` (Vite keeps a `.git` inside `dist/` across builds):
`rm -rf /tmp/trapla-site && cp -a dist /tmp/trapla-site && cd /tmp/trapla-site && git init -q -b gh-pages && git add -A
&& git commit -qm site && git push -f <repo-url> gh-pages`, with Pages set to serve that branch; force-pushing keeps
176 MB of packs out of the history. To keep the previous build's files for those ten minutes, copy them into the
fresh directory before committing.

Netlify reads the same `_headers`; it does not let a site set `Content-Encoding`, which Trapla does not need.

## Licences: what publishing the packs implies

The built site serves derived packs to anyone: terrain, land cover, buildings, roads and railways, streams, a
ground-class grid, protected areas and a traffic census, in the game's own formats. The About page (`about.html`,
linked from the start screen, from the map's credits and from Help) lists them; the map's credits line shows the
short form of each.

| data | where it comes from | licence | what it asks of us |
|---|---|---|---|
| terrain heights | ČÚZK DMR 5G (resampled to 5 m) | CC BY 4.0 | credit "© ČÚZK", link the licence, say it is modified: done (About, map credits) |
| aerial photo | ČÚZK Ortofoto ČR, fetched live from ČÚZK, not stored | CC BY 4.0 | credit while shown: done |
| roads, railways, buildings, land cover, streams, places, the planned lines | OpenStreetMap | ODbL 1.0 | see below |
| ground classes (25 m) | ČGS GEOČR50 and engineering-geological zoning 1:50 000, queried from ČGS map services and classified | **not settled** | see below |
| protected nature areas | AOPK ČR open data | CC BY 4.0 | credit "© AOPK ČR": done |
| listed monuments, heritage protection zones, reserves and zones (`heritage.json`) | NPÚ, Central List of Cultural Monuments (ÚSKP): geoportal.npu.cz and its open data (research/102) | CC BY 4.0 | credit "© NPÚ": done (About, map credits) |
| traffic of rebuilt roads | ŘSD national traffic census 2025 | **not stated** | see below |

**OpenStreetMap (ODbL 1.0).** The packs are a Derivative Database of OSM (OSMF
[community guidelines](https://osmfoundation.org/wiki/Licence/Community_Guidelines)), the rendered map a Produced
Work. What the ODbL asks: (§4.3) wherever the map is shown, a notice that it uses OSM data, available under the
ODbL: "© OpenStreetMap contributors" linked to openstreetmap.org/copyright
([attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)) — in the map's credits
and on the About page; (§4.4) the derived database itself is under the ODbL, whatever else is mixed in with it;
(§4.6) everyone who gets a Produced Work must be offered the derived database (or a file / method that makes the
same changes) in machine-readable form, free. The About page does this: it says the map files are available under
the ODbL and links each pack's OpenStreetMap-derived files (`meta.json`, `overlays.json`, `vector.bin.gz`,
`landcover.u8.gz`, `watercourses.json.gz`, the road graph, the mapped bridges and tunnels `structures.json`); the heights, ground, protected areas and traffic are
not offered there. For the offer to be useful the formats must be documented:
they are (README "Scenario pack format", the pipeline in `pipeline/`); if this repository stays private, publish at
least the README's format section and `pipeline/` with the site, or say on the About page where to get them. Do not
put terms on the packs that restrict their OSM part.

**ČGS (ground classes): ask before publishing.** ČGS's terms ([cgs.gov.cz/copyright](https://cgs.gov.cz/copyright))
say its published materials may be used or reproduced only with its written consent; only its downloadable INSPIRE
datasets are CC BY 4.0 ("(CC BY 4.0) Česká geologická služba", and say how it was changed). GEOČR50 and the
engineering-geological zoning were queried from map services, which is not an open licence (research/00 §6 left
this unsettled). Before the site goes public, ask ČGS in writing whether the derived 25 m ground-class grid may be
published, and with what credit. Without consent, build with `TRAPLA_WITHOUT=ground`: the packs go out without
`ground.u8.gz` and with a `meta.json` that has no `ground` (and no ČGS credit), and the game prices cuts with the
norm's 75/20/5 mix (as for packs built without geology). The bills of such a build differ from the local ones.

**ŘSD (traffic census): ask before publishing.** No licence or reuse statement was found for the CSD 2025 data
(scitanidopravy.rsd.cz, ŘSD Geoportal). Ask ŘSD for permission to publish the per-pack `traffic.json`; without it,
build with `TRAPLA_WITHOUT=traffic` (or `ground,traffic`): rebuilt roads then start with the average traffic of
their class (the game already copes with a pack that has none).

(Source for the licence points: a research pass of 2026-11-18 over the providers' pages; the ČGS and GitHub Pages
statements were re-read by hand. Not legal advice.)
