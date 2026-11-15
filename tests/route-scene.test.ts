import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Result } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { RouteScene } from '../src/render/route-scene';
import { RouteGroups } from '../src/render/route-groups';
import { routeMask } from '../src/render/route-mask';
import { finish } from '../src/render/slices';
import { renderView } from './fixtures/render-view';

function road(y: number, z = 4): Result {
  const f = (...v: number[]) => Float64Array.from(v);
  return { n: 3, ds: 20, s: f(0, 20, 40), x: f(0, 20, 40), y: f(y, y, y), tx: f(1, 1, 1), ty: f(0, 0, 0),
    grade: f(z, z, z), ground: f(0, 0, 0), kind: Uint8Array.of(KIND.earth, KIND.earth, KIND.earth),
    dayL: f(15, 15, 15), dayR: f(15, 15, 15), zDayL: f(0, 0, 0), zDayR: f(0, 0, 0),
    crossings: [], violations: [], runs: [], demolished: [], boughtOut: [],
    geology: { ids: new Uint8Array(3), profiles: [{ normMix: true }] },
  } as unknown as Result;
}
const input = (id: string, result: Result) => ({ id, result, crownWidth: 10 });
const ribbon = (group: THREE.Object3D) => group.getObjectByName('ribbon') as THREE.Mesh<THREE.BufferGeometry>;

