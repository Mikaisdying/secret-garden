// ===========================================================
// Secret Garden — access helper
// Opening sealed letters is a soft, cosmetic gate, not real security:
// every flower row (message included) is publicly readable from Supabase.
// Its purpose is to make garden.html?key=mikaskleinesiesta feel like a
// place that quietly unlocks everything, not to protect private messages.
// Deleting is different: the server's delete_flower() re-checks the key,
// so the UI gate here only decides whether to show the trash button.
// ===========================================================

/** The lowercased ?key= value, or "" when there is none. */
export function getAccessKey() {
  return new URLSearchParams(window.location.search).get("key")?.toLowerCase() ?? "";
}

/** True when the garden was reached via the ?key=mikaskleinesiesta doorway. */
export function canOpenPrivateLetters() {
  return getAccessKey() === "mikaskleinesiesta";
}
