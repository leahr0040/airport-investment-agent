import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export async function sessionIdValidationCheck(req: NextRequest): Promise<NextResponse | null> {
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

  return null;
}
