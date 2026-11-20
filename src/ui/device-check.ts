// Before the start screen: a page opened over plain http:// (not localhost) lacks what the game needs, a browser
// without WebGL 2 cannot draw the map, and a phone or a small window cannot fit it. All are told plainly instead of
// a broken page; a small screen may go on anyway.
import './scenario-picker.css';
import { signSvg } from './signs';

const ANYWAY = 'trapla.small-screen-ok';

export function hasWebGL2(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

/** a touch-only device, or a window too small for the map, the profile and the side panel (≈ 1,000 × 560 px) */
export function tooSmall(): boolean {
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  return touchOnly || innerWidth < 960 || innerHeight < 540;
}

/** The notice, as the start screen's page. `onAnyway`: a button to go on regardless. */
export function showDeviceNotice(kind: 'webgl' | 'small' | 'insecure', onAnyway?: () => void): HTMLElement {
  const root = document.createElement('main');
  root.className = 'scenario-picker device-notice';
  root.setAttribute('role', 'alert');
  const content = document.createElement('div'); content.className = 'scenario-picker-content';
  const brand = document.createElement('p'); brand.className = 'scenario-picker-brand'; brand.textContent = 'Trapla';
  const h = document.createElement('h1');
  const p = document.createElement('p'); p.className = 'scenario-picker-lead';
  const more = document.createElement('p');
  if (kind === 'insecure') {
    // the browser keeps what the game needs (crypto.subtle, crypto.randomUUID) to https:// pages and localhost
    h.textContent = 'Open Trapla over https://';
    p.textContent = 'This page was opened over plain http://, where the browser does not give the game what it needs.';
    const secure = location.href.replace(/^http:/, 'https:');
    more.append('Try ', Object.assign(document.createElement('a'), { href: secure, textContent: secure }), '.');
  } else if (kind === 'webgl') {
    h.textContent = 'This browser cannot draw the 3D map';
    p.textContent = 'Trapla shows the terrain with WebGL 2, which this browser does not have or has turned off.';
    more.textContent = 'Try a recent Chrome, Firefox, Edge or Safari on a desktop computer. If it still does not work, turn on “Use hardware acceleration” in the browser’s settings.';
  } else {
    h.textContent = 'Trapla is a desktop game';
    p.textContent = 'You design a road on a large map with a mouse. On a phone, a tablet or a small window the map and its controls do not fit.';
    more.textContent = 'Come back on a computer, with the window at least 1,000 pixels wide.';
  }
  const actions = document.createElement('div'); actions.className = 'scenario-picker-actions';
  if (onAnyway) {
    const go = document.createElement('button'); go.type = 'button'; go.textContent = 'Continue anyway';
    go.onclick = () => { try { sessionStorage.setItem(ANYWAY, '1'); } catch { /* private mode */ } root.remove(); onAnyway(); };
    actions.append(go);
  }
  const about = document.createElement('a'); about.href = 'about.html'; about.textContent = 'About Trapla'; about.className = 'scenario-picker-link';
  actions.append(about);
  // a road sign above the text (research/98): a detour, a dead end, the road narrowing
  const sign = document.createElement('div'); sign.className = 'notice-sign-box';
  sign.innerHTML = signSvg(kind === 'insecure' ? 'detour' : kind === 'webgl' ? 'deadEnd' : 'narrows');
  content.append(brand, sign, h, p, more, actions);
  root.append(content);
  document.body.append(root);
  document.getElementById('status')?.style.setProperty('display', 'none');
  return root;
}

/** Resolves once the game may start; never resolves without WebGL 2 (the notice stays). */
export function deviceCheck(): Promise<void> {
  return new Promise((resolve) => {
    if (!isSecureContext) { showDeviceNotice('insecure'); return; }
    if (!hasWebGL2()) { showDeviceNotice('webgl'); return; }
    let anyway = false;
    try { anyway = sessionStorage.getItem(ANYWAY) === '1'; } catch { /* private mode */ }
    if (!anyway && tooSmall()) { showDeviceNotice('small', resolve); return; }
    resolve();
  });
}
