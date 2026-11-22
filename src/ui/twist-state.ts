// What the twists remember per mission (ui/twists.ts, ui/twist-picker.ts): light, for the start screen too.
import { DEFAULT_TWISTS, type TwistId } from '../core/twist-words';

/** What is remembered per mission (localStorage, `trapla.twists.v1.<scenario>.<preset>`). */
export interface TwistState {
  on: TwistId[];
  /** the twist screen was answered once (else the defaults are offered) */
  chosen: boolean;
  /** curveballs arrived, in order */
  fired: string[];
  playMs: number;
  /** play time and edits when the last curveball came */
  firedAtMs: number;
  editsSince: number;
  firstValid: boolean;
  /** the reveal was shown; what it showed */
  revealed?: { cost: number; on: TwistId[]; playMs?: number };
  /** an older save's From scratch mark (the design's own `began` is the mark now): cleared once the design is replaced */
  scratch: boolean;
}
const key = (scenarioId: string, presetId: string) => `trapla.twists.v1.${scenarioId}.${presetId}`;
/** `defaults`: what a fresh start has on (data/twists.ts missionDefaults; else the default twists offered) */
export function loadTwistState(scenarioId: string, presetId: string, offer: readonly TwistId[], defaults?: readonly TwistId[]): TwistState {
  const fresh: TwistState = { on: (defaults ?? DEFAULT_TWISTS).filter(t => offer.includes(t)), chosen: false, fired: [], playMs: 0, firedAtMs: 0, editsSince: 0, firstValid: false, scratch: false };
  try {
    const raw = localStorage.getItem(key(scenarioId, presetId));
    if (!raw) return fresh;
    const s = JSON.parse(raw) as TwistState;
    // (twists never chosen follow the defaults as they are now: a twist newly offered there comes on)
    return { ...fresh, ...s, on: ((s.chosen ? s.on : null) ?? fresh.on).filter(t => offer.includes(t)), fired: Array.isArray(s.fired) ? s.fired : [] };
  } catch { return fresh; }
}
export function saveTwistState(scenarioId: string, presetId: string, s: TwistState) {
  try { localStorage.setItem(key(scenarioId, presetId), JSON.stringify(s)); } catch { /* private mode: twists for this visit only */ }
}

