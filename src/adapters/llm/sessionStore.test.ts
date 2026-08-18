import { describe, expect, it, vi, afterEach } from 'vitest';
import { getOrCreateChat } from './sessionStore';

afterEach(() => {
  vi.useRealTimers();
});

describe('getOrCreateChat', () => {
  it('returns the same chat for repeated calls with the same sessionId', () => {
    let calls = 0;
    const factory = vi.fn(() => ({ marker: ++calls }));

    const first = getOrCreateChat('s1', factory as never);
    const second = getOrCreateChat('s1', factory as never);

    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('evicts a session past its TTL, creating a fresh chat on next access', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    let calls = 0;
    const factory = vi.fn(() => ({ marker: ++calls }));

    const first = getOrCreateChat('s2', factory as never);

    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    const second = getOrCreateChat('s2', factory as never);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });
});
