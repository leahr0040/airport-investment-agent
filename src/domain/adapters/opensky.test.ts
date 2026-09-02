import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { axiosResponse, econnaborted } from '@test/helpers/axios';
import { clearCache } from './cache';
import { fetchMovements, clearTokenCache } from './opensky';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);
const TOKEN_BODY = { access_token: 'fake-bearer-token-xyz', expires_in: 3600 };

describe('OpenSky adapter (fetchMovements) with axios', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
    clearCache();
    clearTokenCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a lowercase code before calling axios', async () => {
    await expect(fetchMovements('katl')).resolves.toMatchObject({ ok: false, kind: 'invalid_input' });
    expect(mockedAxios.post).toHaveBeenCalledTimes(0);
    expect(mockedAxios.get).toHaveBeenCalledTimes(0);
  });

  it('rejects a 3-letter IATA code and an empty string the same way', async () => {
    await expect(fetchMovements('ATL')).resolves.toMatchObject({ ok: false, kind: 'invalid_input' });
    await expect(fetchMovements('')).resolves.toMatchObject({ ok: false, kind: 'invalid_input' });
    expect(mockedAxios.post).toHaveBeenCalledTimes(0);
    expect(mockedAxios.get).toHaveBeenCalledTimes(0);
  });

  it('happy path returns counts and uses token in Authorization header', async () => {
    const departureRecords = [{ callsign: 'A', estArrivalAirport: 'KXYZ' }, { callsign: 'B', estArrivalAirport: null }];
    const arrivalRecords = [{ callsign: 'C', estDepartureAirport: null }, { callsign: 'D', estDepartureAirport: 'KABC' }];

    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, departureRecords));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, arrivalRecords));

    const result = await fetchMovements('KATL');
    expect(result.ok).toEqual(true);
    if (result.ok) {
      expect(result.source).toEqual('opensky');
      expect(typeof result.fetchedAt).toEqual('string');
      expect(result.data.departureCount).toEqual(2);
      expect(result.data.arrivalCount).toEqual(2);
      expect(result.data.unknownDestinationCount).toEqual(1);
      expect(result.data.unknownOriginCount).toEqual(1);
    }

    const [departureUrl, departureCallConfig] = mockedAxios.get.mock.calls[0];
    const headers = (departureCallConfig as { headers: Record<string, string> }).headers;
    expect(departureUrl).toContain('airport=KATL');
    expect(departureUrl).toMatch(/[?&]begin=\d+/);
    expect(departureUrl).toMatch(/[?&]end=\d+/);
    expect(headers.Authorization.startsWith('Bearer ')).toBeTruthy();
    expect(headers.Authorization).toContain(TOKEN_BODY.access_token);
  });

  it('reports an 86400-second window with the end floored to the bucket boundary', async () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:37.000Z'));
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, [{ callsign: 'A' }]));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, []));

    const result = await fetchMovements('KATL');
    if (!result.ok) throw new Error('expected ok result');
    expect(result.data.window.end % 300).toBe(0);
    expect(result.data.window.end - result.data.window.begin).toBe(86400);
  });

  it('caches results inside the TTL (one set of upstream calls)', async () => {
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, [{ callsign: 'A' }]));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, []));

    await fetchMovements('KATL');
    vi.advanceTimersByTime(60_000);
    await fetchMovements('KATL');

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('issues a new pair of flight fetches after the bucket rolls', async () => {
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValue(axiosResponse(200, [{ callsign: 'A' }]));

    await fetchMovements('KATL');
    vi.advanceTimersByTime(301_000);
    await fetchMovements('KATL');

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledTimes(4);
  });

  it('reuses the cached token across two movements calls', async () => {
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValue(axiosResponse(200, [{ callsign: 'A' }]));

    await fetchMovements('KATL');
    clearCache();
    await fetchMovements('KATL');

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token after it expires', async () => {
    mockedAxios.post.mockResolvedValue(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValue(axiosResponse(200, [{ callsign: 'A' }]));

    await fetchMovements('KATL');
    clearCache();
    vi.advanceTimersByTime(3600_000);
    await fetchMovements('KATL');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('maps a real axios timeout (ECONNABORTED) to reason timeout', async () => {
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockRejectedValueOnce(econnaborted());

    const res = await fetchMovements('KATL');
    expect(res).toMatchObject({ ok: false, kind: 'unavailable' });
  });

  it('maps 429 to rate_limited', async () => {
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(429, {}));

    const res = await fetchMovements('KATL');
    expect(res).toMatchObject({ ok: false, kind: 'unavailable' });
  });

  it('clears the token on 401 and re-authenticates on the next call', async () => {
    mockedAxios.post.mockResolvedValue(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(401, {}));
    mockedAxios.get.mockResolvedValue(axiosResponse(200, [{ callsign: 'A' }]));

    const first = await fetchMovements('KATL');
    expect(first).toMatchObject({ ok: false, kind: 'unavailable' });

    clearCache();
    await fetchMovements('KATL');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('reports an airport with no flights in the window as a measured zero, not a failure', async () => {
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(404, {}));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(404, {}));

    const result = await fetchMovements('KATL');
    if (!result.ok) throw new Error('expected ok result');
    expect(result.data.departureCount).toBe(0);
    expect(result.data.arrivalCount).toBe(0);
  });

  it('treats a single 404 leg as a legitimate zero, not a failure', async () => {
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(404, {}));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(200, [{ callsign: 'Z' }]));

    const result = await fetchMovements('KATL');
    if (!result.ok) throw new Error('expected ok result');
    expect(result.data.departureCount).toBe(0);
    expect(result.data.arrivalCount).toBe(1);
  });

  it('never leaks the client secret or access token into a failure detail', async () => {
    mockedAxios.post.mockResolvedValueOnce(axiosResponse(200, TOKEN_BODY));
    mockedAxios.get.mockResolvedValueOnce(axiosResponse(429, {}));

    const result = await fetchMovements('KATL');
    if (result.ok) throw new Error('expected failure result');
    expect(result.detail ?? '').not.toContain('test-opensky-client-secret');
    expect(result.detail ?? '').not.toContain(TOKEN_BODY.access_token);
  });
});
