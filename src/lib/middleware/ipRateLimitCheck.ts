import { NextRequest, NextResponse } from 'next/server';
import { checkIpRateLimit } from '@/lib/rateLimiter';

export async function ipRateLimitCheck(req: NextRequest): Promise<NextResponse | null> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  const result = await checkIpRateLimit(ip);
  if (!result.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } }, { status: 429 });
  }

  return null;
}
