import axios from 'axios';
import { getEnv } from '@/config/env';
import { FailureKind, type HttpResponse } from './types';
import { AdapterError } from './errors';

const TOKEN_ENDPOINT = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const FLIGHTS_BASE = 'https://opensky-network.org/api';

export type TimeWindow = { begin: number; end: number };

export type HttpClient = {
  post: (url: string, data: unknown, config: Record<string, unknown>) => Promise<HttpResponse>;
  get: (url: string, config: Record<string, unknown>) => Promise<HttpResponse>;
};

export class OpenSkyClient {
  private cachedToken: string | null = null;
  private tokenExpiryMs = 0;
  private pendingTokenRequest: Promise<string> | null = null;
  private readonly timeoutMs: number;

  constructor(timeoutMs = 3000, private http: HttpClient = axios as unknown as HttpClient) {
    this.timeoutMs = timeoutMs;
  }

  clearTokenCache(): void {
    this.cachedToken = null;
    this.tokenExpiryMs = 0;
  }

  private buildTokenPayload(env: ReturnType<typeof getEnv>): string {
    const body = new URLSearchParams();
    body.append('grant_type', 'client_credentials');
    body.append('client_id', env.OPENSKY_CLIENT_ID);
    body.append('client_secret', env.OPENSKY_CLIENT_SECRET);
    return body.toString();
  }

  private async requestToken(env: ReturnType<typeof getEnv>) {
    const tokenRequestPayload = this.buildTokenPayload(env);
    let response;
    try {
      response = await this.http.post(TOKEN_ENDPOINT, tokenRequestPayload, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: this.timeoutMs,
        validateStatus: () => true,
      });
    } catch (err) {
      throw this.normalizeTimeout(err);
    }

    if (response.status !== 200) {
      throw new AdapterError('TokenFetchFailed', FailureKind.Unavailable, {
        method: response.request?.method,
        path: response.request?.path,
        status: response.status,
      });
    }

    const responseBody = response.data as { access_token?: string; expires_in?: number };
    if (!responseBody.access_token || !responseBody.expires_in) {
      throw new AdapterError('TokenMissing', FailureKind.Unavailable, {
        method: response.request?.method,
        path: response.request?.path,
        status: response.status,
      });
    }
    return { access_token: responseBody.access_token, expires_in: Number(responseBody.expires_in) };
  }

  private normalizeTimeout(err: unknown): unknown {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ECONNABORTED') {
      return Object.assign(err, { name: 'TimeoutError' });
    }
    return err;
  }

  async ensureToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.tokenExpiryMs - 30_000 > now) return this.cachedToken;
    if (this.pendingTokenRequest) return this.pendingTokenRequest;

    const env = getEnv();
    const pending = this.requestToken(env)
      .then((tokenResponse) => {
        this.cachedToken = tokenResponse.access_token;
        this.tokenExpiryMs = Date.now() + tokenResponse.expires_in * 1000;
        return this.cachedToken;
      })
      .finally(() => {
        this.pendingTokenRequest = null;
      });
    this.pendingTokenRequest = pending;
    return pending;
  }

  async fetchFlightLeg(
    icao: string,
    kind: 'departure' | 'arrival',
    window: TimeWindow,
    token: string,
  ): Promise<Record<string, unknown>[]> {
    const url = this.buildFlightsUrl(icao, kind, window);
    let response;
    try {
      response = await this.http.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: this.timeoutMs,
        validateStatus: () => true,
      });
    } catch (err) {
      throw this.normalizeTimeout(err);
    }

    // OpenSky returns 404, not an empty 200, when no flights exist for the period.
    if (response.status === 404) return [];
    if (response.status === 401 || response.status === 403) this.clearTokenCache();

    if (response.status !== 200) {
      throw new AdapterError('UpstreamError', FailureKind.Unavailable, {
        method: response.request?.method,
        path: response.request?.path,
        status: response.status,
        data: response.data,
      });
    }
    return response.data as Record<string, unknown>[];
  }

  private buildFlightsUrl(icao: string, kind: 'departure' | 'arrival', window: TimeWindow) {
    return `${FLIGHTS_BASE}/flights/${kind}?airport=${encodeURIComponent(icao)}&begin=${window.begin}&end=${window.end}`;
  }
}

export const openskyClient = new OpenSkyClient();
