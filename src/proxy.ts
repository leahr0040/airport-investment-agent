import { NextRequest, NextResponse } from 'next/server';
import { ipRateLimitCheck } from '@/lib/middleware/ipRateLimitCheck';
import { sessionIdValidationCheck } from '@/lib/middleware/sessionIdValidationCheck';
import { sessionRateLimitCheck } from '@/lib/middleware/sessionRateLimitCheck';

export async function proxy(req: NextRequest) {
  const ipBlocked = await ipRateLimitCheck(req);
  if (ipBlocked) return ipBlocked;

  const sessionIdBlocked = await sessionIdValidationCheck(req);
  if (sessionIdBlocked) return sessionIdBlocked;

  const sessionBlocked = await sessionRateLimitCheck(req);
  if (sessionBlocked) return sessionBlocked;

  return NextResponse.next();
}

export const config = { matcher: '/api/chat' };
