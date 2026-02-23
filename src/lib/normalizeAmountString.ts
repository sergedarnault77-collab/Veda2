export function normalizeAmountString(input: string): string {
  if (!input) return input;

  return input
    .replace(/,/g, ".")          // EU decimal comma → dot
    .replace(/\s+/g, " ")        // normalize whitespace
    .replace(/µg/gi, "mcg")      // microgram variants
    .replace(/μg/gi, "mcg")
    .replace(/\bIE\b/gi, "IU")   // German IU
    .trim();
}
