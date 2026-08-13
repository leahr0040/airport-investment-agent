/**
 * Offline coverage for the paginated ArcGIS FeatureServer query helper.
 * No real network calls — fetch is stubbed for every case.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARCGIS_BASE, ArcGisQueryError, queryAllFeatures } from './fetchArcGis';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function page(count: number, exceededTransferLimit?: boolean) {
  return {
    features: Array.from({ length: count }, (_, i) => ({ attributes: { OBJECTID: i } })),
    ...(exceededTransferLimit !== undefined ? { exceededTransferLimit } : {}),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queryAllFeatures', () => {
  it('follows exceededTransferLimit across two pages and returns all attributes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(2000, true)))
      .mockResolvedValueOnce(jsonResponse(page(100)));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await queryAllFeatures('Layer', 'WHERE 1=1', 'A,B');

    expect(rows).toHaveLength(2100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('carries resultOffset=0 on the first call and resultOffset=2000 on the second', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(2000, true)))
      .mockResolvedValueOnce(jsonResponse(page(100)));
    vi.stubGlobal('fetch', fetchMock);

    await queryAllFeatures('Layer', 'WHERE 1=1', 'A,B');

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(firstUrl.searchParams.get('resultOffset')).toBe('0');
    expect(secondUrl.searchParams.get('resultOffset')).toBe('2000');
  });

  it('sets f=json, returnGeometry=false, resultRecordCount=2000 and orderByFields=OBJECTID on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(page(10)));
    vi.stubGlobal('fetch', fetchMock);

    await queryAllFeatures('Layer', 'WHERE 1=1', 'A,B');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('f')).toBe('json');
    expect(url.searchParams.get('returnGeometry')).toBe('false');
    expect(url.searchParams.get('resultRecordCount')).toBe('2000');
    expect(url.searchParams.get('orderByFields')).toBe('OBJECTID');
  });

  it('throws ArcGisQueryError naming the layer and status on a non-ok HTTP response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(queryAllFeatures('MyLayer', 'WHERE 1=1', 'A')).rejects.toMatchObject({
      name: 'ArcGisQueryError',
      layer: 'MyLayer',
    });
    await expect(queryAllFeatures('MyLayer', 'WHERE 1=1', 'A')).rejects.toThrow(/500/);
  });

  it('throws ArcGisQueryError naming the layer and the ArcGIS error message on a 200 body carrying an error object', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: 400, message: 'Invalid where clause' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(queryAllFeatures('MyLayer', 'bad where', 'A')).rejects.toMatchObject({
      name: 'ArcGisQueryError',
      layer: 'MyLayer',
    });
    await expect(queryAllFeatures('MyLayer', 'bad where', 'A')).rejects.toThrow(/Invalid where clause/);
  });

  it('advances to the next page when a page returns zero features but exceededTransferLimit is true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(0, true)))
      .mockResolvedValueOnce(jsonResponse(page(50)));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await queryAllFeatures('Layer', 'WHERE 1=1', 'A');

    expect(rows).toHaveLength(50);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops pagination with ArcGisQueryError after 20 pages when exceededTransferLimit never clears', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page(2000, true)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(queryAllFeatures('LoopLayer', 'WHERE 1=1', 'A')).rejects.toMatchObject({
      name: 'ArcGisQueryError',
      layer: 'LoopLayer',
    });
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
});

describe('ARCGIS_BASE', () => {
  it('is the exact hardcoded FAA ArcGIS host', () => {
    expect(ARCGIS_BASE).toBe('https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services');
  });
});
