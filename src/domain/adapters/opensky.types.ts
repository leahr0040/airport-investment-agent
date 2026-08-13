export type FlightMovement = {
  icao24: string;
  callsign: string | null;
  firstSeen: number;
  lastSeen: number;
  estDepartureAirport: string | null;
  estArrivalAirport: string | null;
  departureAirportCandidatesCount: number | null;
  arrivalAirportCandidatesCount: number | null;
};

export type Movements = {
  icao: string;
  window: { begin: number; end: number; beginIso: string; endIso: string };
  departures: FlightMovement[];
  arrivals: FlightMovement[];
  departureCount: number;
  arrivalCount: number;
  unknownDestinationCount: number;
  unknownOriginCount: number;
};
