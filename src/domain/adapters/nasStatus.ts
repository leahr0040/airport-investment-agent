import 'server-only';
import { XMLParser } from 'fast-xml-parser';
import { nasStatusClient } from './nasStatus.client';
import type { AdapterResult } from './types';
import { isValidIcao, isValidIata } from './validate';
import { toAdapterFailure } from './errors';
import { FailReason } from './types';

export type NasStatusEvent = {
  type: string;
  reason: string | null;
  start: string | null;
  reopen: string | null;
  raw: Record<string, unknown>;
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
  if (Array.isArray(node)) return node.flatMap((child) => findMatchingEntries(child, lid));
  if (!node || typeof node !== 'object') return [];

  const obj = node as Record<string, unknown>;
  const arpt = obj.ARPT;
  const self = typeof arpt === 'string' && arpt.trim().toUpperCase() === lid ? [obj] : [];

  return [...self, ...Object.values(obj).flatMap((child) => findMatchingEntries(child, lid))];
}

const FIELDS_WITH_TYPED_PROPERTIES = ['ARPT', 'Reason', 'Start', 'Reopen'];

export async function fetchNasStatus(icao: string): Promise<AdapterResult<NasStatus>> {
  if (!isValidIcao(icao)) return { ok: false, reason: FailReason.InvalidInput };

  const lid = toFaaLid(icao);
  if (!isValidIata(lid)) return { ok: false, reason: FailReason.InvalidInput };

  try {
    const feedXml = await nasStatusClient.fetchCachedFeed();
    const parsed = parser.parse(feedXml) as { AIRPORT_STATUS_INFORMATION?: Record<string, unknown> };
    const root = parsed.AIRPORT_STATUS_INFORMATION ?? {};
    const updateTime = typeof root.Update_Time === 'string' ? root.Update_Time : null;

    const delayTypeBlocks = ensureArray(root.Delay_type as Record<string, unknown> | Record<string, unknown>[] | undefined);

    const events: NasStatusEvent[] = delayTypeBlocks
      .filter((block) => block && typeof block === 'object')
      .flatMap((block) => {
        const typeName = typeof block.Name === 'string' ? block.Name : 'Unknown';

        return findMatchingEntries(block, lid).map((entry) => ({
          type: typeName,
          reason: typeof entry.Reason === 'string' ? entry.Reason : null,
          start: typeof entry.Start === 'string' ? entry.Start : null,
          reopen: typeof entry.Reopen === 'string' ? entry.Reopen : null,
          raw: Object.fromEntries(
            Object.entries(entry).filter(([fieldName]) => !FIELDS_WITH_TYPED_PROPERTIES.includes(fieldName)),
          ),
        }));
      });

    const result: NasStatus = { lid, icao, updateTime, events };
    return { ok: true, data: result, fetchedAt: new Date().toISOString(), source: 'faa-nas-status' };
  } catch (err: unknown) {
    return toAdapterFailure(err, 'faa-nas-status');
  }
}
