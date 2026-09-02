import { beforeEach, describe, expect, it } from 'vitest';
import { econnaborted, getTransport, requestUrl, resetTransport } from '@test/helpers/axios';
import { FaaFacilityClient } from './faaFacility.client';

describe('FaaFacilityClient', () => {
  beforeEach(() => {
    resetTransport();
  });

  it('fetchFacilityRows builds the NTAD_Aviation_Facilities query and returns attributes on success', async () => {
    getTransport.mockResolvedValue({
      status: 200,
      data: { features: [{ attributes: { ARPT_ID: 'ATL', ICAO_ID: 'KATL' } }] },
    });

    const rows = await new FaaFacilityClient().fetchFacilityRows('KATL');

    expect(rows).toEqual([{ ARPT_ID: 'ATL', ICAO_ID: 'KATL' }]);
    const decoded = requestUrl();
    expect(decoded).toContain('NTAD_Aviation_Facilities');
    expect(decoded).toContain("where=ICAO_ID='KATL'");
    expect(decoded).toContain('f=json');
    expect(decoded).toContain('returnGeometry=false');
  });

  it('fetchRunwayRows builds the Runways_View query and returns attributes for two features', async () => {
    getTransport.mockResolvedValue({
      status: 200,
      data: {
        features: [
          { attributes: { ARPT_ID: 'ATL', RWY_ID: '08L/26R' } },
          { attributes: { ARPT_ID: 'ATL', RWY_ID: '08R/26L' } },
        ],
      },
    });

    const rows = await new FaaFacilityClient().fetchRunwayRows('ATL');

    expect(rows).toEqual([
      { ARPT_ID: 'ATL', RWY_ID: '08L/26R' },
      { ARPT_ID: 'ATL', RWY_ID: '08R/26L' },
    ]);
    const decoded = requestUrl();
    expect(decoded).toContain('Runways_View');
    expect(decoded).toContain("where=ARPT_ID='ATL'");
  });

  it('resolves to an empty array (not a throw) when a valid query has zero matching features', async () => {
    getTransport.mockResolvedValue({ status: 200, data: { features: [] } });

    await expect(new FaaFacilityClient().fetchFacilityRows('KXXX')).resolves.toEqual([]);
  });

  it('rejects when ArcGIS embeds an error object in an HTTP 200 body', async () => {
    getTransport.mockResolvedValue({
      status: 200,
      data: { error: { code: 400, message: 'Unable to complete operation.' } },
    });

    await expect(new FaaFacilityClient().fetchFacilityRows('KATL')).rejects.toMatchObject({
      name: 'ArcGisError',
      kind: 'unavailable',
    });
  });

  it('rejects on HTTP 429', async () => {
    getTransport.mockResolvedValue({ status: 429, data: {} });

    await expect(new FaaFacilityClient().fetchRunwayRows('ATL')).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('wraps a transport failure in an AdapterError named after its code', async () => {
    getTransport.mockRejectedValue(econnaborted());

    await expect(new FaaFacilityClient().fetchFacilityRows('KATL')).rejects.toMatchObject({
      name: 'ECONNABORTED',
      kind: 'unavailable',
    });
  });
});
