import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { axiosResponse, econnaborted } from '@test/helpers/axios';
import { FaaFacilityClient } from './faaFacility.client';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

function requestedUrl(callIndex = 0): string {
  return decodeURIComponent(mockedAxios.get.mock.calls[callIndex][0]);
}

describe('FaaFacilityClient', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it('fetchFacilityRows builds the NTAD_Aviation_Facilities query and returns attributes on success', async () => {
    mockedAxios.get.mockResolvedValue(
      axiosResponse(200, { features: [{ attributes: { ARPT_ID: 'ATL', ICAO_ID: 'KATL' } }] }),
    );

    const rows = await new FaaFacilityClient().fetchFacilityRows('KATL');

    expect(rows).toEqual([{ ARPT_ID: 'ATL', ICAO_ID: 'KATL' }]);
    const decoded = requestedUrl();
    expect(decoded).toContain('NTAD_Aviation_Facilities');
    expect(decoded).toContain("where=ICAO_ID='KATL'");
    expect(decoded).toContain('f=json');
    expect(decoded).toContain('returnGeometry=false');
  });

  it('fetchRunwayRows builds the Runways_View query and returns attributes for two features', async () => {
    mockedAxios.get.mockResolvedValue(
      axiosResponse(200, {
        features: [
          { attributes: { ARPT_ID: 'ATL', RWY_ID: '08L/26R' } },
          { attributes: { ARPT_ID: 'ATL', RWY_ID: '08R/26L' } },
        ],
      }),
    );

    const rows = await new FaaFacilityClient().fetchRunwayRows('ATL');

    expect(rows).toEqual([
      { ARPT_ID: 'ATL', RWY_ID: '08L/26R' },
      { ARPT_ID: 'ATL', RWY_ID: '08R/26L' },
    ]);
    const decoded = requestedUrl();
    expect(decoded).toContain('Runways_View');
    expect(decoded).toContain("where=ARPT_ID='ATL'");
  });

  it('resolves to an empty array (not a throw) when a valid query has zero matching features', async () => {
    mockedAxios.get.mockResolvedValue(axiosResponse(200, { features: [] }));

    await expect(new FaaFacilityClient().fetchFacilityRows('KXXX')).resolves.toEqual([]);
  });

  it('rejects with reason error when ArcGIS embeds an error object in an HTTP 200 body', async () => {
    mockedAxios.get.mockResolvedValue(
      axiosResponse(200, { error: { code: 400, message: 'Unable to complete operation.' } }),
    );

    await expect(new FaaFacilityClient().fetchFacilityRows('KATL')).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('rejects with reason rate_limited on HTTP 429', async () => {
    mockedAxios.get.mockResolvedValue(axiosResponse(429, {}));

    await expect(new FaaFacilityClient().fetchRunwayRows('ATL')).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('wraps a transport failure in an AdapterError named after its code', async () => {
    mockedAxios.get.mockRejectedValue(econnaborted());

    await expect(new FaaFacilityClient().fetchFacilityRows('KATL')).rejects.toMatchObject({
      name: 'ECONNABORTED',
      kind: 'unavailable',
    });
  });
});