describe('constructed route scene ownership', () => {
  it('keeps two engineered road bodies, masks and independent previews; retains an unchanged distant body', () => {
    const mock = renderView(), scene = new RouteScene(mock.view), a = road(0), b = road(1000, -3);
    finish(scene.build([input('a', a), input('b', b)])).commit();
    const ga = mock.groups.get('a')!, gb = mock.groups.get('b')!, rb = ribbon(gb);
    expect(ribbon(ga).geometry.getAttribute('position').count).toBeGreaterThan(20);
    expect(rb.geometry.getAttribute('position').count).toBeGreaterThan(20);
    expect(mock.drawMask).toHaveBeenCalledTimes(1);
    expect(mock.drawMask.mock.lastCall![0].map(i => i.result)).toEqual([a, b]);
    const bCentre = gb.getObjectByName('centre');
    scene.preview('a', road(10));
    expect(gb.getObjectByName('centre')).toBe(bCentre);
    expect(ribbon(ga).parent).toBe(ga); // preview does not remove the settled body
    const nextA = road(20, 6), stage = finish(scene.build([input('a', nextA), input('b', b)]));
    expect(mock.drawMask).toHaveBeenCalledTimes(1); // nothing staged leaks into the settled scene
    stage.commit();
    expect(ribbon(gb)).toBe(rb);
    expect(mock.drawMask.mock.lastCall![0].map(i => i.result)).toEqual([nextA, b]);
    finish(scene.build([input('b', b)])).commit();
    expect(mock.groups.get('a')).toBeUndefined(); expect(ribbon(gb)).toBe(rb);
    expect(mock.drawMask.mock.lastCall![0].map(i => i.result)).toEqual([b]);
    scene.dispose(); mock.dispose();
  });

  it('cancels partial builds and rejects superseded staged commits without erasing live roads', () => {
    const mock = renderView(), scene = new RouteScene(mock.view), a = road(0);
    finish(scene.build([input('a', a)])).commit();
    const live = ribbon(mock.groups.get('a')!);
    const partial = scene.build([input('b', road(1000))]);
    partial.next(); partial.next(); partial.return(undefined as never);
    expect(ribbon(mock.groups.get('a')!)).toBe(live);
    expect(mock.groups.get('b')).toBeUndefined();
    const stale = finish(scene.build([input('a', road(10))]));
    const current = finish(scene.build([input('a', road(20))]));
    stale.commit(); expect(ribbon(mock.groups.get('a')!)).toBe(live);
    current.commit(); expect(ribbon(mock.groups.get('a')!)).not.toBe(live);
    expect(mock.drawMask).toHaveBeenCalledTimes(2);
    scene.dispose(); mock.dispose();
  });

  it('restores a reverted preview even when the settled body is reused', () => {
    const mock = renderView(), scene = new RouteScene(mock.view), a = road(0);
    finish(scene.build([input('a', a)])).commit();
    const group = mock.groups.get('a')!, body = ribbon(group);
    const indicationY = () => -(group.getObjectByName('centre') as THREE.Mesh).geometry.getAttribute('position').getZ(0);
    scene.preview('a', road(10)); expect(indicationY()).toBe(10);
    finish(scene.build([input('a', a)])).commit();
    expect(ribbon(group)).toBe(body); expect(indicationY()).toBeCloseTo(0);
    scene.dispose(); mock.dispose();
  });

  it('keeps overlapping main-road collars on one shared ground surface above coarse terrain', () => {
    const mock = renderView(), scene = new RouteScene(mock.view);
    mock.view.drape = () => 5;
    finish(scene.build([input('a', road(0)), input('b', road(50))])).commit();
    for (const id of ['a', 'b']) {
      const heights: number[] = [];
      mock.groups.get(id)!.traverse(o => {
        if (o.name !== 'daylight-ground') return;
        const p = (o as THREE.Mesh).geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - 20) < .01 && Math.abs(p.getZ(i) + 20) < .01) heights.push(p.getY(i));
      });
      expect(heights.length).toBeGreaterThan(0);
      for (const z of heights) expect(z).toBeCloseTo(.015, 5);
    }
    scene.dispose(); mock.dispose();
  });

  it('returns asymmetric and tapered collars to coarse terrain at their actual outer edge', () => {
    const mock = renderView(), scene = new RouteScene(mock.view), r = road(0);
    mock.view.drape = () => 5;
    r.dayL.set([40, 30, 15]); r.dayR.set([15, 12, 10]);
    finish(scene.build([input('a', r)])).commit();
    const heights: number[] = [];
    mock.groups.get('a')!.traverse(o => {
      if (o.name !== 'daylight-ground') return;
      const p = (o as THREE.Mesh).geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - 20) < .01 && Math.abs(p.getZ(i) - 32) < .01) heights.push(p.getY(i));
    });
    expect(heights.length).toBeGreaterThan(0);
    for (const z of heights) expect(z).toBeCloseTo(5.015, 5);
    scene.dispose(); mock.dispose();
  });

  it('unions only actual ground footprints and removes deleted-route masks, including the empty scene', () => {
    const a = road(0), b = road(1000); b.kind.fill(KIND.bridge);
    const first = routeMask([{ result: a, surfaces: [] }], 0, 0, () => 0);
    const both = routeMask([{ result: a, surfaces: [] }, { result: road(1000), surfaces: [] }], 0, 0, () => 0);
    expect(both.terrain.length).toBe(first.terrain.length * 2);
    expect(both.original.length).toBe(first.original.length * 2);
    expect(both.box!.minZ).toBeLessThan(-1000);
    expect(routeMask([{ result: a, surfaces: [] }, { result: b, surfaces: [] }], 0, 0, () => 0).terrain).toEqual(first.terrain);
    expect(routeMask([], 0, 0, () => 0)).toEqual({ terrain: [], original: [], cuts: [], box: null });
  });

  it('disposes private geometry/materials exactly once but never disposes shared materials', () => {
    const world = new THREE.Group(), shared = new THREE.MeshBasicMaterial(), privateMat = new THREE.MeshBasicMaterial();
    const sharedDispose = vi.spyOn(shared, 'dispose'), privateDispose = vi.spyOn(privateMat, 'dispose');
    const geometry = new THREE.BufferGeometry(), geometryDispose = vi.spyOn(geometry, 'dispose');
    const groups = new RouteGroups(world, () => new Set([shared]), m => m.dispose());
    const nested = new THREE.Group(); nested.add(new THREE.Mesh(geometry, shared), new THREE.Mesh(geometry, privateMat));
    const cancelled = groups.stage('a', [nested]); cancelled.dispose(); cancelled.dispose(); cancelled.commit();
    expect(groups.get('a')).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalledTimes(1); expect(privateDispose).toHaveBeenCalledTimes(1);
    expect(sharedDispose).not.toHaveBeenCalled(); shared.dispose();
  });
});
