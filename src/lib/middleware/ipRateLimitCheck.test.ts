import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rateLimiter', () => ({ checkIpRateLimit: vi.fn(), checkRateLimit: vi.fn() }));

import { NextRequest } from 'next/server';
import { checkIpRateLimit } from '@/lib/rateLimiter';
import { ipRateLimitCheck } from './ipRateLimitCheck';

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/chat', { headers });
}

describe('ipRateLimitCheck', () => {
  it('returns null when the ip is allowed', async () => {
    vi.mocked(checkIpRateLimit).mockResolvedValueOnce({ allowed: true });

    const result = await ipRateLimitCheck(req({ 'x-forwarded-for': '1.2.3.4' }));
    expect(result).toBeNull();
    expect(checkIpRateLimit).toHaveBeenCalledWith('1.2.3.4');
  });

  it('returns a 429 rate_limited response when the ip is blocked', async () => {
    vi.mocked(checkIpRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await ipRateLimitCheck(req({ 'x-forwarded-for': '1.2.3.4' }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);

    const body = await result!.json();
    expect(body).toEqual({ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } });
  });

  it('falls back to "unknown" when x-forwarded-for is absent', async () => {
    vi.mocked(checkIpRateLimit).mockResolvedValueOnce({ allowed: true });

    await ipRateLimitCheck(req());
    expect(checkIpRateLimit).toHaveBeenCalledWith('unknown');
  });
});
