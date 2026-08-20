import { NextResponse } from 'next/server';
import { runAgent } from '@/adapters/llm/google';
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

    // proxy.ts (matcher: /api/chat) validates this header as a UUID before this route ever runs.
    const session = req.headers.get('x-session-id')!;
    const narrative = await runAgent(session, query);
    return NextResponse.json({ ok: true, data: { narrative } });
  } catch (err: unknown) {
    console.error('[api/chat]', err);
    return NextResponse.json({ ok: false, error: { code: 'internal_error', message: 'Internal error' } }, { status: 500 });
  }
}
