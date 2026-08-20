import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/middleware/ipRateLimitCheck', () => ({ ipRateLimitCheck: vi.fn() }));
vi.mock('@/lib/middleware/sessionIdValidationCheck', () => ({ sessionIdValidationCheck: vi.fn() }));
vi.mock('@/lib/middleware/sessionRateLimitCheck', () => ({ sessionRateLimitCheck: vi.fn() }));

import { NextRequest, NextResponse } from 'next/server';
import { ipRateLimitCheck } from '@/lib/middleware/ipRateLimitCheck';
import { sessionIdValidationCheck } from '@/lib/middleware/sessionIdValidationCheck';
import { sessionRateLimitCheck } from '@/lib/middleware/sessionRateLimitCheck';
import { proxy } from './proxy';

const VALID_SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

function req(headers: Record<string, string> = { 'x-session-id': VALID_SESSION_ID }) {
  return new NextRequest('http://localhost/api/chat', { headers });
}

const RATE_LIMITED_RESPONSE = NextResponse.json(
  { ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } },
  { status: 429 },
);

describe('proxy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('short-circuits on an ip block before the session check runs', async () => {
    vi.mocked(ipRateLimitCheck).mockResolvedValueOnce(RATE_LIMITED_RESPONSE);
    vi.mocked(sessionIdValidationCheck).mockResolvedValueOnce(null);
    vi.mocked(sessionRateLimitCheck).mockResolvedValueOnce(null);

    const res = await proxy(req());
    expect(res.status).toBe(429);
    expect(sessionRateLimitCheck).toHaveBeenCalledTimes(0);
  });

  it('returns the session block when the ip check allows but the session check blocks', async () => {
    vi.mocked(ipRateLimitCheck).mockResolvedValueOnce(null);
    vi.mocked(sessionIdValidationCheck).mockResolvedValueOnce(null);
    vi.mocked(sessionRateLimitCheck).mockResolvedValueOnce(RATE_LIMITED_RESPONSE);

    const res = await proxy(req());
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body).toEqual({ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } });
  });

  it('passes through when both checks allow', async () => {
    vi.mocked(ipRateLimitCheck).mockResolvedValueOnce(null);
    vi.mocked(sessionIdValidationCheck).mockResolvedValueOnce(null);
    vi.mocked(sessionRateLimitCheck).mockResolvedValueOnce(null);

    const res = await proxy(req());
    expect(res.status).toBe(200);
  });
});
