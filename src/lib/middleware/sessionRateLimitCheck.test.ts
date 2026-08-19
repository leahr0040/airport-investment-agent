import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rateLimiter', () => ({ checkIpRateLimit: vi.fn(), checkRateLimit: vi.fn() }));

import { NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimiter';
import { sessionRateLimitCheck } from './sessionRateLimitCheck';

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/chat', { headers });
}

describe('sessionRateLimitCheck', () => {
  it('returns null when the session is allowed', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true });

    const result = await sessionRateLimitCheck(req({ 'x-session-id': 's-1' }));
    expect(result).toBeNull();
    expect(checkRateLimit).toHaveBeenCalledWith('s-1');
  });

  it('returns a 429 rate_limited response when the session is blocked', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await sessionRateLimitCheck(req({ 'x-session-id': 's-1' }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);

    const body = await result!.json();
    expect(body).toEqual({ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } });
  });

  it('falls back to x-forwarded-for, then "anon", when x-session-id is absent', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true });

    await sessionRateLimitCheck(req({ 'x-forwarded-for': '5.6.7.8' }));
    expect(checkRateLimit).toHaveBeenCalledWith('5.6.7.8');

    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true });
    await sessionRateLimitCheck(req());
    expect(checkRateLimit).toHaveBeenCalledWith('anon');
  });
});
