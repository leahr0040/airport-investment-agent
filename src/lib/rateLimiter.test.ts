import { describe, expect, it } from 'vitest';
import { checkIpRateLimit, checkRateLimit } from './rateLimiter';

describe('checkRateLimit', () => {
  it('allows requests up to the burst capacity then blocks', async () => {
    const key = `burst-${Date.now()}-${Math.random()}`;

    for (let i = 0; i < 10; i++) {
      const res = await checkRateLimit(key);
      expect(res.allowed).toBe(true);
    }

    const blocked = await checkRateLimit(key);
    expect(blocked.allowed).toBe(false);
  });

  it('tracks separate session keys independently', async () => {
    const a = await checkRateLimit(`a-${Date.now()}-${Math.random()}`);
    const b = await checkRateLimit(`b-${Date.now()}-${Math.random()}`);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});

describe('checkIpRateLimit', () => {
  it('allows requests up to the burst capacity then blocks', async () => {
    const key = `ip-burst-${Date.now()}-${Math.random()}`;

    for (let i = 0; i < 30; i++) {
      const res = await checkIpRateLimit(key);
      expect(res.allowed).toBe(true);
    }

    const blocked = await checkIpRateLimit(key);
    expect(blocked.allowed).toBe(false);
  });

  it('tracks separate ip keys independently', async () => {
    const a = await checkIpRateLimit(`ip-a-${Date.now()}-${Math.random()}`);
    const b = await checkIpRateLimit(`ip-b-${Date.now()}-${Math.random()}`);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});
