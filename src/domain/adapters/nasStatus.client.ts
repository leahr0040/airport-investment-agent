import type { AxiosInstance } from 'axios';
import { withCache, NAS_STATUS_TTL_MS } from './cache';
import { createHttpClient } from './http';

const NAS_FEED_URL = 'https://nasstatus.faa.gov/api/airport-status-information';

export class NasStatusClient {
  private readonly cacheKey = 'nas:feed';

  constructor(private readonly http: AxiosInstance = createHttpClient()) {}

  async fetchCachedFeed(): Promise<string> {
    return await withCache(this.cacheKey, NAS_STATUS_TTL_MS, async () => {
      const response = await this.http.get(NAS_FEED_URL);
      return response.data as string;
    });
  }
}

export const nasStatusClient = new NasStatusClient();
