/**
 * State-to-region table and region/state lookup helpers (D-03/D-04/D-05).
 *
 * Pure data plus pure functions — no I/O, no imports beyond ./types.
 */

import type { AirportRef, RegionName, Registry } from './types';

// This is a common-usage grouping, not the literal US Census division scheme;
// TX, MO, KY and WV are the contestable placements (RESEARCH.md assumption A1).
export const STATE_TO_REGION: Readonly<Record<string, RegionName>> = {
  // New England
  CT: 'New England',
  ME: 'New England',
  MA: 'New England',
  NH: 'New England',
  RI: 'New England',
  VT: 'New England',
  // Mid-Atlantic (DC included per D-05)
  DE: 'Mid-Atlantic',
  DC: 'Mid-Atlantic',
  MD: 'Mid-Atlantic',
  NJ: 'Mid-Atlantic',
  NY: 'Mid-Atlantic',
  PA: 'Mid-Atlantic',
  VA: 'Mid-Atlantic',
  WV: 'Mid-Atlantic',
  // South
  AL: 'South',
  AR: 'South',
  FL: 'South',
  GA: 'South',
  KY: 'South',
  LA: 'South',
  MS: 'South',
  NC: 'South',
  SC: 'South',
  TN: 'South',
  // Midwest
  IL: 'Midwest',
  IN: 'Midwest',
  IA: 'Midwest',
  KS: 'Midwest',
  MI: 'Midwest',
  MN: 'Midwest',
  MO: 'Midwest',
  NE: 'Midwest',
  ND: 'Midwest',
  OH: 'Midwest',
  SD: 'Midwest',
  WI: 'Midwest',
  // Southwest
  AZ: 'Southwest',
  NM: 'Southwest',
  OK: 'Southwest',
  TX: 'Southwest',
  // Mountain West
  CO: 'Mountain West',
  ID: 'Mountain West',
  MT: 'Mountain West',
  NV: 'Mountain West',
  UT: 'Mountain West',
  WY: 'Mountain West',
  // Pacific
  CA: 'Pacific',
  OR: 'Pacific',
  WA: 'Pacific',
  // Alaska / Hawaii
  AK: 'Alaska',
  HI: 'Hawaii',
};

export const STATE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
};

export const REGION_ALIASES: Readonly<Record<string, RegionName>> = {
  'new england': 'New England',
  'mid-atlantic': 'Mid-Atlantic',
  'mid atlantic': 'Mid-Atlantic',
  midatlantic: 'Mid-Atlantic',
  south: 'South',
  'the south': 'South',
  midwest: 'Midwest',
  'mid-west': 'Midwest',
  southwest: 'Southwest',
  'south west': 'Southwest',
  'mountain west': 'Mountain West',
  mountain: 'Mountain West',
  pacific: 'Pacific',
  'west coast': 'Pacific',
  'pacific/west coast': 'Pacific',
  alaska: 'Alaska',
  hawaii: 'Hawaii',
};

export function regionForState(stateCode: string): RegionName | undefined {
  return STATE_TO_REGION[stateCode.toUpperCase()];
}

export function airportsInRegion(region: RegionName, registry: Registry): AirportRef[] {
  const states = Object.keys(STATE_TO_REGION).filter(
    (state) => STATE_TO_REGION[state] === region,
  );
  const airports: AirportRef[] = [];
  for (const state of states) {
    const forState = registry.byState.get(state);
    if (forState) airports.push(...forState);
  }
  return airports.sort((a, b) => a.iata.localeCompare(b.iata));
}

export function airportsInState(stateCode: string, registry: Registry): AirportRef[] {
  const forState = registry.byState.get(stateCode.toUpperCase());
  return forState ? [...forState].sort((a, b) => a.iata.localeCompare(b.iata)) : [];
}
