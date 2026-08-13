// Proves ROADMAP Phase 2 success criterion 4: one source failing leaves the other's answer intact.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { clearCache } from './cache';
import { fetchMovements, clearTokenCache } from './opensky';
import { fetchNasStatus } from './nasStatus';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

const EMPTY_FEED = `<?xml version="1.0"?><AIRPORT_STATUS_INFORMATION><Update_Time>2026-08-13T10:00:00Z</Update_Time></AIRPORT_STATUS_INFORMATION>`;

function econnaborted() {
  return Object.assign(new Error('timeout of 3000ms exceeded'), { code: 'ECONNABORTED' });
}

describe('cross-adapter failure isolation', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
    clearCache();
    clearTokenCache();
  });
  afterEach(() => vi.useRealTimers());

  it('OpenSky timing out does not take down the FAA result (Promise.all resolves, not rejects)', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200, data: { access_token: 'tok', expires_in: 3600 } } as never);
    mockedAxios.get.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('opensky-network.org')) throw econnaborted();
      return { status: 200, data: EMPTY_FEED };
    });

    const [opensky, faa] = await Promise.all([fetchMovements('KATL'), fetchNasStatus('KATL')]);

    expect(opensky).toMatchObject({ ok: false, reason: 'timeout' });
    expect(faa.ok).toBe(true);
  });

  it('a malformed identifier short-circuits both adapters before any I/O', async () => {
    const [opensky, faa] = await Promise.all([fetchMovements('katl'), fetchNasStatus('katl')]);

    expect(opensky).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(faa).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(0);
  });
});
