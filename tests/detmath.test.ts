import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as dm from '../src/core/detmath';

const bits = (h: string) => { const v = new DataView(new ArrayBuffer(8)); v.setBigUint64(0, BigInt('0x' + h)); return v.getFloat64(0); };
const golden: Record<string, [string[], string][]> = JSON.parse(readFileSync('tests/fixtures/detmath-golden.json', 'utf8'));

describe('deterministic math for billed quantities', () => {
  it('reproduces frozen output bits on every engine', () => {
    for (const [name, rows] of Object.entries(golden)) for (const [args, out] of rows) {
      const got = (dm as unknown as Record<string, (...a: number[]) => number>)[name](...args.map(bits));
      expect(Object.is(got, bits(out)), `${name}(${args.map(bits)})`).toBe(true);
    }
  });
  it('matches the native results the frozen D11 bills were captured with (fdlibm in this Node)', () => {
    // pow is excluded: Node's native ** is libm pow, which no other engine reproduces; billed pow
    // results were checked to leave every frozen bill bit-identical.
    for (const name of ['sin', 'cos', 'tan', 'atan', 'atan2', 'log10', 'log', 'exp', 'asin', 'acos'])
      for (const [args] of golden[name]) {
        const a = args.map(bits);
        expect(Object.is((dm as unknown as Record<string, (...a: number[]) => number>)[name](...a),
          (Math as unknown as Record<string, (...a: number[]) => number>)[name](...a)), `${name}(${a})`).toBe(true);
      }
  });
  it('the core calls no engine-dependent transcendental function', () => {
    for (const file of readdirSync('src/core', { recursive: true }) as string[]) {
      if (!file.endsWith('.ts') || file.endsWith('detmath.ts')) continue;
      const code = readFileSync(`src/core/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code.match(/\bMath\.(sin|cos|tan|atan2?|asin|acos|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt)\(/g), file).toBeNull();
      // ** with any exponent but 2 is libm pow (2 is exact in every engine)
      expect(code.match(/\*\*\s*(?!2\b)[\w(.]/g), file).toBeNull();
    }
  });
});
