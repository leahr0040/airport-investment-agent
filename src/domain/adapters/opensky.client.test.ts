import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { axiosResponse, econnaborted } from '@test/helpers/axios';

process.env.OPENSKY_CLIENT_ID = 'test-id';
process.env.OPENSKY_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'dummy';

import { OpenSkyClient } from './opensky.client';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

function asClientWithToken(client: OpenSkyClient): { cachedToken: string | null } {
  return client as unknown as { cachedToken: string | null };
}

const WINDOW = { begin: 0, end: 100 };

describe('OpenSkyClient', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
  });

  it('caches token from token endpoint', async () => {
    mockedAxios.post.mockResolvedValue(axiosResponse(200, { access_token: 'tok-1', expires_in: 3600 }));
    const client = new OpenSkyClient();

    const t1 = await client.ensureToken();
    const t2 = await client.ensureToken();

    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-1');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('memoizes concurrent ensureToken calls into a single token request', async () => {
    mockedAxios.post.mockResolvedValue(
      axiosResponse(200, { access_token: 'tok-concurrent', expires_in: 3600 }),
    );
    const client = new OpenSkyClient();

    const [t1, t2] = await Promise.all([client.ensureToken(), client.ensureToken()]);

    expect(t1).toBe('tok-concurrent');
    expect(t2).toBe('tok-concurrent');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to rate_limited error', async () => {
    mockedAxios.get.mockResolvedValue(axiosResponse(429, {}));
    const client = new OpenSkyClient();

    await expect(client.fetchFlightLeg('KATL', 'departure', WINDOW, 'tok')).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://opensky-network.org/api/flights/departure?airport=KATL&begin=0&end=100',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('clears token cache on 401/403 and throws error', async () => {
    mockedAxios.get.mockResolvedValue(axiosResponse(401, {}));
    const client = new OpenSkyClient();
    asClientWithToken(client).cachedToken = 'primed';

    await expect(
      client.fetchFlightLeg('KATL', 'departure', WINDOW, 'primed'),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(asClientWithToken(client).cachedToken).toBeNull();
  });

  it('wraps a transport failure in an AdapterError named after its code', async () => {
    mockedAxios.get.mockRejectedValue(econnaborted());
    const client = new OpenSkyClient();

    await expect(client.fetchFlightLeg('KATL', 'departure', WINDOW, 'tok')).rejects.toMatchObject({
      name: 'ECONNABORTED',
      kind: 'unavailable',
    });
  });
});
