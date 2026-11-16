import { describe, expect, it } from 'vitest';
import { bendNo, setLineFrame, shownRange, shownText } from '../src/ui/chainage';

describe('a line read from its own start', () => {
  it('counts kilometres back, keeps ranges in order and swaps sides for the direction towards A', () => {
    setLineFrame(10_000, true);
    expect(shownText('Move the route at km 8.73 about 18 m to the right, or put our motorway on a bridge from km 8.71 to km 8.78'))
      .toBe('Move the route at km 1.27 about 18 m to the left, or put our motorway on a bridge from km 1.22 to km 1.29');
    expect(shownText('Bridge km 4.05–5.45')).toBe('Bridge km 4.55–5.95');
    expect(shownRange(1000, 3000)).toEqual([7000, 9000]);
    setLineFrame(10_000, true, 7);
    expect(bendNo(0)).toBe(7);
    expect(shownText('Bend 7 is too tight; widen bends 2 and 3 or bends 4–6')).toBe('Bend 1 is too tight; widen bends 5 and 6 or bends 2–4');
    setLineFrame(10_000, false);
    expect(bendNo(0)).toBe(1);
    expect(shownText('at km 8.73 to the right')).toBe('at km 8.73 to the right');
  });
});
