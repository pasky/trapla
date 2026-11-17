/** A hash of everything reachable from `v` but functions (plain objects, arrays, typed arrays, Maps, Sets,
 * numbers bit for bit), not entering the objects in `skip`: two equal hashes of one object at two times mean
 * nothing in it was written in between. */
export function stateHash(v: unknown, skip: ReadonlySet<unknown> = new Set()): string {
  const f = new Float64Array(1), w = new Uint32Array(f.buffer), seen = new Map<object, number>();
  let h1 = 0x811c9dc5, h2 = 0x9747b28c, count = 0;
  const word = (x: number) => { h1 = Math.imul(h1 ^ x, 16777619); h2 = Math.imul(h2 ^ (x + count), 0x5bd1e995) ^ (h2 >>> 13); count++; };
  const num = (x: number) => { f[0] = x; word(w[0]); word(w[1]); };
  const str = (x: string) => { word(x.length); for (let i = 0; i < x.length; i++) word(x.charCodeAt(i)); };
  const walk = (x: unknown): void => {
    if (x === null) return word(1);
    if (x === undefined) return word(2);
    if (typeof x === 'number') return num(x);
    if (typeof x === 'string') return str(x);
    if (typeof x === 'boolean') return word(x ? 3 : 4);
    if (typeof x === 'function' || typeof x === 'symbol' || typeof x === 'bigint') return word(5);
    const o = x as object;
    if (skip.has(o)) return word(6);
    const at = seen.get(o);
    if (at !== undefined) { word(7); return word(at); }
    seen.set(o, seen.size);
    if (ArrayBuffer.isView(o)) { const a = o as unknown as ArrayLike<number>; word(8); word(a.length); for (let i = 0; i < a.length; i++) num(a[i]); return; }
    if (Array.isArray(o)) { word(9); word(o.length); for (const e of o) walk(e); return; }
    if (o instanceof Map) { word(10); word(o.size); for (const [k, e] of o) { walk(k); walk(e); } return; }
    if (o instanceof Set) { word(11); word(o.size); for (const e of o) walk(e); return; }
    if (o instanceof WeakMap || o instanceof WeakSet) return word(12);
    word(13);
    for (const k of Object.keys(o)) { str(k); walk((o as Record<string, unknown>)[k]); }
  };
  walk(v);
  return `${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}:${count}`;
}
