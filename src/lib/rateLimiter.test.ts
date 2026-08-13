import { describe, expect, it } from 'vitest';
import { checkRateLimit } from './rateLimiter';

describe('checkRateLimit', () => {
  it('allows requests up to the burst capacity then blocks', async () => {
    const key = `burst-${Date.now()}-${Math.random()}`;

    for (let i = 0; i < 10; i++) {
      const res = await checkRateLimit(key);
      expect(res.allowed).toBe(true);
    }

    const blocked = await checkRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('tracks separate session keys independently', async () => {
    const a = await checkRateLimit(`a-${Date.now()}-${Math.random()}`);
    const b = await checkRateLimit(`b-${Date.now()}-${Math.random()}`);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});
