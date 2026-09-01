import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { nasStatusClient } from './nasStatus.client';
import { clearCache } from './cache';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

describe('NasStatusClient', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    clearCache();
  });

  it('fetches feed and caches it (one upstream call)', async () => {
    const sampleXml = '<AIRPORT_STATUS_INFORMATION></AIRPORT_STATUS_INFORMATION>';
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: sampleXml } as never);

    const first = await nasStatusClient.fetchCachedFeed();
    const second = await nasStatusClient.fetchCachedFeed();

    expect(first).toBe(sampleXml);
    expect(second).toBe(sampleXml);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to rate_limited', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 429, data: '' } as never);
    await expect(nasStatusClient.fetchCachedFeed()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('throws a reasoned error when upstream returns another non-200 status', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 500, data: 'err' } as never);
    await expect(nasStatusClient.fetchCachedFeed()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('normalizes a real axios ECONNABORTED timeout to a TimeoutError-named error', async () => {
    mockedAxios.get.mockRejectedValueOnce(
      Object.assign(new Error('timeout of 3000ms exceeded'), { code: 'ECONNABORTED' }),
    );
    await expect(nasStatusClient.fetchCachedFeed()).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
