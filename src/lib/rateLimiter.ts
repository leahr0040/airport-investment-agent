import { RateLimiterMemory } from 'rate-limiter-flexible';

// 5 req/min steady rate, burst capacity 10, single in-memory instance (one process, demo scale).
const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

// Coarser IP-keyed backstop (not the primary fairness mechanism) so rotating x-session-id cannot bypass throttling entirely.
const ipLimiter = new RateLimiterMemory({ points: 30, duration: 60 });

async function consumeRateLimit(
  limiterInstance: RateLimiterMemory,
  key: string,
): Promise<{ allowed: boolean }> {
  try {
    await limiterInstance.consume(key);
    return { allowed: true };
  } catch (rejectionOrError) {
    // consume() rejects with a RateLimiterRes (limit hit) or an Error (real failure) - only
    // the former means "blocked"; a real error should propagate, not be treated as a limit hit.
    if (rejectionOrError instanceof Error) throw rejectionOrError;
    return { allowed: false };
  }
}

export async function checkRateLimit(key: string): Promise<{ allowed: boolean }> {
  return consumeRateLimit(limiter, key);
}

export async function checkIpRateLimit(ip: string): Promise<{ allowed: boolean }> {
  return consumeRateLimit(ipLimiter, ip);
}
