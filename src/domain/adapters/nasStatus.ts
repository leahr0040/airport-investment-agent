import 'server-only';
import { XMLParser } from 'fast-xml-parser';
import { nasStatusClient } from './nasStatus.client';
import type { AdapterResult } from './types';
import { isValidIcao, isValidIata } from './validate';
import { toAdapterFailure } from './errors';

// raw carries every other scalar field found on the matched entry - the ground-stop/ground-delay
// block schemas are only MEDIUM confidence (not observed live per CLAUDE.md), so unknown fields
// are preserved rather than dropped.
export type NasStatusEvent = {
  type: string;
  reason: string | null;
  start: string | null;
  reopen: string | null;
  raw: Record<string, string>;
};

export type NasStatus = {
  lid: string;
  icao: string;
  updateTime: string | null;
  events: NasStatusEvent[];
};

// parseTagValue:false keeps every extracted value a string - left at the library default, a
// clock value like "0900" would be coerced to a number and lose its leading zero.
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

function ensureArray<T>(maybe: T | T[] | undefined | null): T[] {
  if (maybe === undefined || maybe === null) return [];
  return Array.isArray(maybe) ? maybe : [maybe];
}

// US ICAO codes are a single country-prefix letter followed by the 3-letter FAA location
// identifier - KATL -> ATL, PANC -> ANC. Deriving from ICAO (not IATA) is deliberate: ICAO
// deterministically encodes the FAA LID via this prefix-strip rule, while IATA is not guaranteed
// to equal the FAA LID for every airport and regions.ts carries no separate IATA->LID mapping.
export function toFaaLid(icao: string): string {
  return icao.trim().toUpperCase().slice(1);
}

// Walks any nested object/array shape and collects every object carrying a matching ARPT field,
// regardless of which list wrapper (Airport_Closure_List, or an unknown/renamed block's own list)
// contains it, and regardless of whether the parser produced a single object or an array for a
// one-element list. This is what lets an unknown or newly-added Delay_type block still surface
// its events instead of requiring a hardcoded switch over the four documented block names.
function findMatchingEntries(node: unknown, lid: string): Record<string, unknown>[] {
  const matches: Record<string, unknown>[] = [];

  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const arpt = obj.ARPT;
      if (typeof arpt === 'string' && arpt.trim().toUpperCase() === lid) {
        matches.push(obj);
      }
      for (const key of Object.keys(obj)) {
        walk(obj[key]);
      }
    }
  }

  walk(node);
  return matches;
}

function toRawBag(entry: Record<string, unknown>, exclude: readonly string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (exclude.includes(key)) continue;
    if (typeof value === 'string') raw[key] = value;
  }
  return raw;
}

export async function fetchNasStatus(icao: string): Promise<AdapterResult<NasStatus>> {
  // Correctness-only here, not an injection control - the feed URL is a fixed constant with no
  // user-influenced component (unlike the OpenSky adapter's outbound URL).
  if (!isValidIcao(icao)) return { ok: false, reason: 'invalid_input' };

  const lid = toFaaLid(icao);
  if (!isValidIata(lid)) return { ok: false, reason: 'invalid_input' };

  try {
    const feedXml = await nasStatusClient.fetchCachedFeed();
    const parsed = parser.parse(feedXml) as { AIRPORT_STATUS_INFORMATION?: Record<string, unknown> };
    const root = parsed.AIRPORT_STATUS_INFORMATION ?? {};
    const updateTime = typeof root.Update_Time === 'string' ? root.Update_Time : null;

    // Treat a missing block as "no active event of that type," not a parse failure - not all
    // four documented block types are present at all times.
    const delayTypeBlocks = ensureArray(root.Delay_type as Record<string, unknown> | Record<string, unknown>[] | undefined);

    const events: NasStatusEvent[] = [];
    for (const block of delayTypeBlocks) {
      if (!block || typeof block !== 'object') continue;
      const typeName = typeof block.Name === 'string' ? block.Name : 'Unknown';

      for (const entry of findMatchingEntries(block, lid)) {
        events.push({
          type: typeName,
          reason: typeof entry.Reason === 'string' ? entry.Reason : null,
          start: typeof entry.Start === 'string' ? entry.Start : null,
          reopen: typeof entry.Reopen === 'string' ? entry.Reopen : null,
          raw: toRawBag(entry, ['ARPT', 'Reason', 'Start', 'Reopen']),
        });
      }
    }

    // An empty event list is the normal, healthy case - "nothing active at this airport" is a
    // real answer, not a no_data failure.
    const result: NasStatus = { lid, icao, updateTime, events };
    return { ok: true, data: result, fetchedAt: new Date().toISOString(), source: 'faa-nas-status' };
  } catch (err: unknown) {
    return toAdapterFailure(err, 'faa-nas-status');
  }
}
