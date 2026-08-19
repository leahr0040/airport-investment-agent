import { NextRequest, NextResponse } from 'next/server';
import { ipRateLimitCheck } from '@/lib/middleware/ipRateLimitCheck';
import { sessionRateLimitCheck } from '@/lib/middleware/sessionRateLimitCheck';

export async function middleware(req: NextRequest) {
  const ipBlocked = await ipRateLimitCheck(req);
  if (ipBlocked) return ipBlocked;

  const sessionBlocked = await sessionRateLimitCheck(req);
  if (sessionBlocked) return sessionBlocked;

  return NextResponse.next();
}

export const config = { matcher: '/api/chat', runtime: 'nodejs' };
