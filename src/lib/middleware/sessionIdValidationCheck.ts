import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export async function sessionIdValidationCheck(req: NextRequest): Promise<NextResponse | null> {
  const sessionIdCheck = z.uuid().safeParse(req.headers.get('x-session-id'));
  if (!sessionIdCheck.success) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_session_id', message: 'x-session-id header must be a valid UUID' } },
      { status: 400 },
    );
  }

  return null;
}
