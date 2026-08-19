import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimiter';

export async function sessionRateLimitCheck(req: NextRequest): Promise<NextResponse | null> {
  const session = req.headers.get('x-session-id') ?? req.headers.get('x-forwarded-for') ?? 'anon';

  const result = await checkRateLimit(String(session));
  if (!result.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } }, { status: 429 });
  }

  return null;
}
