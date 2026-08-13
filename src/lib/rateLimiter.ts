import { RateLimiterMemory } from 'rate-limiter-flexible';

// 5 req/min steady rate, burst capacity 10, single in-memory instance (one process, demo scale).
const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

export async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const consumeResult = await limiter.consume(key);
    return { allowed: true, remaining: consumeResult.remainingPoints };
  } catch (rejectionOrError) {
    // consume() rejects with a RateLimiterRes (limit hit) or an Error (real failure) - only
    // the former means "blocked"; a real error should propagate, not be treated as a limit hit.
    if (rejectionOrError instanceof Error) throw rejectionOrError;
    return { allowed: false, remaining: 0 };
  }
}
