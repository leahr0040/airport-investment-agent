import { describe, expect, it, vi } from 'vitest';

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

  it('rejects a session once it exceeds the rate limit', async () => {
    vi.mocked(runAgent).mockResolvedValue('ok');
    const sessionId = `burst-${Date.now()}`;
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(postRequest({ query: 'Compare KATL and KSFO' }, sessionId));
    }
    expect(last!.status).toBe(429);
  });
});
