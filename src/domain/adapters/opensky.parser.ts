import type { FlightMovement } from './opensky.types';
import { OPENSKY_BUCKET_SECONDS } from './cache';

type RawFlightRecord = Record<string, unknown>;

export function normalizeFlight(record: RawFlightRecord): FlightMovement {
  return {
    icao24: record.icao24 as string,
    callsign: (record.callsign as string | null | undefined) ?? null,
    firstSeen: record.firstSeen as number,
    lastSeen: record.lastSeen as number,
    estDepartureAirport: (record.estDepartureAirport as string | null | undefined) ?? null,
    estArrivalAirport: (record.estArrivalAirport as string | null | undefined) ?? null,
    departureAirportCandidatesCount: (record.departureAirportCandidatesCount as number | null | undefined) ?? null,
    arrivalAirportCandidatesCount: (record.arrivalAirportCandidatesCount as number | null | undefined) ?? null,
  };
}

export function buildWindow(): { begin: number; end: number; beginIso: string; endIso: string } {
  const nowSec = Math.floor(Date.now() / 1000);
  const end = Math.floor(nowSec / OPENSKY_BUCKET_SECONDS) * OPENSKY_BUCKET_SECONDS;
  const begin = end - 86400;
  return { begin, end, beginIso: new Date(begin * 1000).toISOString(), endIso: new Date(end * 1000).toISOString() };
}
