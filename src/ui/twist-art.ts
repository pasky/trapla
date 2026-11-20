// The twist screen's small pictures (ui/twist-picker.ts): our own line drawings in the map's colours, one per twist, as
// inline SVG (aria-hidden: the card's words say what it is). 96 × 56 units each.
import type { TwistId } from '../core/twist-words';

const GROUND = '#b9a77a', SOIL = '#e8dcb8', ROAD = '#3e4a45', GREEN = '#5f8f5a', LEAF = '#7fae6f', PLUM = '#7a4a9a', AMBER = '#c46a00', SKY = '#7fa7c9', INK = '#50645a';

const ART: Record<TwistId, string> = {
  // a cut on the left, its earth carried over to the embankment on the right
  earth: `<path d="M2 32 Q24 4 46 32 Z" fill="#f4efe0" stroke="${GROUND}" stroke-width="1.5" stroke-dasharray="3 2"/>
    <path d="M50 32 Q72 58 94 32 Z" fill="${SOIL}" stroke="${GROUND}" stroke-width="1.5"/>
    <path d="M0 32 H96" stroke="${ROAD}" stroke-width="3"/>
    <path d="M24 16 Q46 0 68 24" fill="none" stroke="${AMBER}" stroke-width="2.2"/><path d="M68 24 L60 21 M68 24 L67 15" stroke="${AMBER}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  // a castle on its hill, a dashed ring round it
  landmarks: `<ellipse cx="48" cy="30" rx="40" ry="22" fill="rgba(122,74,154,0.12)" stroke="${PLUM}" stroke-width="2" stroke-dasharray="6 4"/>
    <path d="M30 44 Q48 34 66 44 Z" fill="${SOIL}" stroke="${GROUND}" stroke-width="1.5"/>
    <path d="M37 40 V24 h4 v3 h3 v-3 h4 v3 h3 v-3 h4 V40 Z M51 40 V18 h3 v-3 h2 v3 h3 v-3 h2 v3 h3 V40" fill="#d8d3c6" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M45 40 v-6 a3 3 0 0 1 6 0 v6" fill="${INK}"/>`,
  // a site notice on two posts
  curveballs: `<path d="M32 50 V30 M64 50 V30" stroke="${ROAD}" stroke-width="3"/>
    <rect x="22" y="8" width="52" height="26" rx="2" fill="#fff3d9" stroke="${AMBER}" stroke-width="2"/>
    <path d="M30 16 H56 M30 22 H66 M30 28 H50" stroke="${INK}" stroke-width="2"/>
    <circle cx="66" cy="16" r="4" fill="${AMBER}"/><path d="M12 50 H84" stroke="${GROUND}" stroke-width="2"/>`,
  // a house
  homes: `<path d="M12 50 H84" stroke="${GROUND}" stroke-width="2"/>
    <path d="M30 50 V28 L48 14 L66 28 V50 Z" fill="#f2e6d0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M26 31 L48 12 L70 31" fill="none" stroke="#a3200f" stroke-width="3" stroke-linejoin="round"/>
    <rect x="35" y="32" width="8" height="8" fill="${SKY}" stroke="${INK}" stroke-width="1.2"/><rect x="51" y="36" width="8" height="14" fill="${INK}"/>`,
  // trees
  forest: `<path d="M8 50 H88" stroke="${GROUND}" stroke-width="2"/>
    <path d="M22 50 V42 M48 50 V40 M74 50 V42" stroke="#6b5233" stroke-width="3"/>
    <path d="M22 12 L34 42 H10 Z" fill="${GREEN}"/><path d="M48 6 L62 40 H34 Z" fill="${LEAF}" stroke="${GREEN}" stroke-width="1.5"/><path d="M74 14 L86 42 H62 Z" fill="${GREEN}"/>`,
  // a bridge with its length measured
  bridges: `<path d="M4 50 Q26 26 48 44 Q70 26 92 50" fill="${SOIL}" stroke="${GROUND}" stroke-width="2"/>
    <path d="M8 26 H88" stroke="${ROAD}" stroke-width="4"/>
    <path d="M30 28 V40 M48 28 V44 M66 28 V40" stroke="${ROAD}" stroke-width="3"/>
    <path d="M8 14 H88 M8 10 V18 M88 10 V18" stroke="${AMBER}" stroke-width="1.5"/>
    <path d="M14 14 l5 -3 v6 Z M82 14 l-5 -3 v6 Z" fill="${AMBER}"/>`,
  // a tunnel portal, crossed out
  tunnels: `<path d="M4 50 Q30 6 60 14 Q80 20 92 50 Z" fill="${SOIL}" stroke="${GROUND}" stroke-width="2"/>
    <path d="M36 50 V38 a12 12 0 0 1 24 0 V50 Z" fill="${ROAD}"/>
    <path d="M24 16 L72 50 M72 16 L24 50" stroke="#a3200f" stroke-width="3"/>`,
  // a stopwatch
  faster: `<circle cx="48" cy="31" r="18" fill="#fffefa" stroke="${INK}" stroke-width="2.5"/>
    <path d="M44 10 H52 M48 10 V13" stroke="${INK}" stroke-width="2.5"/><path d="M48 31 L58 23" stroke="${AMBER}" stroke-width="2.5"/>
    <path d="M10 26 H24 M6 32 H24 M12 38 H24" stroke="${GROUND}" stroke-width="2"/>`,
  // a stack of coins
  budget: `<g fill="#e9c46a" stroke="#9a7420" stroke-width="1.5"><ellipse cx="40" cy="44" rx="16" ry="5"/><ellipse cx="40" cy="38" rx="16" ry="5"/><ellipse cx="40" cy="32" rx="16" ry="5"/>
    <ellipse cx="60" cy="44" rx="16" ry="5"/><ellipse cx="60" cy="38" rx="16" ry="5"/><ellipse cx="60" cy="32" rx="16" ry="5"/><ellipse cx="60" cy="26" rx="16" ry="5"/><ellipse cx="60" cy="20" rx="16" ry="5"/></g>`,
  // a straight line from A to B
  scratch: `<path d="M16 42 L80 14" stroke="${ROAD}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="16" cy="42" r="7" fill="#fffefa" stroke="${ROAD}" stroke-width="2"/><circle cx="80" cy="14" r="7" fill="#fffefa" stroke="${ROAD}" stroke-width="2"/>
    <text x="16" y="46" font-size="10" font-weight="700" text-anchor="middle" fill="${ROAD}" font-family="system-ui, sans-serif">A</text>
    <text x="80" y="18" font-size="10" font-weight="700" text-anchor="middle" fill="${ROAD}" font-family="system-ui, sans-serif">B</text>`,
  // the profile: the ground and our road's line with a height pin
  byHand: `<path d="M4 44 Q20 30 34 38 Q50 48 64 26 Q78 12 92 30" fill="none" stroke="${GROUND}" stroke-width="2"/>
    <path d="M4 40 L44 32 L92 24" fill="none" stroke="${ROAD}" stroke-width="3"/>
    <path d="M44 32 V12" stroke="${AMBER}" stroke-width="2"/><circle cx="44" cy="10" r="5" fill="${AMBER}"/><circle cx="44" cy="32" r="3" fill="#fffefa" stroke="${ROAD}" stroke-width="2"/>`,
};

/** the picture for twist `id`, as SVG markup */
export const twistArt = (id: TwistId): string =>
  `<svg class="tw-art" viewBox="0 0 96 56" width="96" height="56" aria-hidden="true" focusable="false">${ART[id]}</svg>`;
