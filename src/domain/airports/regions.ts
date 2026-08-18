/**
 * Airport location lookup: a flat, hardcoded map from region/metro names to
 * airport code pairs `{iata, icao}`. The table carries ICAO codes as data
 * because no live registry supplies the ICAO↔IATA join after the Phase 1
 * architecture pivot (D-09). A K-prefix derivation is applied only on the
 * passthrough branch for inputs not present in the table (D-10); ANC and HNL
 * are the documented exceptions and carry their P-prefixed ICAOs in the table.
 */

import { isValidIcao, isValidIata } from '@/domain/adapters/validate';

export type AirportCodes = { readonly iata: string; readonly icao: string };

const REGION_LOOKUP: Readonly<Record<string, readonly AirportCodes[]>> = {
  // Regions
  'new england': [
    { iata: 'BOS', icao: 'KBOS' },
    { iata: 'BDL', icao: 'KBDL' },
    { iata: 'PWM', icao: 'KPWM' },
  ],
  'mid-atlantic': [
    { iata: 'JFK', icao: 'KJFK' },
    { iata: 'LGA', icao: 'KLGA' },
    { iata: 'EWR', icao: 'KEWR' },
    { iata: 'DCA', icao: 'KDCA' },
    { iata: 'IAD', icao: 'KIAD' },
    { iata: 'BWI', icao: 'KBWI' },
  ],
  'mid atlantic': [
    { iata: 'JFK', icao: 'KJFK' },
    { iata: 'LGA', icao: 'KLGA' },
    { iata: 'EWR', icao: 'KEWR' },
    { iata: 'DCA', icao: 'KDCA' },
    { iata: 'IAD', icao: 'KIAD' },
    { iata: 'BWI', icao: 'KBWI' },
  ],
  south: [
    { iata: 'MIA', icao: 'KMIA' },
    { iata: 'FLL', icao: 'KFLL' },
    { iata: 'PBI', icao: 'KPBI' },
    { iata: 'ATL', icao: 'KATL' },
  ],
  midwest: [
    { iata: 'ORD', icao: 'KORD' },
    { iata: 'MDW', icao: 'KMDW' },
  ],
  southwest: [
    { iata: 'DFW', icao: 'KDFW' },
    { iata: 'IAH', icao: 'KIAH' },
    { iata: 'AUS', icao: 'KAUS' },
  ],
  'mountain west': [
    { iata: 'DEN', icao: 'KDEN' },
    { iata: 'SLC', icao: 'KSLC' },
  ],
  pacific: [
    { iata: 'SFO', icao: 'KSFO' },
    { iata: 'OAK', icao: 'KOAK' },
    { iata: 'SJC', icao: 'KSJC' },
    { iata: 'LAX', icao: 'KLAX' },
    { iata: 'SEA', icao: 'KSEA' },
    { iata: 'PDX', icao: 'KPDX' },
  ],
  'west coast': [
    { iata: 'SFO', icao: 'KSFO' },
    { iata: 'OAK', icao: 'KOAK' },
    { iata: 'SJC', icao: 'KSJC' },
    { iata: 'LAX', icao: 'KLAX' },
    { iata: 'SEA', icao: 'KSEA' },
    { iata: 'PDX', icao: 'KPDX' },
  ],
  alaska: [{ iata: 'ANC', icao: 'PANC' }],
  hawaii: [{ iata: 'HNL', icao: 'PHNL' }],

  // Metro aggregations
  la: [
    { iata: 'LAX', icao: 'KLAX' },
    { iata: 'BUR', icao: 'KBUR' },
    { iata: 'LGB', icao: 'KLGB' },
    { iata: 'SNA', icao: 'KSNA' },
    { iata: 'ONT', icao: 'KONT' },
  ],
  'los angeles': [
    { iata: 'LAX', icao: 'KLAX' },
    { iata: 'BUR', icao: 'KBUR' },
    { iata: 'LGB', icao: 'KLGB' },
    { iata: 'SNA', icao: 'KSNA' },
    { iata: 'ONT', icao: 'KONT' },
  ],
  nyc: [
    { iata: 'JFK', icao: 'KJFK' },
    { iata: 'LGA', icao: 'KLGA' },
    { iata: 'EWR', icao: 'KEWR' },
  ],
  'new york': [
    { iata: 'JFK', icao: 'KJFK' },
    { iata: 'LGA', icao: 'KLGA' },
    { iata: 'EWR', icao: 'KEWR' },
  ],
  'new york city': [
    { iata: 'JFK', icao: 'KJFK' },
    { iata: 'LGA', icao: 'KLGA' },
    { iata: 'EWR', icao: 'KEWR' },
  ],
  'bay area': [
    { iata: 'SFO', icao: 'KSFO' },
    { iata: 'OAK', icao: 'KOAK' },
    { iata: 'SJC', icao: 'KSJC' },
  ],
  'san francisco bay area': [
    { iata: 'SFO', icao: 'KSFO' },
    { iata: 'OAK', icao: 'KOAK' },
    { iata: 'SJC', icao: 'KSJC' },
  ],
  dc: [
    { iata: 'DCA', icao: 'KDCA' },
    { iata: 'IAD', icao: 'KIAD' },
    { iata: 'BWI', icao: 'KBWI' },
  ],
  'washington dc': [
    { iata: 'DCA', icao: 'KDCA' },
    { iata: 'IAD', icao: 'KIAD' },
    { iata: 'BWI', icao: 'KBWI' },
  ],
  chicago: [
    { iata: 'ORD', icao: 'KORD' },
    { iata: 'MDW', icao: 'KMDW' },
  ],
  'south florida': [
    { iata: 'MIA', icao: 'KMIA' },
    { iata: 'FLL', icao: 'KFLL' },
    { iata: 'PBI', icao: 'KPBI' },
  ],
};

export function regionKeys(): string[] {
  return Object.keys(REGION_LOOKUP);
}

/**
 * Converts an already-extracted name or code into an array of `{iata, icao}` pairs.
 * Table hits return the stored pairs unchanged; passthrough uses a K-prefix
 * derivation for 3-letter inputs except for documented Alaska/Hawaii exceptions.
 */
export function lookupAirports(query: string): AirportCodes[] {
  const key = query.trim().toLowerCase();
  const known = REGION_LOOKUP[key];
  if (known) return known.map((x) => ({ ...x }));

  const norm = query.trim().toUpperCase();
  if (norm.length === 4) {
    if (!isValidIcao(norm)) return [];
    return [{ iata: norm.slice(1), icao: norm }];
  }

  if (norm.length === 3) {
    if (!isValidIata(norm)) return [];
    // Two exceptions use P-prefixed ICAO codes instead of K-prefixed.
    const exceptions: Record<string, string> = { ANC: 'PANC', HNL: 'PHNL' };
    const icao = exceptions[norm] ?? `K${norm}`;
    return [{ iata: norm, icao }];
  }

  return [];
}
