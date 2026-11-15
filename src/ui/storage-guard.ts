import type { ProjectStorage } from '../project-store-contract';

/** Browser storage behind one guard. While `strict` (opening/migrating a save) errors propagate, so nothing
 * is migrated on top of an unwritable store. Afterwards a failed write keeps the work in memory and
 * reports once: the player is told saving stopped instead of losing edits silently on reload. */
export class StorageGuard implements ProjectStorage {
  strict = true;
  /** a read or write failed (the reason, for the console) */
  problem: string | null = null;
  onProblem?: () => void;
  private reported = false;
  private fail(error: unknown) {
    this.problem ??= String(error);
    if (this.strict) throw error;
    if (!this.reported) { this.reported = true; this.onProblem?.(); }
  }
  getItem(key: string): string | null {
    try { return localStorage.getItem(key); } catch (error) { this.fail(error); return null; }
  }
  setItem(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch (error) { this.fail(error); }
  }
}

/** A persistent, plain notice with a download of the current design. */
export function showStorageNotice(parent: HTMLElement, design: () => unknown) {
  if (document.getElementById('storage-notice')) return;
  const box = document.createElement('div'); box.id = 'storage-notice'; box.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = 'Saving stopped: your browser storage is full or blocked. Download your design to keep it.';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Download design';
  button.onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, design: design() }, null, 1)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'trapla-design.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  box.append(text, button); parent.append(box);
}
