// What the game is showing right now, in one place: the results on screen, the selection and the ends of the
// line being edited. main.ts owns
// one Session; the UI modules read it through their context interfaces. (Designs, history and saves are the
// project store's; nothing here is saved.)
import type { Result } from './core/evaluate';
import type { ProjectResult } from './core/project';
import type { Sel } from './ui/inspector';
import type { RouteSelection } from './ui/route-selection';

export interface Session {
  /** the active road's shown result: its last full one, or a drag preview while dragging */
  last: Result | null;
  /** the active road's last full result (a preview's single grade solve is priced at its material value) */
  lastFull: Result | null;
  /** the last full project result received, and the one whose 3D scene is up */
  projectFull: ProjectResult | null;
  displayedProject: ProjectResult | null;
  /** the active road's live drag price (≈), until the next full result */
  activePreviewPrice: number | null;
  /** the selection: one thing at a time, shown in the inspector, on the map and in the profile */
  sel: Sel | null;
  /** …qualified by the road it is on (kept across a switch to another road and back) */
  qualifiedSelection: RouteSelection | null;
  /** the ends the active line is edited between (a paired motorway's directions: its shared line's A and B);
   *  ui/routes.ts keeps them with the active route */
  ends: { a: { x: number; y: number }; b: { x: number; y: number } };
}

export const newSession = (ends: Session['ends']): Session => ({ last: null, lastFull: null, projectFull: null, displayedProject: null,
  activePreviewPrice: null, sel: null, qualifiedSelection: null, ends });
