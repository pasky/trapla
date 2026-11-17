// Always-visible Undo / Redo over the top-left corner of the map (every edit — bends, road height,
// build tools — goes through the Store, so these cover all of them). Keyboard: Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y.

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

export class EditBar {
  private undoB: HTMLButtonElement;
  private redoB: HTMLButtonElement;

  /** `label`: what the step takes back / does again, in plain words ("moving bend 3"); asked only when a
   * button is pointed at (it compares two designs) */
  constructor(root: HTMLElement, onUndo: () => void, onRedo: () => void, private label: (step: 'undo' | 'redo') => string = () => 'edit') {
    root.innerHTML = `<button id="undo"><span class="ico">↶</span> Undo <kbd>${MOD}Z</kbd></button><button id="redo"><span class="ico">↷</span> Redo <kbd>${MOD}${isMac ? '⇧' : 'Shift+'}Z</kbd></button>`;
    this.undoB = root.querySelector('#undo')!;
    this.redoB = root.querySelector('#redo')!;
    // blur: a focused button would swallow the next Space / Enter
    this.undoB.onclick = () => { onUndo(); this.undoB.blur(); };
    this.redoB.onclick = () => { onRedo(); this.redoB.blur(); };
    for (const [b, step] of [[this.undoB, 'undo'], [this.redoB, 'redo']] as const) {
      const title = () => { b.title = this.title(step); };
      b.addEventListener('pointerenter', title); b.addEventListener('focus', title);
    }
  }

  private title(step: 'undo' | 'redo') {
    const b = step === 'undo' ? this.undoB : this.redoB;
    if (b.disabled) return step === 'undo' ? 'Nothing to undo' : 'Nothing to redo';
    return step === 'undo' ? `Undo: ${this.label('undo')} (${MOD}Z)` : `Redo: ${this.label('redo')} (${MOD}${isMac ? '⇧' : 'Shift+'}Z or ${MOD}Y)`;
  }

  set(undo: boolean, redo: boolean) {
    this.undoB.disabled = !undo;
    this.redoB.disabled = !redo;
    // (the label of a button pointed at now follows the step)
    for (const [b, step] of [[this.undoB, 'undo'], [this.redoB, 'redo']] as const) if (b.disabled || b.matches(':hover')) b.title = this.title(step);
  }
}
