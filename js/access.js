// ===========================================================
// Secret Garden — access helper
// The garden is a static, client-side site (no backend, no auth), so
// this is a soft, cosmetic gate, not real security: anyone who opens
// devtools can still read a sealed letter's data. Its purpose is to
// make garden.html?key=mikaskleinesiesta feel like a place that quietly
// unlocks everything, not to actually protect private messages.
// ===========================================================

/** True when the garden was reached via the ?key=mikaskleinesiesta doorway. */
export function canOpenPrivateLetters() {
  return new URLSearchParams(window.location.search).get("key") === "mikaskleinesiesta";
}
