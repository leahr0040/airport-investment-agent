import 'server-only';
import { withCache, OPENSKY_TTL_MS } from './cache';
import type { AdapterResult } from './types';
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
  if (!isValidIcao(icao)) return { ok: false, reason: 'invalid_input' };

  try {
    const window = buildWindow();
    const key = `opensky:${icao}:${window.begin}:${window.end}`;

    return await withCache(key, OPENSKY_TTL_MS, async () => {
      const token = await openskyClient.ensureToken();
      const departureUrl = openskyClient.buildFlightsUrl(icao, 'departure', { begin: window.begin, end: window.end });
      const arrivalUrl = openskyClient.buildFlightsUrl(icao, 'arrival', { begin: window.begin, end: window.end });

      const [departuresRaw, arrivalsRaw] = await Promise.all([
        openskyClient.requestLegUrl(departureUrl, token),
        openskyClient.requestLegUrl(arrivalUrl, token),
      ]);

      return aggregateMovements(icao, window, departuresRaw, arrivalsRaw, normalizeFlight);
    });
  } catch (err: unknown) {
    return toAdapterFailure(err, 'opensky');
  }
}
