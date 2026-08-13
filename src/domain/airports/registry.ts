/**
 * Two-stage fetch, ARPT_ID join, per-row validation, index construction, and
 * the boot singleton. Builds the in-memory canonical airport registry that
 * every later phase treats as its SSRF allowlist (SEC-02).
 */

import { z } from 'zod';
import { queryAllFeatures } from './fetchArcGis';
import { bearingDeg, deriveParallelGroups } from './geometry';
import { STATE_TO_REGION } from './regions';
import type { AirportRef, Registry, RunwaySummary } from './types';

const FACILITY_LAYER = 'NTAD_Aviation_Facilities';
const RUNWAY_LAYER = 'Runways_View';

export const FACILITY_WHERE =
  "FACILITY_USE_CODE='PU' AND FAR_139_TYPE_CODE IS NOT NULL AND FAR_139_TYPE_CODE<>'' AND STATE_CODE NOT IN ('PR','VI','GU','AS','MP','QM')";
// The <>'' clause is not optional: Esri text fields store "no value" as an empty
// string, so IS NOT NULL alone returns ~5,167 rows instead of ~500. STATE_CODE
// NOT IN excludes US territories per RESEARCH.md Open Question 1 — REQUIREMENTS.md
// scopes non-US airports out and no region in this registry could ever reach them.

export const FACILITY_FIELDS = 'ARPT_ID,ICAO_ID,ARPT_NAME,CITY,STATE_CODE,LAT_DECIMAL,LONG_DECIMAL';

export const RUNWAY_WHERE = "FACILITY_USE_CODE='PU'";
// The runway layer has no FAR_139_TYPE_CODE field at all — the join back to the
// facility ARPT_ID set below is what narrows it, never a where clause here.

export const RUNWAY_FIELDS =
  'ARPT_ID,RWY_ID,RWY_LEN,RWY_WIDTH,LAT1_DECIMAL,LONG1_DECIMAL,LAT2_DECIMAL,LONG2_DECIMAL,SURFACE_TYPE_CODE,COND';

const MAX_TEXT_LEN = 120;
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;
const MAX_DROP_RATIO = 0.05;

// Upstream ArcGIS text is untrusted input that later phases feed into both LLM
// context and the UI (T-01-16): trim, cap length, reject control characters.
function safeText(max = MAX_TEXT_LEN) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((v) => !CONTROL_CHAR_RE.test(v), { message: 'contains a control character' });
}

export const facilityRowSchema = z.object({
  ARPT_ID: safeText(10).min(1),
  ICAO_ID: safeText(10).min(1),
  ARPT_NAME: safeText(),
  CITY: safeText(),
  STATE_CODE: safeText(2).min(1),
  LAT_DECIMAL: z.coerce.number().finite().min(-90).max(90),
  LONG_DECIMAL: z.coerce.number().finite().min(-180).max(180),
});

export const runwayRowSchema = z.object({
  ARPT_ID: safeText(10).min(1),
  RWY_ID: safeText(20).min(1),
  RWY_LEN: z.coerce.number().finite(),
  RWY_WIDTH: z.coerce.number().finite(),
  LAT1_DECIMAL: z.coerce.number().finite().min(-90).max(90),
  LONG1_DECIMAL: z.coerce.number().finite().min(-180).max(180),
  LAT2_DECIMAL: z.coerce.number().finite().min(-90).max(90),
  LONG2_DECIMAL: z.coerce.number().finite().min(-180).max(180),
  SURFACE_TYPE_CODE: safeText(20).default(''),
  COND: safeText(20).default(''),
});

export class RegistryNotInitialisedError extends Error {
  constructor() {
    super(
      'Airport registry not initialised. Call initRegistry() (see src/instrumentation.ts register()) before getRegistry() — an empty registry would be an empty SSRF allowlist.',
    );
    this.name = 'RegistryNotInitialisedError';
  }
}

function assertDropRatioOk(layer: string, seen: number, dropped: number) {
  if (seen > 0 && dropped / seen > MAX_DROP_RATIO) {
    throw new Error(
      `${layer}: ${dropped}/${seen} rows dropped (>${MAX_DROP_RATIO * 100}%) — this looks like a schema change, not a bad record. Check the layer's live field list against the FIELDS constant.`,
    );
  }
}

