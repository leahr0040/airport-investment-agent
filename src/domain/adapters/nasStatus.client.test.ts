import { describe, it, expect, beforeEach } from 'vitest';
import { econnaborted, getTransport, resetTransport } from '@test/helpers/axios';
import { nasStatusClient } from './nasStatus.client';
import { clearCache } from './cache';

describe('NasStatusClient', () => {
  beforeEach(() => {
    resetTransport();
    clearCache();
  });

  it('fetches feed and caches it (one upstream call)', async () => {
    const sampleXml = '<AIRPORT_STATUS_INFORMATION></AIRPORT_STATUS_INFORMATION>';
    getTransport.mockResolvedValue({ status: 200, data: sampleXml });

    const first = await nasStatusClient.fetchCachedFeed();
    const second = await nasStatusClient.fetchCachedFeed();

    expect(first).toBe(sampleXml);
    expect(second).toBe(sampleXml);
    expect(getTransport).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to an unavailable AdapterError', async () => {
    getTransport.mockResolvedValue({ status: 429, data: '' });
    await expect(nasStatusClient.fetchCachedFeed()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('throws a reasoned error when upstream returns another non-200 status', async () => {
    getTransport.mockResolvedValue({ status: 500, data: 'err' });
    await expect(nasStatusClient.fetchCachedFeed()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('wraps a transport failure in an AdapterError named after its code', async () => {
    getTransport.mockRejectedValue(econnaborted());
    await expect(nasStatusClient.fetchCachedFeed()).rejects.toMatchObject({
      name: 'ECONNABORTED',
      kind: 'unavailable',
    });
  });
});
