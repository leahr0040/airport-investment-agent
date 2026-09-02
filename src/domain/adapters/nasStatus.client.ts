import axios, { type AxiosInstance } from 'axios';
import { withCache, NAS_STATUS_TTL_MS } from './cache';
import { FailureKind } from './types';
import { AdapterError, toNetworkError } from './errors';

const NAS_FEED_URL = 'https://nasstatus.faa.gov/api/airport-status-information';

export class NasStatusClient {
  private readonly cacheKey = 'nas:feed';
  private readonly timeoutMs = 3000;

  constructor(private readonly http: AxiosInstance = axios) {}

  async fetchCachedFeed(): Promise<string> {
    return await withCache(this.cacheKey, NAS_STATUS_TTL_MS, async () => {
      let response;
      try {
        response = await this.http.get(NAS_FEED_URL, { timeout: this.timeoutMs, validateStatus: () => true });
      } catch (err) {
        throw toNetworkError(err);
      }

      if (response.status !== 200) {
        throw new AdapterError('UpstreamError', FailureKind.Unavailable, {
          method: response.request?.method,
          path: response.request?.path,
          status: response.status,
          data: response.data,
        });
      }
      return response.data as string;
    });
  }
}

export const nasStatusClient = new NasStatusClient();
