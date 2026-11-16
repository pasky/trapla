// Kilometres, sides and slopes as the player reads them on the active line: from its own start, in its
// own direction of travel. One direction of a paired motorway is evaluated and edited on its shared
// line's stations (A→B); the direction towards A starts at B, so for it they are counted back, left and
// right swap and climbs become descents. Display only: stations stay the result's.
export const lineFrame = { length: 0, reversed: false };
export function setLineFrame(length: number, reversed: boolean) { lineFrame.length = length; lineFrame.reversed = reversed; }
/** the station as shown */
export const shownS = (s: number) => lineFrame.reversed ? lineFrame.length - s : s;
/** a range as shown, from its lower kilometre */
export const shownRange = (s0: number, s1: number): [number, number] => lineFrame.reversed ? [shownS(s1), shownS(s0)] : [s0, s1];
/** a side of the A→B line as seen in the line's direction of travel */
export const shownSide = (side: 'L' | 'R'): 'L' | 'R' => lineFrame.reversed ? (side === 'L' ? 'R' : 'L') : side;
/** a grade along the line's direction of travel */
export const shownGrade = (g: number) => lineFrame.reversed ? -g : g;
/** problem texts written on the A→B stations: kilometres counted back (a "from km … to km …" range kept
 * in order), left and right swapped */
export function shownText(t: string): string {
  if (!lineFrame.reversed) return t;
  const km = (x: string) => (shownS(Number(x) * 1000) / 1000).toFixed(x.split('.')[1]?.length ?? 0);
  const done = '\u2060'; // marks a converted "km" so that it is not converted twice
  return t
    .replace(/\bkm (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?)/g, (_a, p: string, q: string) => `k${done}m ${km(q)}–${km(p)}`)
    .replace(/\bfrom km (\d+(?:\.\d+)?) to km (\d+(?:\.\d+)?)/g, (_a, p: string, q: string) => `from k${done}m ${km(q)} to k${done}m ${km(p)}`)
    .replace(/\bkm (\d+(?:\.\d+)?)/g, (_a, x: string) => `km ${km(x)}`)
    .replaceAll(done, '')
    .replace(/\b(left|right|Left|Right)\b/g, w => ({ left: 'right', right: 'left', Left: 'Right', Right: 'Left' })[w]!);
}
