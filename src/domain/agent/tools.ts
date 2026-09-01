import { regionKeys, lookupAirports } from '@/domain/airports/regions';
import { buildScoringInputs } from '@/domain/scoring/buildScoringInputs';
import { scoreAirports, type ExpansionScore } from '@/domain/scoring/expansionScore';
import { fetchMovements } from '@/domain/adapters/opensky';
import type { Movements } from '@/domain/adapters/opensky.types';
import { fetchFaaFacility, type RunwayGeometry } from '@/domain/adapters/faaFacility';
import { fetchNasStatus, type NasStatusEvent } from '@/domain/adapters/nasStatus';
import { isValidIcao } from '@/domain/adapters/validate';
import { FailureKind } from '@/domain/adapters/types';

export const TOOL_DECLARATIONS = [
  {
    name: 'resolve_region',
    description:
      'Resolve a named US region or metro area to its airport ICAO codes. Only for named regions/metros - not for airports already identified by name or code.',
    parametersJsonSchema: {
      type: 'object',
      properties: { region: { type: 'string', enum: regionKeys() } },
      required: ['region'],
    },
  },
  {
    name: 'score_airports',
    description: 'Compute expansion-opportunity scores for one or more airports, given their 4-letter ICAO codes.',
    parametersJsonSchema: {
      type: 'object',
      properties: { icaos: { type: 'array', items: { type: 'string' } } },
      required: ['icaos'],
    },
  },
  {
    name: 'flight_destinations',
    description:
      'Get real, code-fetched arrival-airport ICAO codes for an airport\'s recent departures, given their 4-letter ICAO codes. Any long-haul/short-haul classification made from these codes is the model\'s own estimate, not a code-computed value.',
    parametersJsonSchema: {
      type: 'object',
      properties: { icaos: { type: 'array', items: { type: 'string' } } },
      required: ['icaos'],
    },
  },
  {
    name: 'runway_conditions',
    description:
      'Get real, code-fetched runway endpoint coordinates and classified/sanitized delay events for an airport, given their 4-letter ICAO codes. Any runway separation or grouping judgment made from these coordinates is the model\'s own estimate, not a code-computed value.',
    parametersJsonSchema: {
      type: 'object',
      properties: { icaos: { type: 'array', items: { type: 'string' } } },
      required: ['icaos'],
    },
  },
] as const;

export type ToolName = (typeof TOOL_DECLARATIONS)[number]['name'];

export async function resolveRegion(args: { region: string }): Promise<{ icaos: string[] }> {
  return { icaos: lookupAirports(args.region).map((match) => match.icao) };
}

export async function scoreAirportsTool(args: { icaos: string[] }): Promise<{ scores: ExpansionScore[] }> {
  const inputs = await buildScoringInputs(args.icaos ?? []);
  return { scores: scoreAirports(inputs) };
}

function uniqueIcaos(icaos: string[]): string[] {
  return Array.from(new Set((icaos ?? []).map((code) => code.trim().toUpperCase())));
}

export type FlightDestinationsResult =
  | {
      icao: string;
      available: true;
      window: Movements['window'];
      destinations: string[];
      unknownDestinationCount: number;
      totalDepartures: number;
    }
  | { icao: string; available: false; kind: FailureKind };

export async function flightDestinationsTool(args: { icaos: string[] }): Promise<{ results: FlightDestinationsResult[] }> {
  const icaos = uniqueIcaos(args.icaos);

  const results = await Promise.all(
    icaos.map(async (icao): Promise<FlightDestinationsResult> => {
      const movements = await fetchMovements(icao);
      if (!movements.ok) return { icao, available: false, kind: movements.kind };

      const destinations = movements.data.departures
        .map((d) => d.estArrivalAirport)
        .filter((code): code is string => code !== null && isValidIcao(code));

      return {
        icao,
        available: true,
        window: movements.data.window,
        destinations,
        unknownDestinationCount: movements.data.unknownDestinationCount,
        totalDepartures: movements.data.departureCount,
      };
    }),
  );

  return { results };
}

export type DelayCategory = 'closure' | 'ground_stop' | 'ground_delay' | 'arrival_departure_delay' | 'other';

export function classifyDelayType(rawType: string): DelayCategory {
  const lower = rawType.toLowerCase();
  if (lower.includes('closure')) return 'closure';
  if (lower.includes('ground stop')) return 'ground_stop';
  if (lower.includes('ground delay')) return 'ground_delay';
  if (lower.includes('delay')) return 'arrival_departure_delay';
  return 'other';
}

const TIMESTAMP_ALLOWLIST = /^[0-9TZ:\-/ ]+$/;

export function sanitizeTimestampLike(value: string | null): string | null {
  if (value === null) return null;
  return TIMESTAMP_ALLOWLIST.test(value) ? value : null;
}

export type DelayEventSummary = { category: DelayCategory; start: string | null; reopen: string | null };

function toDelayEventSummary(e: NasStatusEvent): DelayEventSummary {
  return {
    category: classifyDelayType(e.type),
    start: sanitizeTimestampLike(e.start),
    reopen: sanitizeTimestampLike(e.reopen),
  };
}

export type RunwayConditionsResult = {
  icao: string;
  runways: RunwayGeometry[] | null;
  runwaysKind: FailureKind | null;
  delayEvents: DelayEventSummary[] | null;
  delayEventsKind: FailureKind | null;
};

export async function runwayConditionsTool(args: { icaos: string[] }): Promise<{ results: RunwayConditionsResult[] }> {
  const icaos = uniqueIcaos(args.icaos);

  const results = await Promise.all(
    icaos.map(async (icao): Promise<RunwayConditionsResult> => {
      const [facility, nasStatus] = await Promise.all([fetchFaaFacility(icao), fetchNasStatus(icao)]);

      return {
        icao,
        runways: facility.ok ? facility.data.runways : null,
        runwaysKind: facility.ok ? null : facility.kind,
        delayEvents: nasStatus.ok ? nasStatus.data.events.map(toDelayEventSummary) : null,
        delayEventsKind: nasStatus.ok ? null : nasStatus.kind,
      };
    }),
  );

  return { results };
}

export const TOOL_HANDLERS: Record<ToolName, (args: never) => Promise<unknown>> = {
  resolve_region: resolveRegion as (args: never) => Promise<unknown>,
  score_airports: scoreAirportsTool as (args: never) => Promise<unknown>,
  flight_destinations: flightDestinationsTool as (args: never) => Promise<unknown>,
  runway_conditions: runwayConditionsTool as (args: never) => Promise<unknown>,
};
