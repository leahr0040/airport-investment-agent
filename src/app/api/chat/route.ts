import { NextResponse } from 'next/server';
import { runAgent } from '@/adapters/llm/google';
import { z } from 'zod';

const BodySchema = z.object({ query: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsedBody = BodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ ok: false, error: { code: 'invalid_request', message: 'Expected {query: string}', details: z.treeifyError(parsedBody.error) } }, { status: 400 });
    }

    const session = req.headers.get('x-session-id')!;
    const narrative = await runAgent(session, parsedBody.data.query);
    return NextResponse.json({ ok: true, data: { narrative } });
  } catch (err: unknown) {
    console.error('[api/chat]', err);
    return NextResponse.json({ ok: false, error: { code: 'internal_error', message: 'Internal error' } }, { status: 500 });
  }
}
