// The About page's download list: every map pack of this site with its files (the OpenStreetMap-derived database
// the ODbL asks us to offer, docs/deploy.md).
import './ui/scenario-picker.css';
import './ui/about.css';
import { megabytes, packBase, PACKS } from './packs';

const list = document.getElementById('pack-list')!;
list.replaceChildren(...Object.values(PACKS).map((pack) => {
  const item = document.createElement('li');
  const name = document.createElement('b'); name.textContent = pack.name;
  const files = Object.entries(pack.files).map(([file, size]) => {
    const a = document.createElement('a'); a.href = `${packBase(pack.id)}/${file}`; a.textContent = file; a.download = `${pack.id}-${file}`;
    const span = document.createElement('span'); span.append(a, ` (${megabytes(size.bytes)})`);
    return span;
  });
  const row = document.createElement('div'); row.className = 'about-files';
  row.append(...files.flatMap((f, i) => i ? [' · ', f] : [f]));
  item.append(name, ` — ${megabytes(pack.totalBytes)}`, row);
  return item;
}));
if (!list.children.length) list.textContent = 'No map files on this site.';
