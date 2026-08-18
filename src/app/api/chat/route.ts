import { NextResponse } from 'next/server';
import { runAgent } from '@/adapters/llm/google';
import { checkRateLimit } from '@/lib/rateLimiter';
import { z } from 'zod';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const BodySchema = z.object({ query: z.string().min(1) }).partial();
    const parsedBody = BodySchema.safeParse(body);
    const query = parsedBody.success ? parsedBody.data.query ?? '' : '';

    if (!parsedBody.success) {
      return NextResponse.json({ ok: false, error: { code: 'invalid_request', message: 'Expected {query: string}' } }, { status: 400 });
    }

    const session = req.headers.get('x-session-id') ?? req.headers.get('x-forwarded-for') ?? 'anon';
    const rateLimitResult = await checkRateLimit(String(session));
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } }, { status: 429 });
    }

    const narrative = await runAgent(session, query);
    return NextResponse.json({ ok: true, data: { narrative } });
  } catch (err: unknown) {
    console.error('[api/chat]', err);
    return NextResponse.json({ ok: false, error: { code: 'internal_error', message: 'Internal error' } }, { status: 500 });
  }
}
