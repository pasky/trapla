// The About page's download list: the OpenStreetMap-derived files of every map pack on this site (the derived
// database the ODbL asks us to offer, docs/deploy.md). Files from other sources (heights, ground, protected areas,
// traffic) are not offered here.
import './ui/scenario-picker.css';
import './ui/about.css';
import { megabytes, packBase, PACKS } from './packs';

/** the pack files made from OpenStreetMap data (pipeline/build_pack.py, vectors.py, hydrology.py, transport.py) */
const OSM = new Set(['meta.json', 'overlays.json', 'vector.bin.gz', 'landcover.u8.gz', 'watercourses.json.gz', 'transport.json.gz', 'transport-meta.json']);
const list = document.getElementById('pack-list')!;
list.replaceChildren(...Object.values(PACKS).map((pack) => {
  const item = document.createElement('li');
  const name = document.createElement('b'); name.textContent = pack.name;
  const offered = Object.entries(pack.files).filter(([file]) => OSM.has(file));
  const files = offered.map(([file, size]) => {
    const a = document.createElement('a'); a.href = `${packBase(pack.id)}/${file}`; a.textContent = file; a.download = `${pack.id}-${file}`;
    const span = document.createElement('span'); span.append(a, ` (${megabytes(size.bytes)})`);
    return span;
  });
  const row = document.createElement('div'); row.className = 'about-files';
  row.append(...files.flatMap((f, i) => i ? [' · ', f] : [f]));
  item.append(name, ` — ${megabytes(offered.reduce((n, [, size]) => n + size.bytes, 0))}`, row);
  return item;
}));
if (!list.children.length) list.textContent = 'No map files on this site.';
