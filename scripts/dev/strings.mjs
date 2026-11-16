// Every string literal and template chunk of the given files, one per line (JSON). For moves of UI code:
//   node scripts/dev/strings.mjs <old files…> | sort > a; node scripts/dev/strings.mjs <new files…> | sort > b; comm -23 a b
// must list nothing you did not mean to change (a mechanical rename once turned "Undo the last change" into
// "Undo the session.last change": tsc cannot see inside strings, the scene transcripts caught it).
import { readFileSync } from 'node:fs';
import { parseAst } from 'rolldown/parseAst';
const out = [];
const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return; }
  if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
  if (n.type === 'TemplateElement') out.push(n.value.raw);
  if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration') return;
  for (const k of Object.keys(n)) if (k !== 'type') walk(n[k]); };
for (const f of process.argv.slice(2)) walk(parseAst(readFileSync(f, 'utf8'), { lang: 'ts' }));
for (const s of out) console.log(JSON.stringify(s));
