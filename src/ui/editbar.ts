// Always-visible Undo / Redo over the top-left corner of the map (every edit — bends, road height,
// build tools — goes through the Store, so these cover all of them). Keyboard: Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y.

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

export class EditBar {
  private undoB: HTMLButtonElement;
  private redoB: HTMLButtonElement;

  constructor(root: HTMLElement, onUndo: () => void, onRedo: () => void) {
    root.innerHTML = `<button id="undo"><span class="ico">↶</span> Undo <kbd>${MOD}Z</kbd></button><button id="redo"><span class="ico">↷</span> Redo <kbd>${MOD}${isMac ? '⇧' : 'Shift+'}Z</kbd></button>`;
    this.undoB = root.querySelector('#undo')!;
    this.redoB = root.querySelector('#redo')!;
    // blur: a focused button would swallow the next Space / Enter
    this.undoB.onclick = () => { onUndo(); this.undoB.blur(); };
    this.redoB.onclick = () => { onRedo(); this.redoB.blur(); };
  }

  set(undo: string, redo: string) {
    this.undoB.disabled = !undo;
    this.redoB.disabled = !redo;
    this.undoB.title = undo ? `Undo: ${undo} (${MOD}Z)` : 'Nothing to undo';
    this.redoB.title = redo ? `Redo: ${redo} (${MOD}${isMac ? '⇧' : 'Shift+'}Z or ${MOD}Y)` : 'Nothing to redo';
  }
}
