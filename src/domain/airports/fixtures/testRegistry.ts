/**
 * Hand-built Registry fixture covering every airport later tasks/tests in this
 * phase (and plan 01-04) depend on. Not wired to any live data source.
 */

import type { AirportRef, Registry } from '../types';

interface AirportTuple {
  iata: string;
  icao: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

const AIRPORT_TUPLES: AirportTuple[] = [
  { iata: 'ATL', icao: 'KATL', name: 'Hartsfield Jackson Atlanta Intl', city: 'Atlanta', state: 'GA', lat: 33.6407, lon: -84.4277 },
  { iata: 'BOS', icao: 'KBOS', name: 'Boston Logan Intl', city: 'Boston', state: 'MA', lat: 42.3656, lon: -71.0096 },
  { iata: 'BDL', icao: 'KBDL', name: 'Bradley Intl', city: 'Windsor Locks', state: 'CT', lat: 41.9389, lon: -72.6832 },
  { iata: 'PWM', icao: 'KPWM', name: 'Portland Intl Jetport', city: 'Portland', state: 'ME', lat: 43.6462, lon: -70.3093 },
  { iata: 'LAX', icao: 'KLAX', name: 'Los Angeles Intl', city: 'Los Angeles', state: 'CA', lat: 33.9425, lon: -118.408 },
  { iata: 'BUR', icao: 'KBUR', name: 'Hollywood Burbank', city: 'Burbank', state: 'CA', lat: 34.2007, lon: -118.3585 },
  { iata: 'LGB', icao: 'KLGB', name: 'Long Beach', city: 'Long Beach', state: 'CA', lat: 33.8177, lon: -118.1516 },
  { iata: 'SNA', icao: 'KSNA', name: 'John Wayne', city: 'Santa Ana', state: 'CA', lat: 33.6757, lon: -117.8682 },
  { iata: 'ONT', icao: 'KONT', name: 'Ontario Intl', city: 'Ontario', state: 'CA', lat: 34.056, lon: -117.6012 },
  { iata: 'JFK', icao: 'KJFK', name: 'John F Kennedy Intl', city: 'New York', state: 'NY', lat: 40.6413, lon: -73.7781 },
  { iata: 'LGA', icao: 'KLGA', name: 'LaGuardia', city: 'New York', state: 'NY', lat: 40.7769, lon: -73.874 },
  { iata: 'EWR', icao: 'KEWR', name: 'Newark Liberty Intl', city: 'Newark', state: 'NJ', lat: 40.6895, lon: -74.1745 },
  { iata: 'SFO', icao: 'KSFO', name: 'San Francisco Intl', city: 'San Francisco', state: 'CA', lat: 37.6213, lon: -122.379 },
  { iata: 'OAK', icao: 'KOAK', name: 'Oakland Intl', city: 'Oakland', state: 'CA', lat: 37.7213, lon: -122.2207 },
  { iata: 'SJC', icao: 'KSJC', name: 'Norman Y Mineta San Jose Intl', city: 'San Jose', state: 'CA', lat: 37.3639, lon: -121.929 },
  { iata: 'DCA', icao: 'KDCA', name: 'Ronald Reagan Washington National', city: 'Arlington', state: 'VA', lat: 38.8512, lon: -77.0402 },
  { iata: 'IAD', icao: 'KIAD', name: 'Washington Dulles Intl', city: 'Dulles', state: 'VA', lat: 38.9531, lon: -77.4565 },
  { iata: 'BWI', icao: 'KBWI', name: 'Baltimore Washington Intl', city: 'Baltimore', state: 'MD', lat: 39.1774, lon: -76.6684 },
  { iata: 'ORD', icao: 'KORD', name: 'Chicago O Hare Intl', city: 'Chicago', state: 'IL', lat: 41.9742, lon: -87.9073 },
  { iata: 'MDW', icao: 'KMDW', name: 'Chicago Midway Intl', city: 'Chicago', state: 'IL', lat: 41.7868, lon: -87.7522 },
  { iata: 'MIA', icao: 'KMIA', name: 'Miami Intl', city: 'Miami', state: 'FL', lat: 25.7959, lon: -80.287 },
  { iata: 'FLL', icao: 'KFLL', name: 'Fort Lauderdale Hollywood Intl', city: 'Fort Lauderdale', state: 'FL', lat: 26.0726, lon: -80.1527 },
  { iata: 'DJT', icao: 'KDJT', name: 'President Donald J Trump Intl', city: 'West Palm Beach', state: 'FL', lat: 26.6832, lon: -80.0956 },
  { iata: 'ANC', icao: 'PANC', name: 'Ted Stevens Anchorage Intl', city: 'Anchorage', state: 'AK', lat: 61.1743, lon: -149.9963 },
  { iata: 'HNL', icao: 'PHNL', name: 'Daniel K Inouye Intl', city: 'Honolulu', state: 'HI', lat: 21.3245, lon: -157.9251 },
  { iata: 'DFW', icao: 'KDFW', name: 'Dallas Fort Worth Intl', city: 'Dallas', state: 'TX', lat: 32.8998, lon: -97.0403 },
  { iata: 'IAH', icao: 'KIAH', name: 'George Bush Intercontinental', city: 'Houston', state: 'TX', lat: 29.9902, lon: -95.3368 },
  { iata: 'AUS', icao: 'KAUS', name: 'Austin Bergstrom Intl', city: 'Austin', state: 'TX', lat: 30.1975, lon: -97.6664 },
  { iata: 'SEA', icao: 'KSEA', name: 'Seattle Tacoma Intl', city: 'Seattle', state: 'WA', lat: 47.4502, lon: -122.3088 },
  { iata: 'PDX', icao: 'KPDX', name: 'Portland Intl', city: 'Portland', state: 'OR', lat: 45.5898, lon: -122.5951 },
];

const FIXED_FETCHED_AT = '2026-08-12T00:00:00.000Z';

function toAirportRef(tuple: AirportTuple): AirportRef {
  return {
    icao: tuple.icao,
    iata: tuple.iata,
    name: tuple.name,
    city: tuple.city,
    state: tuple.state,
    lat: tuple.lat,
    lon: tuple.lon,
    runwayCount: 1,
    runways: [],
    parallelGroups: [],
  };
}

/**
 * Builds a Registry from the fixed tuple list above, optionally merged with
 * caller-supplied extra AirportRef fragments (defaults filled from a base
 * template so partial overrides are convenient in individual tests).
 */
export function makeTestRegistry(extra: Partial<AirportRef>[] = []): Registry {
  const all: AirportRef[] = AIRPORT_TUPLES.map(toAirportRef);

  for (const partial of extra) {
    all.push({
      icao: partial.icao ?? '',
      iata: partial.iata ?? '',
      name: partial.name ?? '',
      city: partial.city ?? '',
      state: partial.state ?? '',
      lat: partial.lat ?? 0,
      lon: partial.lon ?? 0,
      runwayCount: partial.runwayCount ?? 1,
      runways: partial.runways ?? [],
      parallelGroups: partial.parallelGroups ?? [],
    });
  }

  const byIcao = new Map<string, AirportRef>();
  const byIata = new Map<string, AirportRef>();
  const byStateMutable = new Map<string, AirportRef[]>();

  for (const airport of all) {
    byIcao.set(airport.icao, airport);
    byIata.set(airport.iata, airport);
    const forState = byStateMutable.get(airport.state) ?? [];
    forState.push(airport);
    byStateMutable.set(airport.state, forState);
  }

  const byState = new Map<string, readonly AirportRef[]>(byStateMutable);

  return {
    byIcao,
    byIata,
    byState,
    all,
    fetchedAt: FIXED_FETCHED_AT,
  };
}
