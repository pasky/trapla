// The map's top row: the brand, Undo / Redo / Scenarios on the left, the view buttons on the right. While the
// row has room they share it; where they would overlap (a 1,366–1,440 px window, or wider labels: Relief 2×,
// a photo note), first the keyboard hints go (`bars-compact`), then the view buttons move under Undo / Redo
// (`bars-stacked`, as in a narrow window: style.css). Measured, so any label or window width is covered.

/** Least gap between the two bars, px. */
const GAP = 8;

export function installToolbarFit(view: HTMLElement): () => void {
  const edit = view.querySelector<HTMLElement>('#editbar'), bar = view.querySelector<HTMLElement>('#viewbar');
  if (!edit || !bar) return () => {};
  const clash = () => {
    const a = edit.getBoundingClientRect(), b = bar.getBoundingClientRect();
    return a.width > 0 && b.width > 0 && a.top < b.bottom && b.top < a.bottom && a.right + GAP > b.left;
  };
  const fit = () => {
    view.classList.remove('bars-compact', 'bars-stacked');
    if (!clash()) return;
    view.classList.add('bars-compact');
    if (clash()) view.classList.add('bars-stacked');
  };
  let queued = 0;
  const later = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; fit(); }); };
  new ResizeObserver(later).observe(view);
  // (a label changes: Relief 1× → 2×, a button appears)
  const watch = new MutationObserver(later);
  for (const el of [edit, bar]) watch.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  fit();
  return fit;
}
