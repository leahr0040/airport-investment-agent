import { describe, it, expect, vi } from 'vitest';
import { FaaFacilityClient, type HttpClient } from './faaFacility.client';

function decodedUrl(url: string): string {
  return decodeURIComponent(url);
}

describe('FaaFacilityClient (single-file)', () => {
  it('builds facility and runway queries and handles error cases', async () => {
    const okFacility = { status: 200, data: { features: [{ attributes: { ARPT_ID: 'ATL', ICAO_ID: 'KATL' } }] } };
    const okRunways = { status: 200, data: { features: [{ attributes: { RWY_ID: '08' } }] } };

    const mockHttp = { get: vi.fn().mockResolvedValueOnce(okFacility).mockResolvedValueOnce(okRunways) } as unknown as HttpClient;
    const client = new FaaFacilityClient(3000, mockHttp);

    const facilityRows = await client.fetchFacilityRows('KATL');
    expect(facilityRows).toHaveLength(1);
    const [url] = (mockHttp.get as any).mock.calls[0];
    expect(decodedUrl(url as string)).toContain('NTAD_Aviation_Facilities');

    const runwayRows = await client.fetchRunwayRows('ATL');
    expect(runwayRows).toHaveLength(1);
  });
});
