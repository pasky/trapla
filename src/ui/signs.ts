// Small Czech road signs above the failure screens' text (research/98): drawn here to vyhláška 294/2015's pictures,
// proportions measured from the catalogue drawings, Z 2 to its product sheet. Decoration only: aria-hidden, no words.
export type SignKind = 'closed' | 'narrows' | 'deadEnd' | 'detour';

const RED = '#ca0b10', BLUE = '#01448a', ORANGE = '#f07d00', BLACK = '#1d1d1b';
const f = (v: number) => +v.toFixed(2);

/** Z 2: the road-closed barrier, a 1.5 × 0.20 m board (red ends 0.125 m, inner stripes 0.25 m) on two stands */
function closed(): [number, number, string] {
  const k = 64, w = 1.5 * k, h = 0.2 * k, top = 4, legs = 30; // board 96 × 12.8 px, top ≈ 1 m above the road
  const stripes: string[] = [];
  let x = 0;
  for (const [len, fill] of [[0.125, RED], [0.25, '#fff'], [0.25, RED], [0.25, '#fff'], [0.25, RED], [0.25, '#fff'], [0.125, RED]] as const) {
    stripes.push(`<rect x="${f(x * k)}" y="${top}" width="${f(len * k)}" height="${f(h)}" fill="${fill}"/>`); x += len;
  }
  const stand = (cx: number) => `<path d="M${cx} ${top + h}v${legs}M${cx - 7} ${top + h + legs}h14" stroke="#7d8580" stroke-width="2.5" fill="none"/>`;
  return [w, top + h + legs + 1.5, `${stand(0.3 * w)}${stand(0.7 * w)}${stripes.join('')}<rect x="0.5" y="${top + 0.5}" width="${w - 1}" height="${f(h - 1)}" fill="none" stroke="#5c615e" stroke-width="1"/>`];
}

/** A 6a: road narrows on both sides; side a, the red band 0.096 a, the symbol's stems jog outwards at mid-height */
function narrows(): [number, number, string] {
  const a = 50, hgt = a * Math.sqrt(3) / 2, m = 1.5, cx = a / 2 + m, ap = m; // (m: room for the rounded corners' stroke)
  const P = (x: number, y: number) => `${f(x)} ${f(y)}`;
  const tri = (inset: number) => {
    // (each side moved in by `inset`: the side shrinks by 2√3·inset, the apex comes down 2·inset)
    const s = a - 2 * Math.sqrt(3) * inset, h2 = s * Math.sqrt(3) / 2, top = ap + 2 * inset;
    return `M${P(cx, top)}L${P(cx + s / 2, top + h2)}L${P(cx - s / 2, top + h2)}Z`;
  };
  const y = (t: number) => ap + t * a; // from the apex, in units of a
  const stem = (side: -1 | 1) => {
    const i0 = 0.020 * a, i1 = 0.063 * a, w = 0.069 * a;
    const xs = (inner: number) => [cx + side * inner, cx + side * (inner + w)];
    const [u0, u1] = xs(i0), [l0, l1] = xs(i1);
    return `<path d="M${P(u0, y(0.413))}L${P(u1, y(0.413))}L${P(u1, y(0.505))}L${P(l1, y(0.573))}L${P(l1, y(0.735))}L${P(l0, y(0.735))}L${P(l0, y(0.573))}L${P(u0, y(0.505))}Z" fill="${BLACK}"/>`;
  };
  return [a + 2 * m, hgt + 2 * m, `<path d="${tri(0)}" fill="${RED}" stroke="${RED}" stroke-width="${2 * m}" stroke-linejoin="round"/><path d="${tri(0.096 * a)}" fill="#fff"/>${stem(-1)}${stem(1)}`];
}

/** IP 10a: dead end; side S, a blue rim and a white line round the blue field, the white T with its red bar */
function deadEnd(): [number, number, string] {
  const S = 44, R = (x0: number, x1: number, y0: number, y1: number, fill: string) => `<rect x="${f(x0 * S)}" y="${f(y0 * S)}" width="${f((x1 - x0) * S)}" height="${f((y1 - y0) * S)}" fill="${fill}"/>`;
  return [S, S, `<rect width="${S}" height="${S}" rx="${f(0.07 * S)}" fill="${BLUE}"/><rect x="${f(0.03 * S)}" y="${f(0.03 * S)}" width="${f(0.94 * S)}" height="${f(0.94 * S)}" rx="${f(0.05 * S)}" fill="none" stroke="#fff" stroke-width="${f(0.03 * S)}"/>`
    + R(0.316, 0.682, 0.10, 0.259, '#fff') + R(0.419, 0.579, 0.25, 0.90, '#fff') + R(0.345, 0.652, 0.13, 0.231, RED)];
}

/** IS 11c: the detour arrow board; height h, 3.57 h long with its point the last 0.62 h, a black line inside its edge */
function detour(): [number, number, string] {
  const h = 26, L = 3.57 * h, tip = 0.62 * h, P = (x: number, y: number) => `${f(x)} ${f(y)}`;
  const board = (i: number) => `M${P(i, i)}L${P(L - tip, i)}L${P(L - i * 1.6, h / 2)}L${P(L - tip, h - i)}L${P(i, h - i)}Z`;
  const m = h / 2, s0 = 0.63 * h, hb = L - tip - 0.05 * h, tipX = hb + 0.49 * h;
  const arrow = `M${P(s0, m - 0.15 * h)}L${P(hb, m - 0.15 * h)}L${P(hb, m - 0.28 * h)}L${P(tipX, m)}L${P(hb, m + 0.28 * h)}L${P(hb, m + 0.15 * h)}L${P(s0, m + 0.15 * h)}Z`;
  return [L, h, `<path d="${board(0)}" fill="${ORANGE}"/><path d="${board(0.075 * h)}" fill="none" stroke="${BLACK}" stroke-width="${f(0.05 * h)}" stroke-linejoin="round"/><path d="${arrow}" fill="${BLACK}"/>`];
}

/** The sign as an inline SVG element (aria-hidden), `kind` per failure screen. */
export function signSvg(kind: SignKind): string {
  const [w, h, body] = { closed, narrows, deadEnd, detour }[kind]();
  return `<svg class="notice-sign" aria-hidden="true" focusable="false" width="${f(w)}" height="${f(h)}" viewBox="0 0 ${f(w)} ${f(h)}">${body}</svg>`;
}