export async function buildRegistry(signal?: AbortSignal): Promise<Registry> {
  const rawFacilities = await queryAllFeatures(FACILITY_LAYER, FACILITY_WHERE, FACILITY_FIELDS, signal);

  const facilities: z.infer<typeof facilityRowSchema>[] = [];
  let facilityDropped = 0;
  for (const row of rawFacilities) {
    const parsed = facilityRowSchema.safeParse(row);
    if (!parsed.success) {
      facilityDropped++;
      continue;
    }
    // Client-side guarantee behind the SQL STATE_CODE NOT IN clause — also
    // catches any future territory code the hardcoded SQL list doesn't name.
    if (!(parsed.data.STATE_CODE in STATE_TO_REGION)) {
      facilityDropped++;
      continue;
    }
    facilities.push(parsed.data);
  }
  assertDropRatioOk(FACILITY_LAYER, rawFacilities.length, facilityDropped);

  const arptIds = new Set(facilities.map((f) => f.ARPT_ID));

  const rawRunways = await queryAllFeatures(RUNWAY_LAYER, RUNWAY_WHERE, RUNWAY_FIELDS, signal);

  const runwaysByArptId = new Map<string, z.infer<typeof runwayRowSchema>[]>();
  let runwayDropped = 0;
  for (const row of rawRunways) {
    const parsed = runwayRowSchema.safeParse(row);
    if (!parsed.success) {
      runwayDropped++;
      continue;
    }
    if (!arptIds.has(parsed.data.ARPT_ID)) continue; // outside registry scope, not a data error
    const list = runwaysByArptId.get(parsed.data.ARPT_ID) ?? [];
    list.push(parsed.data);
    runwaysByArptId.set(parsed.data.ARPT_ID, list);
  }
  assertDropRatioOk(RUNWAY_LAYER, rawRunways.length, runwayDropped);

  const all: AirportRef[] = [];
  for (const facility of facilities) {
    const runwayRows = runwaysByArptId.get(facility.ARPT_ID) ?? [];
    if (runwayRows.length === 0) {
      // A commercial-service airport with no runway geometry is a data error, not
      // a valid registry entry.
      continue;
    }

    const runways: RunwaySummary[] = runwayRows.map((r) => ({
      id: r.RWY_ID,
      lengthFt: r.RWY_LEN,
      widthFt: r.RWY_WIDTH,
      surface: r.SURFACE_TYPE_CODE,
      condition: r.COND,
      headingDeg: bearingDeg(r.LAT1_DECIMAL, r.LONG1_DECIMAL, r.LAT2_DECIMAL, r.LONG2_DECIMAL) % 180,
      end1: { lat: r.LAT1_DECIMAL, lon: r.LONG1_DECIMAL },
      end2: { lat: r.LAT2_DECIMAL, lon: r.LONG2_DECIMAL },
    }));

    const parallelGroups = deriveParallelGroups(runways, facility.LAT_DECIMAL, facility.LONG_DECIMAL);

    all.push({
      // Native FAA value, verbatim — never "K" + iata. PANC/PHNL already arrive
      // correct from the source; synthesising the prefix is a known bug source.
      icao: facility.ICAO_ID,
      iata: facility.ARPT_ID, // D-02
      name: facility.ARPT_NAME,
      city: facility.CITY,
      state: facility.STATE_CODE,
      lat: facility.LAT_DECIMAL,
      lon: facility.LONG_DECIMAL,
      runwayCount: runways.length,
      runways: Object.freeze(runways) as RunwaySummary[],
      parallelGroups: Object.freeze(parallelGroups) as typeof parallelGroups,
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

  const byState = new Map<string, readonly AirportRef[]>();
  for (const [state, list] of byStateMutable) {
    byState.set(state, Object.freeze(list));
  }

  const registry: Registry = {
    byIcao: Object.freeze(byIcao),
    byIata: Object.freeze(byIata),
    byState: Object.freeze(byState),
    all: Object.freeze(all),
    fetchedAt: new Date().toISOString(),
  };

  return Object.freeze(registry);
}

let registryInstance: Registry | null = null;
let registryPromise: Promise<Registry> | null = null;

export async function initRegistry(signal?: AbortSignal): Promise<Registry> {
  if (registryInstance) return registryInstance;
  if (!registryPromise) {
    registryPromise = buildRegistry(signal)
      .then((registry) => {
        registryInstance = registry;
        return registry;
      })
      .catch((err) => {
        registryPromise = null; // allow a retry on the next call after a genuine failure
        throw err;
      });
  }
  return registryPromise;
}

export function getRegistry(): Registry {
  if (!registryInstance) {
    throw new RegistryNotInitialisedError();
  }
  return registryInstance;
}
