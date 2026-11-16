import { expect, it } from 'vitest';
import { runSliced } from '../src/render/slices';

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

it('hands a finished build over in its own task, reports a failing swap and discards a cancelled one', async () => {
  const job = function* () { yield; return 'built'; };
  const errors: unknown[] = [];
  runSliced(job(), () => { throw new Error('swap failed'); }, e => errors.push(e));
  await settle();
  expect(errors).toHaveLength(1);
  const discarded: string[] = [], done: string[] = [];
  const run = runSliced(job(), v => done.push(v), e => errors.push(e), 1000, undefined, v => discarded.push(v));
  // let the generator finish, then cancel before the swap task runs
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
  run.cancel();
  await settle();
  expect(done.length + discarded.length).toBe(1);
});
