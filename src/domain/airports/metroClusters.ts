/**
 * Six hardcoded metro ambiguity clusters (D-06). Pure data — no I/O, no
 * registry access. A fixed lookup table, deliberately not a proximity algorithm.
 */

export interface MetroCluster {
  id: string;
  label: string;
  codes: string[];
  note?: string;
}

export const METRO_CLUSTERS: readonly MetroCluster[] = [
  {
    id: 'la',
    label: 'Los Angeles metro',
    codes: ['LAX', 'BUR', 'LGB', 'SNA', 'ONT'],
    note: 'LA is also the USPS code for Louisiana; the state is reachable by typing "Louisiana".',
  },
  {
    id: 'nyc',
    label: 'New York City metro',
    codes: ['JFK', 'LGA', 'EWR'],
    note: 'EWR is in New Jersey and would be missed by a name-based search for New York.',
  },
  {
    id: 'sfbay',
    label: 'San Francisco Bay Area',
    codes: ['SFO', 'OAK', 'SJC'],
  },
  {
    id: 'dc',
    label: 'Washington D.C. metro',
    codes: ['DCA', 'IAD', 'BWI'],
    note: 'BWI is in Maryland and DCA/IAD are in Virginia, so no single state lookup covers this cluster.',
  },
  {
    id: 'chicago',
    label: 'Chicago metro',
    codes: ['ORD', 'MDW'],
  },
  {
    id: 'southfl',
    label: 'South Florida metro',
    codes: ['MIA', 'FLL', 'DJT'],
    note: 'DJT is the airport the FAA formerly identified as PBI.',
  },
];

// Deliberately excluded: bare "washington" (must keep resolving to the state
// WA), bare "san francisco" (SFO's own name already matches it uniquely), and
// bare "miami" (same reasoning for MIA). Metro clusters disambiguate genuinely
// ambiguous shorthands, not swallow city names that already identify one airport.
export const METRO_ALIASES: Readonly<Record<string, string>> = {
  la: 'la',
  'l.a.': 'la',
  'los angeles': 'la',
  'greater los angeles': 'la',
  nyc: 'nyc',
  'n.y.c.': 'nyc',
  'new york': 'nyc',
  'new york city': 'nyc',
  sf: 'sfbay',
  'bay area': 'sfbay',
  'sf bay area': 'sfbay',
  'san francisco bay area': 'sfbay',
  dc: 'dc',
  'd.c.': 'dc',
  'washington dc': 'dc',
  'washington d.c.': 'dc',
  'washington, dc': 'dc',
  chicago: 'chicago',
  chicagoland: 'chicago',
  'south florida': 'southfl',
  'south fl': 'southfl',
  'southern florida': 'southfl',
};
