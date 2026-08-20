import { describe, expect, it } from 'vitest';

import { NextRequest } from 'next/server';
import { sessionIdValidationCheck } from './sessionIdValidationCheck';

const VALID_SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/chat', { headers });
}

describe('sessionIdValidationCheck', () => {
  it('returns a 400 invalid_session_id response when x-session-id is missing', async () => {
    const result = await sessionIdValidationCheck(req());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);

    const body = await result!.json();
    expect(body).toEqual({ ok: false, error: { code: 'invalid_session_id', message: 'x-session-id header must be a valid UUID' } });
  });

  it('returns a 400 invalid_session_id response when x-session-id is not a valid UUID', async () => {
    const result = await sessionIdValidationCheck(req({ 'x-session-id': 'not-a-uuid' }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);

    const body = await result!.json();
    expect(body).toEqual({ ok: false, error: { code: 'invalid_session_id', message: 'x-session-id header must be a valid UUID' } });
  });

  it('returns null when x-session-id is a valid UUID', async () => {
    const result = await sessionIdValidationCheck(req({ 'x-session-id': VALID_SESSION_ID }));
    expect(result).toBeNull();
  });
});
