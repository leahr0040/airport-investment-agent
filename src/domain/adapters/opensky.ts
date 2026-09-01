import 'server-only';
import { withCache, OPENSKY_TTL_MS } from './cache';
import { FailureKind, type AdapterResult } from './types';
import type { Movements } from './opensky.types';
import { isValidIcao } from './validate';
import { toAdapterFailure } from './errors';
import { openskyClient } from './opensky.client';
import { normalizeFlight, buildWindow } from './opensky.parser';
import { aggregateMovements } from './opensky.aggregator';

export function clearTokenCache(): void {
  openskyClient.clearTokenCache();
}

export async function fetchMovements(icao: string): Promise<AdapterResult<Movements>> {
  if (!isValidIcao(icao)) return { ok: false, kind: FailureKind.InvalidInput };

  try {
    const window = buildWindow();
    const key = `opensky:${icao}:${window.begin}:${window.end}`;

    return await withCache(key, OPENSKY_TTL_MS, async () => {
      const token = await openskyClient.ensureToken();

      const [departuresRaw, arrivalsRaw] = await Promise.all([
        openskyClient.fetchFlightLeg(icao, 'departure', window, token),
        openskyClient.fetchFlightLeg(icao, 'arrival', window, token),
      ]);

      return aggregateMovements(icao, window, departuresRaw, arrivalsRaw, normalizeFlight);
    });
  } catch (err: unknown) {
    return toAdapterFailure(err, 'opensky');
  }
}
