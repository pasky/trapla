// Vertex and index buffers a long route's 3D rebuild fills: typed arrays grown by doubling and reused build after
// build, instead of plain arrays of doubles (a whole-D3 ribbon's dozen of them, hundreds of thousands of vertices
// each, went to the old generation and its major collections in every settle: PLAN.md "Whole D3: long tasks after
// release"). A geometry takes an exact-sized copy of what was written (`floats`, `index`); the buffers go back to
// the pool for the next build.
import * as THREE from 'three';

export class FloatBuffer {
  data: Float32Array;
  length = 0;
  constructor(size = 4096) { this.data = new Float32Array(size); }
  private grow(extra: number) {
    const next = new Float32Array(Math.max(2 * this.data.length, this.length + extra));
    next.set(this.data.subarray(0, this.length)); this.data = next;
  }
  push1(a: number) { if (this.length + 1 > this.data.length) this.grow(1); this.data[this.length++] = a; }
  push3(a: number, b: number, c: number) {
    if (this.length + 3 > this.data.length) this.grow(3);
    const d = this.data, k = this.length; d[k] = a; d[k + 1] = b; d[k + 2] = c; this.length = k + 3;
  }
  at(i: number) { return this.data[i]; }
  clear() { this.length = 0; }
  /** what was written, as a geometry attribute of its own (the buffer stays reusable) */
  attribute(itemSize: number) { return new THREE.BufferAttribute(this.data.slice(0, this.length), itemSize); }
}

export class IndexBuffer {
  data: Uint32Array;
  length = 0;
  /** the largest index written */
  max = -1;
  constructor(size = 4096) { this.data = new Uint32Array(size); }
  private grow(extra: number) {
    const next = new Uint32Array(Math.max(2 * this.data.length, this.length + extra));
    next.set(this.data.subarray(0, this.length)); this.data = next;
  }
  push(...v: number[]) { for (const x of v) this.push1(x); }
  push1(a: number) { if (this.length + 1 > this.data.length) this.grow(1); this.data[this.length++] = a; if (a > this.max) this.max = a; }
  push3(a: number, b: number, c: number) {
    if (this.length + 3 > this.data.length) this.grow(3);
    const d = this.data, k = this.length; d[k] = a; d[k + 1] = b; d[k + 2] = c; this.length = k + 3;
    if (a > this.max) this.max = a; if (b > this.max) this.max = b; if (c > this.max) this.max = c;
  }
  /** as `BufferGeometry.setIndex(array)` makes it from a plain array: 16-bit unless an index reaches 65535 */
  attribute() {
    const view = this.data.subarray(0, this.length);
    return new THREE.BufferAttribute(this.max >= 65535 ? view.slice() : Uint16Array.from(view), 1);
  }
  clear() { this.length = 0; this.max = -1; }
}

/** buffers of one kind kept between builds (a build takes its own set and gives it back when done) */
export class BufferPool<T extends { clear(): void }> {
  private free: T[] = [];
  constructor(private make: () => T) {}
  take(): T { const b = this.free.pop() ?? this.make(); b.clear(); return b; }
  give(b: T) { if (this.free.length < 4) this.free.push(b); }
}
