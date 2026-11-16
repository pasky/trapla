// Keyboard: Undo / Redo, the stretch choices (A B T E), Delete on a bend, Escape. Moved out of main.ts
// verbatim. Keys are accelerators only: every action has a button.
import type { StructureKind } from '../core/overrides';
import type { BuildRoadTool } from './build-road';
import type { Sel } from './inspector';
import type { Intro } from './intro';

export interface ShortcutContext {
  readonly sel: Sel | null;
  /** a mapped road's card is open */
  readonly mappedRoadSelected: boolean;
  readonly buildTool: BuildRoadTool; readonly intro: Intro;
  /** the profile's key (legend) */
  readonly keyBox: HTMLElement;
  showKey(on: boolean): void;
  undo(): void; redo(): void;
  select(next: Sel | null): void;
  setStructure(kind: StructureKind | null, s0: number, s1: number): void;
  deletePi(i: number): void;
}

export function installShortcuts(app: ShortcutContext): void {
  // a drag (bend, height point, pin, radius grip) is applied without a history entry until it ends:
  // Undo / Redo in the middle of one would be overwritten by its final commit
  let pointerHeld = 0;
  window.addEventListener('pointerdown', () => { pointerHeld++; }, { capture: true });
  for (const t of ['pointerup', 'pointercancel'] as const) window.addEventListener(t, () => { pointerHeld = Math.max(0, pointerHeld - 1); }, { capture: true });
  window.addEventListener('blur', () => { pointerHeld = 0; });
  const undoRedo = (redo: boolean) => {
    if (pointerHeld) return;
    // a focused select / checkbox would keep the cards from redrawing with the restored design
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (redo) app.redo(); else app.undo();
  };
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    // Escape closes the base-road card even from its typed fields (nothing was changed yet)
    if (e.key === 'Escape' && (app.mappedRoadSelected || app.buildTool.active)) { e.preventDefault(); app.buildTool.cancel(false); app.select(null); return; }
    // Undo / Redo also right after choosing in a select or ticking a box; text fields keep their own undo
    const typing = t.closest('textarea, [contenteditable="true"]') || (t.matches('input') && !t.matches('[type=checkbox], [type=radio], [type=range]'));
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !typing && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      undoRedo(e.key.toLowerCase() === 'y' || e.shiftKey);
      return;
    }
    if (t.closest('input, select, textarea, [contenteditable="true"]')) return;
    const sel = app.sel;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && sel?.kind === 'stretch') {
      const key = e.key.toLowerCase(), kinds: Record<string, StructureKind | null> = { a: null, b: 1, t: 2, e: 0 };
      if (key in kinds) {
        e.preventDefault();
        if (!e.repeat) app.setStructure(kinds[key], sel.s0, sel.s1);
        return;
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'bend') app.deletePi(sel.i);
    else if (e.key === 'Escape') {
      if (app.intro.visible) app.intro.hide();
      else if (!app.keyBox.hidden) app.showKey(false);
      else app.select(null);
    }
  }, { capture: true }); // stretch shortcuts take precedence over the map's view shortcuts
}
