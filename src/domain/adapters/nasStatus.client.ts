import axios from 'axios';
import { withCache, NAS_STATUS_TTL_MS } from './cache';

const NAS_FEED_URL = 'https://nasstatus.faa.gov/api/airport-status-information';

function normalizeTimeout(err: unknown): unknown {
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ECONNABORTED') {
    return Object.assign(new Error('TimeoutError'), { name: 'TimeoutError' });
  }
  return err;
}

export class NasStatusClient {
  private readonly cacheKey = 'nas:feed';
  private readonly timeoutMs = 3000;

  constructor(private readonly http = axios) {}

  async fetchCachedFeed(): Promise<string> {
    return await withCache(this.cacheKey, NAS_STATUS_TTL_MS, async () => {
      let response;
      try {
        response = await this.http.get(NAS_FEED_URL, { timeout: this.timeoutMs, validateStatus: () => true });
      } catch (err) {
        throw normalizeTimeout(err);
      }

      if (response.status === 429) {
        const e: Error & { reason: string } = Object.assign(new Error('rate_limited'), { reason: 'rate_limited' });
        throw e;
      }
      if (response.status !== 200) {
        const e: Error & { reason: string } = Object.assign(new Error('FeedFetchFailed'), { reason: 'error' });
        throw e;
      }
      return response.data as string;
    });
  }
}

export const nasStatusClient = new NasStatusClient();
