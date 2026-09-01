import { describe, it, expect, vi } from 'vitest';
import { FaaFacilityClient, type HttpClient } from './faaFacility.client';

function decodedUrl(url: string): string {
  return decodeURIComponent(url);
}

describe('FaaFacilityClient', () => {
  it('fetchFacilityRows builds the NTAD_Aviation_Facilities query and returns attributes on success', async () => {
    const mockHttp = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: { features: [{ attributes: { ARPT_ID: 'ATL', ICAO_ID: 'KATL' } }] },
      }),
    } as unknown as HttpClient;

    const client = new FaaFacilityClient(3000, mockHttp);
    const rows = await client.fetchFacilityRows('KATL');

    expect(rows).toEqual([{ ARPT_ID: 'ATL', ICAO_ID: 'KATL' }]);
    const [url] = (mockHttp.get as ReturnType<typeof vi.fn>).mock.calls[0];
    const decoded = decodedUrl(url as string);
    expect(decoded).toContain('NTAD_Aviation_Facilities');
    expect(decoded).toContain("where=ICAO_ID='KATL'");
    expect(decoded).toContain('f=json');
    expect(decoded).toContain('returnGeometry=false');
  });

  it('fetchRunwayRows builds the Runways_View query and returns attributes for two features', async () => {
    const mockHttp = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          features: [
            { attributes: { ARPT_ID: 'ATL', RWY_ID: '08L/26R' } },
            { attributes: { ARPT_ID: 'ATL', RWY_ID: '08R/26L' } },
          ],
        },
      }),
    } as unknown as HttpClient;

    const client = new FaaFacilityClient(3000, mockHttp);
    const rows = await client.fetchRunwayRows('ATL');

    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      { ARPT_ID: 'ATL', RWY_ID: '08L/26R' },
      { ARPT_ID: 'ATL', RWY_ID: '08R/26L' },
    ]);
    const [url] = (mockHttp.get as ReturnType<typeof vi.fn>).mock.calls[0];
    const decoded = decodedUrl(url as string);
    expect(decoded).toContain('Runways_View');
    expect(decoded).toContain("where=ARPT_ID='ATL'");
  });

  it('resolves to an empty array (not a throw) when a valid query has zero matching features', async () => {
    const mockHttp = {
      get: vi.fn().mockResolvedValue({ status: 200, data: { features: [] } }),
    } as unknown as HttpClient;

    const client = new FaaFacilityClient(3000, mockHttp);
    await expect(client.fetchFacilityRows('KXXX')).resolves.toEqual([]);
  });

  it('rejects with reason error when ArcGIS embeds an error object in an HTTP 200 body', async () => {
    const mockHttp = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: { error: { code: 400, message: "Unable to complete operation." } },
      }),
    } as unknown as HttpClient;

    const client = new FaaFacilityClient(3000, mockHttp);
    await expect(client.fetchFacilityRows('KATL')).rejects.toMatchObject({ reason: 'error' });
  });

  it('rejects with reason rate_limited on HTTP 429', async () => {
    const mockHttp = {
      get: vi.fn().mockResolvedValue({ status: 429, data: {} }),
    } as unknown as HttpClient;

    const client = new FaaFacilityClient(3000, mockHttp);
    await expect(client.fetchRunwayRows('ATL')).rejects.toMatchObject({ reason: 'rate_limited' });
  });

  it('normalizes a real axios ECONNABORTED timeout to a TimeoutError-named error', async () => {
    const mockHttp = {
      get: vi.fn().mockRejectedValue(Object.assign(new Error('timeout of 3000ms exceeded'), { code: 'ECONNABORTED' })),
    } as unknown as HttpClient;

    const client = new FaaFacilityClient(3000, mockHttp);
    await expect(client.fetchFacilityRows('KATL')).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
