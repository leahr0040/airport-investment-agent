/**
 * Airport location lookup: a flat, hardcoded map from region/metro names to
 * IATA codes, plus a couple of legacy code aliases (FAA's 2026 PBI -> DJT
 * rename). No live registry, no distance calculations. The LLM (Phase 4) does
 * the natural-language extraction; this table just expands a known name to
 * its airports, or passes a bare code through as-is.
 */

const REGION_LOOKUP: Readonly<Record<string, readonly string[]>> = {
  // Regions
  'new england': ['BOS', 'BDL', 'PWM'],
  'mid-atlantic': ['JFK', 'LGA', 'EWR', 'DCA', 'IAD', 'BWI'],
  'mid atlantic': ['JFK', 'LGA', 'EWR', 'DCA', 'IAD', 'BWI'],
  south: ['MIA', 'FLL', 'DJT', 'ATL'],
  midwest: ['ORD', 'MDW'],
  southwest: ['DFW', 'IAH', 'AUS'],
  'mountain west': ['DEN', 'SLC'],
  pacific: ['SFO', 'OAK', 'SJC', 'LAX', 'SEA', 'PDX'],
  'west coast': ['SFO', 'OAK', 'SJC', 'LAX', 'SEA', 'PDX'],
  alaska: ['ANC'],
  hawaii: ['HNL'],

  // Metro aggregations
  la: ['LAX', 'BUR', 'LGB', 'SNA', 'ONT'],
  'los angeles': ['LAX', 'BUR', 'LGB', 'SNA', 'ONT'],
  nyc: ['JFK', 'LGA', 'EWR'],
  'new york': ['JFK', 'LGA', 'EWR'],
  'new york city': ['JFK', 'LGA', 'EWR'],
  'bay area': ['SFO', 'OAK', 'SJC'],
  'san francisco bay area': ['SFO', 'OAK', 'SJC'],
  dc: ['DCA', 'IAD', 'BWI'],
  'washington dc': ['DCA', 'IAD', 'BWI'],
  chicago: ['ORD', 'MDW'],
  'south florida': ['MIA', 'FLL', 'DJT'],

  // Legacy code alias (FAA renamed West Palm Beach's IATA code PBI -> DJT, 2026-08-18)
  pbi: ['DJT'],
};

/**
 * Converts an already-extracted name or code into an array of IATA strings.
 * A recognised region/metro name expands to its airports; anything else is
 * assumed to already be an airport code and is passed through uppercased.
 */
export function lookupAirports(query: string): string[] {
  const key = query.trim().toLowerCase();
  const known = REGION_LOOKUP[key];
  if (known) return [...known];
  return [query.trim().toUpperCase()];
}
