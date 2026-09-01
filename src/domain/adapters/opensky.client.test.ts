import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.OPENSKY_CLIENT_ID = 'test-id';
process.env.OPENSKY_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'dummy';

import { OpenSkyClient, type HttpClient } from './opensky.client';

function asClientWithToken(client: OpenSkyClient): { cachedToken: string | null } {
  return client as unknown as { cachedToken: string | null };
}

describe('OpenSkyClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('caches token from token endpoint', async () => {
    const mockHttp = {
      post: vi.fn().mockResolvedValue({ status: 200, data: { access_token: 'tok-1', expires_in: 3600 } }),
    } as unknown as HttpClient;

    const client = new OpenSkyClient(3000, mockHttp);

    const t1 = await client.ensureToken();
    const t2 = await client.ensureToken();

    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-1');
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
  });

  it('memoizes concurrent ensureToken calls into a single token request', async () => {
    const mockHttp = {
      post: vi.fn().mockResolvedValue({ status: 200, data: { access_token: 'tok-concurrent', expires_in: 3600 } }),
    } as unknown as HttpClient;

    const client = new OpenSkyClient(3000, mockHttp);

    const [t1, t2] = await Promise.all([client.ensureToken(), client.ensureToken()]);

    expect(t1).toBe('tok-concurrent');
    expect(t2).toBe('tok-concurrent');
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to rate_limited error', async () => {
    const mockHttp = {
      get: vi.fn().mockResolvedValue({ status: 429, data: {} }),
    } as unknown as HttpClient;

    const client = new OpenSkyClient(3000, mockHttp);

    await expect(client.requestLegUrl('https://opensky/fake', 'tok')).rejects.toMatchObject({ reason: 'rate_limited' });
    expect(mockHttp.get).toHaveBeenCalledWith('https://opensky/fake', expect.objectContaining({ headers: expect.any(Object) }));
  });

  it('clears token cache on 401/403 and throws error', async () => {
    const mockHttp = {
      get: vi.fn().mockResolvedValue({ status: 401, data: {} }),
    } as unknown as HttpClient;

    const client = new OpenSkyClient(3000, mockHttp);
    asClientWithToken(client).cachedToken = 'primed';

    await expect(client.requestLegUrl('https://opensky/fake', 'primed')).rejects.toMatchObject({ reason: 'error' });
    expect(asClientWithToken(client).cachedToken).toBeNull();
  });

  it('normalizes a real axios ECONNABORTED timeout to a TimeoutError-named error', async () => {
    const mockHttp = {
      get: vi.fn().mockRejectedValue(Object.assign(new Error('timeout of 3000ms exceeded'), { code: 'ECONNABORTED' })),
    } as unknown as HttpClient;

    const client = new OpenSkyClient(3000, mockHttp);

    await expect(client.requestLegUrl('https://opensky/fake', 'tok')).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
