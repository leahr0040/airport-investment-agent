import type { FlightMovement, Movements } from './opensky.types';
import type { AdapterResult } from './types';

// An empty window is a measured zero, not a failure - the HTTP status decides ok/fail
// (opensky.client.ts), never the payload's contents.
export function aggregateMovements(
  icao: string,
  window: { begin: number; end: number; beginIso: string; endIso: string },
  departuresRaw: Record<string, unknown>[],
  arrivalsRaw: Record<string, unknown>[],
  normalizeFn: (r: Record<string, unknown>) => FlightMovement,
): AdapterResult<Movements> {
  const departures: FlightMovement[] = departuresRaw.map(normalizeFn);
  const arrivals: FlightMovement[] = arrivalsRaw.map(normalizeFn);

  const movements: Movements = {
    icao,
    window,
    departures,
    arrivals,
    departureCount: departures.length,
    arrivalCount: arrivals.length,
    unknownDestinationCount: departures.filter((d) => d.estArrivalAirport == null).length,
    unknownOriginCount: arrivals.filter((a) => a.estDepartureAirport == null).length,
  };

  return { ok: true, data: movements, fetchedAt: new Date().toISOString(), source: 'opensky' };
}
