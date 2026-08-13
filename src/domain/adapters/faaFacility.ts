import 'server-only';
import { withCache, FAA_FACILITY_TTL_MS } from './cache';
import { faaFacilityClient } from './faaFacility.client';
import type { AdapterResult } from './types';
import { isValidIcao, isValidIata } from './validate';
import { toAdapterFailure } from './errors';

export type RunwayEndpoint = { lat: number; lon: number };

export type RunwayGeometry = {
  runwayId: string;
  lengthFt: number | null;
  widthFt: number | null;
  end1: RunwayEndpoint | null;
  end2: RunwayEndpoint | null;
};

export type FaaFacility = {
  icao: string;
  faaLid: string;
  name: string;
  lat: number | null;
  lon: number | null;
  facilityUseCode: string | null;
  far139TypeCode: string | null;
  runways: RunwayGeometry[];
};

function toFiniteOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchFaaFacility(icao: string): Promise<AdapterResult<FaaFacility>> {
  if (!isValidIcao(icao)) return { ok: false, reason: 'invalid_input' };

  const key = `faa-facility:${icao}`;
  try {
    return await withCache<AdapterResult<FaaFacility>>(key, FAA_FACILITY_TTL_MS, async () => {
      // facility rows
      const facilityRows = await faaFacilityClient.fetchFacilityRows(icao);
      if (!facilityRows || facilityRows.length === 0) return { ok: false, reason: 'no_data' };

      const first = facilityRows[0];
      const rawArpt = typeof first.ARPT_ID === 'string' ? first.ARPT_ID.trim().toUpperCase() : '';
      if (!isValidIata(rawArpt)) return { ok: false, reason: 'error' };

      const runwayRows = await faaFacilityClient.fetchRunwayRows(rawArpt);

      const runways = (runwayRows ?? []).map((r) => {
        const runwayId = typeof r.RWY_ID === 'string' ? r.RWY_ID : String(r.RWY_ID ?? '');
        const lengthFt = toFiniteOrNull(r.RWY_LEN);
        const widthFt = toFiniteOrNull(r.RWY_WIDTH);

        const lat1 = toFiniteOrNull(r.LAT1_DECIMAL);
        const lon1 = toFiniteOrNull(r.LONG1_DECIMAL);
        const lat2 = toFiniteOrNull(r.LAT2_DECIMAL);
        const lon2 = toFiniteOrNull(r.LONG2_DECIMAL);

        const end1 = lat1 === null || lon1 === null ? null : { lat: lat1, lon: lon1 };
        const end2 = lat2 === null || lon2 === null ? null : { lat: lat2, lon: lon2 };

        return {
          runwayId,
          lengthFt,
          widthFt,
          end1,
          end2,
        } as RunwayGeometry;
      });

      const result: FaaFacility = {
        icao,
        faaLid: rawArpt,
        name: typeof first.ARPT_NAME === 'string' && first.ARPT_NAME.length > 0 ? first.ARPT_NAME : '',
        lat: toFiniteOrNull(first.LAT_DECIMAL),
        lon: toFiniteOrNull(first.LONG_DECIMAL),
        facilityUseCode: typeof first.FACILITY_USE_CODE === 'string' && first.FACILITY_USE_CODE.length > 0 ? first.FACILITY_USE_CODE : null,
        far139TypeCode: typeof first.FAR_139_TYPE_CODE === 'string' && first.FAR_139_TYPE_CODE.length > 0 ? first.FAR_139_TYPE_CODE : null,
        runways,
      };

      return { ok: true, data: result, fetchedAt: new Date().toISOString(), source: 'faa-adip' };
    });
  } catch (err: unknown) {
    return toAdapterFailure(err, 'faa-adip');
  }
}
