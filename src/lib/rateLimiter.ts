import { RateLimiterMemory } from 'rate-limiter-flexible';

const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

const ipLimiter = new RateLimiterMemory({ points: 30, duration: 60 });

async function consumeRateLimit(
  limiterInstance: RateLimiterMemory,
  key: string,
): Promise<{ allowed: boolean }> {
  try {
    await limiterInstance.consume(key);
    return { allowed: true };
  } catch (rejectionOrError) {
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
