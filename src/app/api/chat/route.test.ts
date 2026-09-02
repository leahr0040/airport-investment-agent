import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/adapters/llm/google', () => ({ runAgent: vi.fn() }));

import { runAgent } from '@/adapters/llm/google';
import { POST } from './route';

function postRequest(body: unknown, sessionId: string) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sessionId },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.mocked(runAgent).mockReset();
  });

  it('returns the agent\'s own response text', async () => {
    vi.mocked(runAgent).mockResolvedValueOnce('KSFO scores 80, ahead of KATL at 30.');

    const sessionId = `s-${Date.now()}`;
    const res = await POST(postRequest({ query: 'Compare KATL and KSFO' }, sessionId));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.narrative).toBe('KSFO scores 80, ahead of KATL at 30.');
    expect(runAgent).toHaveBeenCalledWith(sessionId, 'Compare KATL and KSFO');
  });

  it('returns the agent\'s text as-is for a non-airport question', async () => {
    vi.mocked(runAgent).mockResolvedValueOnce('I can help with airport expansion questions.');

    const res = await POST(postRequest({ query: 'hello' }, `s-${Date.now()}`));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.narrative).toBe('I can help with airport expansion questions.');
  });

  it('rejects a body with no query instead of asking the agent an empty question', async () => {
    const res = await POST(postRequest({}, `s-${Date.now()}`));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('does not fall back to x-forwarded-for for session identity', async () => {
    vi.mocked(runAgent).mockResolvedValueOnce('ok');

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify({ query: 'hello' }),
    });
    await POST(req);

    expect(runAgent).toHaveBeenCalledWith(null, 'hello');
  });
});
