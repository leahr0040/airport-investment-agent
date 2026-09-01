import 'server-only';
import { XMLParser } from 'fast-xml-parser';
import { nasStatusClient } from './nasStatus.client';
import type { AdapterResult } from './types';
import { isValidIcao, isValidIata } from './validate';
import { toAdapterFailure } from './errors';

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

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

function ensureArray<T>(maybe: T | T[] | undefined | null): T[] {
  if (maybe === undefined || maybe === null) return [];
  return Array.isArray(maybe) ? maybe : [maybe];
}

export function toFaaLid(icao: string): string {
  return icao.trim().toUpperCase().slice(1);
}

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
  if (!isValidIcao(icao)) return { ok: false, reason: 'invalid_input' };

  const lid = toFaaLid(icao);
  if (!isValidIata(lid)) return { ok: false, reason: 'invalid_input' };

  try {
    const feedXml = await nasStatusClient.fetchCachedFeed();
    const parsed = parser.parse(feedXml) as { AIRPORT_STATUS_INFORMATION?: Record<string, unknown> };
    const root = parsed.AIRPORT_STATUS_INFORMATION ?? {};
    const updateTime = typeof root.Update_Time === 'string' ? root.Update_Time : null;

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

    const result: NasStatus = { lid, icao, updateTime, events };
    return { ok: true, data: result, fetchedAt: new Date().toISOString(), source: 'faa-nas-status' };
  } catch (err: unknown) {
    return toAdapterFailure(err, 'faa-nas-status');
  }
}
