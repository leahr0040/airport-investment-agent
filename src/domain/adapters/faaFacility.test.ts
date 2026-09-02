import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { axiosResponse } from '@test/helpers/axios';
import { clearCache } from './cache';
import { fetchFaaFacility } from './faaFacility';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

function facilityFeature(overrides: Record<string, unknown> = {}) {
  return {
    features: [
      {
        attributes: {
          ARPT_ID: 'ATL',
          ICAO_ID: 'KATL',
          ARPT_NAME: 'Hartsfield-Jackson Atlanta International',
          LAT_DECIMAL: 33.6367,
          LONG_DECIMAL: -84.4281,
          FACILITY_USE_CODE: 'PU',
          FAR_139_TYPE_CODE: 'I E',
          ...overrides,
        },
      },
    ],
  };
}

function runwayFeatures(rows: Record<string, unknown>[]) {
  return { features: rows.map((attributes) => ({ attributes })) };
}

const TWO_RUNWAYS = runwayFeatures([
  {
    RWY_ID: '08L/26R',
    RWY_LEN: 9000,
    RWY_WIDTH: 150,
    LAT1_DECIMAL: 33.63,
    LONG1_DECIMAL: -84.43,
    LAT2_DECIMAL: 33.65,
    LONG2_DECIMAL: -84.41,
  },
  {
    RWY_ID: '08R/26L',
    RWY_LEN: 9001,
    RWY_WIDTH: 150,
    LAT1_DECIMAL: 33.64,
    LONG1_DECIMAL: -84.44,
    LAT2_DECIMAL: 33.66,
    LONG2_DECIMAL: -84.42,
  },
]);

describe('FAA Facility adapter (fetchFaaFacility)', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    clearCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects malformed codes before any network call', async () => {
    await expect(fetchFaaFacility('atl')).resolves.toMatchObject({ ok: false, kind: 'invalid_input' });
    await expect(fetchFaaFacility('ATL')).resolves.toMatchObject({ ok: false, kind: 'invalid_input' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(0);
  });

  it('happy path resolves runway count/length and facility identity', async () => {
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, facilityFeature()));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, TWO_RUNWAYS));

    const res = await fetchFaaFacility('KATL');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok result');
    expect(res.source).toBe('faa-adip');
    expect(new Date(res.fetchedAt).toString()).not.toBe('Invalid Date');
    expect(res.data.faaLid).toBe('ATL');
    expect(res.data.icao).toBe('KATL');
    expect(res.data.runways).toHaveLength(2);
  });

  it('parses null/undefined ArcGIS numeric fields to null, never 0 or a fabricated coordinate', async () => {
    mockedAxios.get.mockResolvedValueOnce(
      axiosResponse(200, facilityFeature({ LAT_DECIMAL: null, LONG_DECIMAL: null })),
    );
    mockedAxios.get.mockResolvedValueOnce(
      axiosResponse(
        200,
        runwayFeatures([
          {
            RWY_ID: '08L/26R',
            RWY_LEN: null,
            RWY_WIDTH: undefined,
            LAT1_DECIMAL: null,
            LONG1_DECIMAL: null,
            LAT2_DECIMAL: undefined,
            LONG2_DECIMAL: undefined,
          },
        ]),
      ),
    );

    const res = await fetchFaaFacility('KATL');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok result');
    expect(res.data.lat).toBeNull();
    expect(res.data.lon).toBeNull();
    expect(res.data.runways[0].lengthFt).toBeNull();
    expect(res.data.runways[0].widthFt).toBeNull();
    expect(res.data.runways[0].end1).toBeNull();
    expect(res.data.runways[0].end2).toBeNull();
  });

  it('returns no_data with no runway query when the facility result is empty', async () => {
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, { features: [] }));

    const res = await fetchFaaFacility('KXXX');
    expect(res).toMatchObject({ ok: false, kind: 'no_data' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['timeout', () => Promise.reject(Object.assign(new Error('aborted'), { code: 'ECONNABORTED' }))],
    ['rate_limited', () => Promise.resolve(axiosResponse(429, {}))],
  ])('collapses a %s upstream failure on the facility GET to unavailable', async (_label, mockImpl) => {
    mockedAxios.get.mockImplementationOnce(mockImpl as never);

    const res = await fetchFaaFacility('KATL');
    expect(res).toMatchObject({ ok: false, kind: 'unavailable' });
  });

  it('never caches a no_data failure result: two consecutive lookups both hit the network', async () => {
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, { features: [] }));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, { features: [] }));

    await fetchFaaFacility('KXXX');
    await fetchFaaFacility('KXXX');

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('still caches a genuine ok:true success: two consecutive lookups hit the network only once', async () => {
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, facilityFeature()));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, TWO_RUNWAYS));

    await fetchFaaFacility('KATL');
    await fetchFaaFacility('KATL');

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });
});
