/**
 * Shared airport domain contracts. Types only — no runtime logic.
 *
 * Plans 01-03 (resolution) and 01-04 (registry fetch) are written against this
 * file in parallel so neither invents its own shapes or waits on the other.
 */

/** One physical runway strip, as derived from the FAA ArcGIS Runways_View feature layer. */
export interface RunwaySummary {
  /** FAA `RWY_ID`, e.g. "08L/26R". */
  id: string;
  lengthFt: number;
  widthFt: number;
  surface: string;
  condition: string;
  /** Normalised to the 0-180 half-circle so a strip and its reciprocal share one heading. */
  headingDeg: number;
  end1: { lat: number; lon: number };
  end2: { lat: number; lon: number };
}

/** A set of runways sharing (approximately) one heading, e.g. parallel departure strips. */
export interface ParallelGroup {
  headingDeg: number;
  runwayIds: string[];
  /** null when the group holds a single runway (no separation to measure). */
  separationMeters: number | null;
}

/** A single US airport, keyed by both ICAO and IATA/FAA-LID identifiers. */
export interface AirportRef {
  /** FAA `ICAO_ID` verbatim — Alaska/Hawaii carry PANC/PHNL natively, never derived by prefixing K. */
  icao: string;
  /** FAA `ARPT_ID`, used directly as the IATA code (per D-02). */
  iata: string;
  name: string;
  city: string;
  /** 2-letter FAA `STATE_CODE`. */
  state: string;
  lat: number;
  lon: number;
  runwayCount: number;
  runways: RunwaySummary[];
  parallelGroups: ParallelGroup[];
}

/**
 * The fetched-and-indexed airport dataset.
 *
 * Deliberately no `byRegion` member: region lookup is derived in the resolver from
 * `byState` plus the state-to-region table, keeping region definitions (D-03/D-04/D-05)
 * inside the resolution layer and letting plans 01-03 and 01-04 be written in parallel.
 * This is the planner's answer to CONTEXT.md's "internal registry data structure"
 * discretion item.
 */
export interface Registry {
  byIcao: ReadonlyMap<string, AirportRef>;
  byIata: ReadonlyMap<string, AirportRef>;
  byState: ReadonlyMap<string, readonly AirportRef[]>;
  all: readonly AirportRef[];
  /** ISO-8601 timestamp of when the registry was fetched. */
  fetchedAt: string;
}

/** The nine US regions used for fuzzy location resolution (D-03). */
export type RegionName =
  | 'New England'
  | 'Mid-Atlantic'
  | 'South'
  | 'Midwest'
  | 'Southwest'
  | 'Mountain West'
  | 'Pacific'
  | 'Alaska'
  | 'Hawaii';

/** How a query resolved to one or more airports. */
export type MatchKind =
  | 'icao'
  | 'iata'
  | 'alias'
  | 'name'
  | 'state'
  | 'region'
  | 'metro'
  | 'none';

/** Result of resolving a caller's raw location query to zero or more airports. */
export interface ResolveResult {
  /** The caller's raw input, echoed back. */
  query: string;
  kind: MatchKind;
  matches: readonly AirportRef[];
  /** True when the caller must choose between several equally valid candidates (D-07/RESOLVE-04). */
  ambiguous: boolean;
  /** A human-readable note explaining a non-obvious match (e.g. a legacy-code alias or a metro-cluster expansion); null when the match was direct. */
  matchedVia: string | null;
  /** Populated only when kind is "none" (D-07) — a miss returns an empty result plus nearest candidates, never a thrown exception. */
  suggestions: readonly AirportRef[];
}
