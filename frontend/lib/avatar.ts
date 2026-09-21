/**
 * Small, dependency-free helpers for the initials-circle avatars used
 * anywhere a person shows up in the UI (space members, "who added
 * this" on a shared item...). Nothing here is grocery-specific on
 * purpose -- any space that grows its own member-facing UI can reuse
 * it instead of re-deriving initials/colors its own way.
 */

/** "Rares Busecan" -> "RB", "cristina" -> "CR", "" -> "?". Takes the
 * first letter of up to the first two words -- a single-word name
 * still gets two letters (more recognizable than one) by falling back
 * to that word's first two characters. */
export function initialsOf(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  return words[0].slice(0, 2).toUpperCase();
}

/** A fixed, dark-mode-friendly palette -- deterministic per id (same
 * person always lands on the same color, everywhere they're shown)
 * rather than random, so an avatar doesn't change color on refresh. */
const AVATAR_PALETTE = [
  "#7C6FF0", // indigo
  "#10B981", // green
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#EC4899", // pink
  "#14B8A6", // teal
  "#EF4444", // red
  "#8B5CF6", // purple
];

export function colorForId(id: string | number): string {
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
