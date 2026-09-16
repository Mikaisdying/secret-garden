// ===========================================================
// Secret Garden — wax seal presets
// A small fixed set of wax-seal looks (color + engraved symbol) that a
// sender can pick for a private letter. Presets instead of freehand
// drawing: a real wax seal reads as a clean, consistent stamp, and a
// tiny mouse-drawn sketch at this size rarely does.
// ===========================================================

export const SEALS = [
  { id: "rose", light: "#d97a72", mid: "#8a2c2c", deep: "#5a1c1c", labelKey: "plant.sealRose" },
  { id: "moss", light: "#7fae86", mid: "#3c6b45", deep: "#234830", labelKey: "plant.sealMoss" },
  { id: "gold", light: "#f6d98a", mid: "#b8862f", deep: "#7c5a1c", labelKey: "plant.sealGold" },
  { id: "lavender", light: "#cdbdec", mid: "#6b5b95", deep: "#453a63", labelKey: "plant.sealLavender" },
  { id: "sky", light: "#a9dbe6", mid: "#3f7c94", deep: "#285064", labelKey: "plant.sealSky" },
];

const SYMBOLS = {
  rose: () => `<path d="M0 6C-6 6 -9 -1 -6 -5C-3.5 -8 0 -6 0 -3C0 -6 3.5 -8 6 -5C9 -1 6 6 0 6Z" fill="currentColor"/>`,
  moss: () => `<path d="M0 8C-7 6 -8 -3 -3 -8C4 -8 8 -1 6 6C4 8 2 8 0 8Z" fill="currentColor"/><path d="M0 8V-4" stroke="currentColor" stroke-width="1" fill="none"/>`,
  gold: () => `<path d="M0 -8 L2.35 -2.47 L8.5 -1.9 L3.8 2.1 L5.3 8.1 L0 4.7 L-5.3 8.1 L-3.8 2.1 L-8.5 -1.9 L-2.35 -2.47 Z" fill="currentColor"/>`,
  // A crescent drawn as a single arc-path is easy to get wrong (two radii
  // that can't both span the same chord silently collapse to zero area),
  // so this cuts the crescent from a solid disc with a mask instead —
  // the same technique draw.js already uses for erase strokes.
  lavender: (uid) => `<mask id="${uid}-moon"><circle cx="0" cy="0" r="6.5" fill="#fff"/><circle cx="3" cy="-2.5" r="5.5" fill="#000"/></mask><circle cx="0" cy="0" r="6.5" fill="currentColor" mask="url(#${uid}-moon)"/>`,
  sky: () => `<circle cx="5.5" cy="0" r="2.6" fill="currentColor"/><circle cx="1.7" cy="5.23" r="2.6" fill="currentColor"/><circle cx="-4.45" cy="3.23" r="2.6" fill="currentColor"/><circle cx="-4.45" cy="-3.23" r="2.6" fill="currentColor"/><circle cx="1.7" cy="-5.23" r="2.6" fill="currentColor"/><circle cx="0" cy="0" r="2.2" fill="currentColor"/>`,
};

export function getSeal(id) {
  return SEALS.find((s) => s.id === id) || SEALS[0];
}

let gradientSeq = 0;

/** Returns self-contained SVG markup for a wax-seal stamp (a size-agnostic viewBox — scale it via CSS on the wrapper). */
export function sealSvgMarkup(sealId) {
  const seal = getSeal(sealId);
  const gid = `wax-${seal.id}-${gradientSeq++}`;
  const symbol = (SYMBOLS[seal.id] || SYMBOLS.rose)(gid);
  return `<svg class="wax-seal" viewBox="-20 -20 40 40" role="img" aria-hidden="true">
    <defs>
      <radialGradient id="${gid}" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stop-color="${seal.light}"/>
        <stop offset="55%" stop-color="${seal.mid}"/>
        <stop offset="100%" stop-color="${seal.deep}"/>
      </radialGradient>
    </defs>
    <circle cx="0" cy="0" r="18" fill="url(#${gid})" stroke="${seal.deep}" stroke-width="1"/>
    <g color="${seal.deep}" opacity="0.85">${symbol}</g>
  </svg>`;
}
