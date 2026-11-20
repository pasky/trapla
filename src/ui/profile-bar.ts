// The buttons over the profile: its key (legend) and the zoom buttons. Moved out of main.ts verbatim.
import type { ProfilePanel } from './profile';

const GROUND_BAND = 'trapla.ground-band';

export function installProfileBar(profile: ProfilePanel) {
  // ---- the profile's key (legend) ----
  const keyB = document.getElementById('key-toggle')!, keyBox = document.getElementById('profile-key')!;
  const showKey = (on: boolean) => { keyBox.hidden = !on; keyB.setAttribute('aria-expanded', String(on)); keyB.classList.toggle('on', on); if (on) profile.groundKey(); };
  keyB.onclick = () => showKey(!keyB.classList.contains('on'));
  document.addEventListener('pointerdown', (e) => { if (!keyBox.hidden && !keyBox.contains(e.target as Node) && e.target !== keyB) showKey(false); });
  // the mapped ground's band under the ground line: off unless the player turned it on (remembered)
  const band = document.getElementById('ground-band') as HTMLInputElement | null;
  if (band) {
    try { band.checked = localStorage.getItem(GROUND_BAND) === '1'; } catch { /* private mode */ }
    profile.setGroundBand(band.checked);
    band.onchange = () => { profile.setGroundBand(band.checked); try { localStorage.setItem(GROUND_BAND, band.checked ? '1' : '0'); } catch { /* private mode */ } };
  }

  // ---- profile zoom buttons ----
  const zoomOut = document.getElementById('zoom-out') as HTMLButtonElement;
  const fitB = document.getElementById('fit') as HTMLButtonElement;
  const updateZoomButtons = () => { zoomOut.disabled = profile.isWhole; fitB.hidden = profile.isWhole; };
  document.getElementById('zoom-in')!.onclick = () => profile.zoom(2);
  zoomOut.onclick = () => profile.zoom(0.5);
  fitB.onclick = () => profile.fit();
  updateZoomButtons();
  return { keyBox, showKey, updateZoomButtons };
}
