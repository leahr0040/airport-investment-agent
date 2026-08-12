/**
 * Legacy identifier alias table (Pitfall 2: PBI -> DJT). Data, not an
 * algorithm — a future rename is a data edit here, nothing else changes.
 */

export const LEGACY_CODE_ALIASES: Readonly<Record<string, string>> = {
  PBI: 'DJT',
  KPBI: 'KDJT',
};

// These notes become the matchedVia string a later narration layer shows to
// an analyst, so they read as a sentence, not a code comment.
export const LEGACY_CODE_NOTES: Readonly<Record<string, string>> = {
  PBI: 'Interpreted the legacy West Palm Beach identifier PBI as the current one, DJT, following the FAA\'s 2026 rename (the IATA passenger-facing code changes on 2026-08-18).',
  KPBI: 'Interpreted the legacy West Palm Beach ICAO identifier KPBI as the current one, KDJT, following the FAA\'s 2026 rename.',
};
