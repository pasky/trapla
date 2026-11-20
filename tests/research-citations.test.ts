// Guard: every research note a source file cites exists. Numbers come from research/NN-*.md (cited in
// src/core/data/* and in comments); a citation of a note that was renumbered or never written would send
// the reader nowhere. Some numbers name several notes (taken by agents working side by side: 15, 16, 17, 41,
// 43): those are cited by file name (research/17-stream-crossings.md), a bare research/17 is rejected. A new
// note takes the next free number when it is merged.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rolldown/parseAst';

describe('research citations', () => {
  it('every research/NN, research/NN–MM and research/<file> cited in src, scripts and tests exists and names one note', () => {
    const notes = readdirSync('research');
    const numbered = new Set(notes.map(f => /^(\d\d\d?)-/.exec(f)?.[1]).filter((n): n is string => !!n));
    const files = ['src', 'scripts', 'tests'].flatMap(dir => (readdirSync(dir, { recursive: true }) as string[])
      .filter(f => /\.(ts|mjs|mts|sh)$/.test(f) && !f.includes('fixtures/')).map(f => `${dir}/${f}`));
    /** notes per number: a number with several is no citation by itself */
    const perNumber = new Map<string, number>();
    for (const f of notes) { const n = /^(\d\d\d?)-.*\.md$/.exec(f)?.[1]; if (n) perNumber.set(n, (perNumber.get(n) ?? 0) + 1); }
    const missing: string[] = [], vague: string[] = [];
    let cited = 0;
    for (const file of files) for (const m of readFileSync(file, 'utf8').matchAll(/research\/([0-9A-Za-z_./–-]+)/g)) {
      const what = m[1].replace(/[.–-]+$/, ''); // the sentence's own full stop or dash
      if (file === 'tests/research-citations.test.ts' || /^NN\b/.test(what)) continue; // this guard, "research/NN-*.md" as a pattern
      cited++;
      const range = /^(\d\d\d?)(?:–(\d\d\d?))?$/.exec(what);
      // a number (or the two ends of a range of numbers), else a path under research/
      const ok = range ? [range[1], range[2]].every(n => n === undefined || numbered.has(n)) : existsSync(`research/${what}`);
      if (!ok) missing.push(`${file}: research/${what}`);
      for (const n of range ? [range[1], range[2]] : []) if (n !== undefined && (perNumber.get(n) ?? 0) > 1) vague.push(`${file}: research/${what}`);
    }
    expect(missing).toEqual([]);
    expect(vague).toEqual([]);
    expect(cited).toBeGreaterThan(200);
  });

  // The player never reads a research-note reference (the norm or price book is named instead): notes are
  // cited in comments only. Every string the program holds is checked, whichever text it ends up in.
  it('no string literal in src cites a research note', () => {
    const held: string[] = [];
    const walk = (node: unknown, file: string): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const child of node) walk(child, file); return; }
      const n = node as { type?: string; value?: unknown };
      const text = n.type === 'Literal' && typeof n.value === 'string' ? n.value
        : n.type === 'TemplateElement' ? (n.value as { raw: string }).raw : undefined;
      if (text?.includes('research/')) held.push(`${file}: ${text}`);
      for (const [key, child] of Object.entries(n)) if (key !== 'type') walk(child, file);
    };
    const files = (readdirSync('src', { recursive: true }) as string[]).filter(f => /\.ts$/.test(f)).map(f => `src/${f}`);
    for (const file of files) walk(parseAst(readFileSync(file, 'utf8'), { lang: 'ts' }), file);
    expect(files.length).toBeGreaterThan(100);
    expect(held).toEqual([]);
  });
});
