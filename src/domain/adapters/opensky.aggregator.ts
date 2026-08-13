import type { FlightMovement, Movements } from './opensky.types';
import type { AdapterResult } from './types';

export function aggregateMovements(
  icao: string,
  window: { begin: number; end: number; beginIso: string; endIso: string },
  departuresRaw: Record<string, unknown>[] | undefined,
  arrivalsRaw: Record<string, unknown>[] | undefined,
  normalizeFn: (r: Record<string, unknown>) => FlightMovement,
): AdapterResult<Movements> {
  const departures: FlightMovement[] = (departuresRaw || []).map(normalizeFn);
  const arrivals: FlightMovement[] = (arrivalsRaw || []).map(normalizeFn);

  const departureCount = departures.length;
  const arrivalCount = arrivals.length;
  const unknownDestinationCount = departures.filter((d) => d.estArrivalAirport == null).length;
  const unknownOriginCount = arrivals.filter((a) => a.estDepartureAirport == null).length;

  if (departureCount === 0 && arrivalCount === 0) {
    return { ok: false, reason: 'no_data' } as AdapterResult<Movements>;
  }

  const movements: Movements = {
    icao,
    window,
    departures,
    arrivals,
    departureCount,
    arrivalCount,
    unknownDestinationCount,
    unknownOriginCount,
  };

  return { ok: true, data: movements, fetchedAt: new Date().toISOString(), source: 'opensky' };
}
