/**
 * Pure zero-I/O resolver: query string to ResolveResult (RESOLVE-01..04, D-07/D-08).
 *
 * No network, no filesystem, no module-level mutable state, no ambient env reads.
 * The registry arrives as a parameter.
 */

import type { AirportRef, MatchKind, Registry, ResolveResult } from './types';
import { STATE_NAME_TO_CODE, STATE_TO_REGION, REGION_ALIASES, airportsInRegion, airportsInState } from './regions';
import { METRO_ALIASES, METRO_CLUSTERS } from './metroClusters';
import { LEGACY_CODE_ALIASES, LEGACY_CODE_NOTES } from './aliases';

const METRO_CLUSTERS_BY_ID = new Map(METRO_CLUSTERS.map((cluster) => [cluster.id, cluster]));

export function normalizeQuery(raw: string): { text: string; code: string } {
  const text = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return { text, code };
}

function byIata(codes: readonly string[], registry: Registry): AirportRef[] {
  const matches: AirportRef[] = [];
  for (const code of codes) {
    const airport = registry.byIata.get(code);
    if (airport) matches.push(airport);
  }
  return matches;
}

function sortByIata(matches: AirportRef[]): AirportRef[] {
  return matches.sort((a, b) => a.iata.localeCompare(b.iata));
}

function buildSuggestions(text: string, code: string, registry: Registry): AirportRef[] {
  const tokens = text.split(' ').filter((token) => token.length >= 3);
  let matches: AirportRef[] = [];
  if (tokens.length > 0) {
    matches = registry.all.filter((airport) => {
      const name = airport.name.toLowerCase();
      const city = airport.city.toLowerCase();
      const iata = airport.iata.toLowerCase();
      const icao = airport.icao.toLowerCase();
      return tokens.some(
        (token) => name.includes(token) || city.includes(token) || iata.includes(token) || icao.includes(token),
      );
    });
  }
  if (matches.length === 0 && (code.length === 3 || code.length === 4)) {
    const prefix = code.slice(0, 2).toLowerCase();
    matches = registry.all.filter(
      (airport) => airport.iata.toLowerCase().startsWith(prefix) || airport.icao.toLowerCase().startsWith(prefix),
    );
  }
  return sortByIata([...matches]).slice(0, 5);
}

function emptyResult(query: string, registry: Registry, text: string, code: string): ResolveResult {
  return {
    query,
    kind: 'none',
    matches: [],
    ambiguous: false,
    matchedVia: null,
    suggestions: buildSuggestions(text, code, registry),
  };
}

function result(
  query: string,
  kind: MatchKind,
  matches: AirportRef[],
  matchedVia: string | null,
  ambiguous?: boolean,
): ResolveResult {
  const sorted = sortByIata(matches);
  return {
    query,
    kind,
    matches: sorted,
    ambiguous: ambiguous ?? sorted.length > 1,
    matchedVia,
    suggestions: [],
  };
}

// Branch order is a decision, not an accident: metro shorthands (4) deliberately win over
// 2-letter state codes / region names (5, 6) so "LA" surfaces the ambiguous metro cluster
// rather than silently resolving to the state of Louisiana.
export function resolve(query: string, registry: Registry): ResolveResult {
  const { text, code } = normalizeQuery(query);

  // 1. ICAO code (4 chars)
  if (code.length === 4) {
    const airport = registry.byIcao.get(code);
    if (airport) return result(query, 'icao', [airport], null);
  }

  // 2. IATA code (3 chars)
  if (code.length === 3) {
    const airport = registry.byIata.get(code);
    if (airport) return result(query, 'iata', [airport], null);
  }

  // 3. Legacy code alias
  if (code in LEGACY_CODE_ALIASES) {
    const target = LEGACY_CODE_ALIASES[code];
    const airport = registry.byIata.get(target) ?? registry.byIcao.get(target);
    if (airport) {
      return result(query, 'alias', [airport], LEGACY_CODE_NOTES[code] ?? null, false);
    }
  }

  // 4. Metro cluster alias — a recognised shorthand always resolves to kind "metro", even if
  // the current registry happens to be missing one of the cluster's codes.
  if (text in METRO_ALIASES) {
    const clusterId = METRO_ALIASES[text];
    const cluster = METRO_CLUSTERS_BY_ID.get(clusterId);
    if (cluster) {
      const matches = byIata(cluster.codes, registry);
      const matchedVia = cluster.note ? `${cluster.label}: ${cluster.note}` : cluster.label;
      return result(query, 'metro', matches, matchedVia, matches.length > 1);
    }
  }

  // 5. Region alias — a recognised region name always resolves to kind "region".
  if (text in REGION_ALIASES) {
    const region = REGION_ALIASES[text];
    const matches = airportsInRegion(region, registry);
    return result(
      query,
      'region',
      matches,
      `Matched the ${region} region (${matches.length} airport${matches.length === 1 ? '' : 's'}).`,
      false,
    );
  }

  // 6. State name or 2-letter state code — a recognised state always resolves to kind "state".
  if (text in STATE_NAME_TO_CODE || (code.length === 2 && code in STATE_TO_REGION)) {
    const stateCode = STATE_NAME_TO_CODE[text] ?? code;
    const matches = airportsInState(stateCode, registry);
    return result(query, 'state', matches, `Matched the state of ${stateCode}.`, false);
  }

  // 7. Substring name/city matching (D-08, no typo tolerance)
  if (text.length >= 3) {
    const matches = registry.all.filter(
      (airport) => airport.name.toLowerCase().includes(text) || airport.city.toLowerCase().includes(text),
    );
    if (matches.length > 0) {
      return result(query, 'name', matches, null);
    }
  }

  // 8. No match
  return emptyResult(query, registry, text, code);
}
