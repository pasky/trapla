// Guard: every research note a source file cites exists. Numbers come from research/NN-*.md (cited in
// src/core/data/* and in comments); a citation of a note that was renumbered or never written would send
// the reader nowhere. (Some numbers name several notes, taken by agents working side by side: 15, 16, 17,
// 41, 42, 43. Citing those by file name is still to do: docs/architecture-review.md § Data.)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('research citations', () => {
  it('every research/NN, research/NN–MM and research/<file> cited in src, scripts and tests exists', () => {
    const notes = readdirSync('research');
    const numbered = new Set(notes.map(f => /^(\d\d)-/.exec(f)?.[1]).filter((n): n is string => !!n));
    const files = ['src', 'scripts', 'tests'].flatMap(dir => (readdirSync(dir, { recursive: true }) as string[])
      .filter(f => /\.(ts|mjs|mts|sh)$/.test(f) && !f.includes('fixtures/')).map(f => `${dir}/${f}`));
    const missing: string[] = [];
    let cited = 0;
    for (const file of files) for (const m of readFileSync(file, 'utf8').matchAll(/research\/([0-9A-Za-z_./–-]+)/g)) {
      const what = m[1].replace(/[.–-]+$/, ''); // the sentence's own full stop or dash
      if (file === 'tests/research-citations.test.ts' || /^NN\b/.test(what)) continue; // this guard, "research/NN-*.md" as a pattern
      cited++;
      const range = /^(\d\d)(?:–(\d\d))?$/.exec(what);
      // a number (or the two ends of a range of numbers), else a path under research/
      const ok = range ? [range[1], range[2]].every(n => n === undefined || numbered.has(n)) : existsSync(`research/${what}`);
      if (!ok) missing.push(`${file}: research/${what}`);
    }
    expect(missing).toEqual([]);
    expect(cited).toBeGreaterThan(200);
  });
});
