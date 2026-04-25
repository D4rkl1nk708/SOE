/**
 * Shared utility functions for SOE
 */

/**
 * Normalizes a string for comparison by:
 * 1. Converting to lowercase
 * 2. Removing accents/diacritics
 * 3. Removing non-alphanumeric characters (except spaces)
 * 4. Collapsing multiple spaces into one
 * 5. Trimming whitespace
 */
export const normalizeString = (s: string | null | undefined): string => {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Checks if two strings are a fuzzy match for discipline or topic names.
 * Matches if one string is contained within the other (if long enough) or if they match exactly after normalization.
 */
export const isFuzzyMatch = (s1: string, s2: string): boolean => {
  const n1 = normalizeString(s1);
  const n2 = normalizeString(s2);

  if (!n1 || !n2) return false;
  if (n1 === n2) return true;

  // If one is a significant part of the other
  if (n1.length > 5 && n2.includes(n1)) return true;
  if (n2.length > 5 && n1.includes(n2)) return true;

  return false;
};
