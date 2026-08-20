import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ipRateLimitCheck } from '@/lib/middleware/ipRateLimitCheck';
import { sessionRateLimitCheck } from '@/lib/middleware/sessionRateLimitCheck';

export async function proxy(req: NextRequest) {
  const ipBlocked = await ipRateLimitCheck(req);
  if (ipBlocked) return ipBlocked;

  // x-session-id doubles as the rate-limit key (sessionRateLimitCheck.ts) and the
  // chat-history lookup key (route.ts's sessionStore), so it is rejected here rather
  // than trusted downstream.
  const sessionIdCheck = z.uuid().safeParse(req.headers.get('x-session-id'));
  if (!sessionIdCheck.success) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_session_id', message: 'x-session-id header must be a valid UUID' } },
      { status: 400 },
    );
  }

  const sessionBlocked = await sessionRateLimitCheck(req);
  if (sessionBlocked) return sessionBlocked;

  return NextResponse.next();
}

export const config = { matcher: '/api/chat' };
