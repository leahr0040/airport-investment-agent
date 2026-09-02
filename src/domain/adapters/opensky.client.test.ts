import { beforeEach, describe, expect, it } from 'vitest';
import { econnaborted, getTransport, postTransport, requestConfig, requestUrl, resetTransport } from '@test/helpers/axios';
import { OpenSkyClient } from './opensky.client';

function asClientWithToken(client: OpenSkyClient): { cachedToken: string | null } {
  return client as unknown as { cachedToken: string | null };
}

const WINDOW = { begin: 0, end: 100 };

describe('OpenSkyClient', () => {
  beforeEach(() => {
    resetTransport();
  });

  it('caches token from token endpoint', async () => {
    postTransport.mockResolvedValue({ status: 200, data: { access_token: 'tok-1', expires_in: 3600 } });
    const client = new OpenSkyClient();

    const t1 = await client.ensureToken();
    const t2 = await client.ensureToken();

    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-1');
    expect(postTransport).toHaveBeenCalledTimes(1);
  });

  it('memoizes concurrent ensureToken calls into a single token request', async () => {
    postTransport.mockResolvedValue({ status: 200, data: { access_token: 'tok-concurrent', expires_in: 3600 } });
    const client = new OpenSkyClient();

    const [t1, t2] = await Promise.all([client.ensureToken(), client.ensureToken()]);

    expect(t1).toBe('tok-concurrent');
    expect(t2).toBe('tok-concurrent');
    expect(postTransport).toHaveBeenCalledTimes(1);
  });

  it('names a non-200 from the token endpoint TokenFetchFailed, not UpstreamError', async () => {
    postTransport.mockResolvedValue({ status: 500, data: '' });
    const client = new OpenSkyClient();

    await expect(client.ensureToken()).rejects.toMatchObject({
      name: 'TokenFetchFailed',
      kind: 'unavailable',
    });
  });

  it('maps 429 to an unavailable AdapterError', async () => {
    getTransport.mockResolvedValue({ status: 429, data: {} });
    const client = new OpenSkyClient();

    await expect(client.fetchFlightLeg('KATL', 'departure', WINDOW, 'tok')).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(requestUrl()).toBe('https://opensky-network.org/api/flights/departure?airport=KATL&begin=0&end=100');
    expect(requestConfig().headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('returns an empty leg on 404 rather than throwing', async () => {
    getTransport.mockResolvedValue({ status: 404, data: '' });
    const client = new OpenSkyClient();

    await expect(client.fetchFlightLeg('KATL', 'departure', WINDOW, 'tok')).resolves.toEqual([]);
  });

  it('clears token cache on 401/403 and throws error', async () => {
    getTransport.mockResolvedValue({ status: 401, data: {} });
    const client = new OpenSkyClient();
    asClientWithToken(client).cachedToken = 'primed';

    await expect(client.fetchFlightLeg('KATL', 'departure', WINDOW, 'primed')).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(asClientWithToken(client).cachedToken).toBeNull();
  });

  it('wraps a transport failure in an AdapterError named after its code', async () => {
    getTransport.mockRejectedValue(econnaborted());
    const client = new OpenSkyClient();

    await expect(client.fetchFlightLeg('KATL', 'departure', WINDOW, 'tok')).rejects.toMatchObject({
      name: 'ECONNABORTED',
      kind: 'unavailable',
    });
  });
});
