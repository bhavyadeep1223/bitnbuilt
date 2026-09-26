import "server-only";

/**
 * In-memory fixed-window rate limiter. Good enough for a single-instance
 * hackathon deployment — it resets on redeploy and doesn't coordinate across
 * instances. Swap for a shared store (Redis/Upstash) before scaling out.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Opportunistic sweep of expired buckets so a long-running process doesn't accumulate one entry per distinct client forever. */
function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

let checksSinceSweep = 0;
const SWEEP_EVERY_N_CHECKS = 500;

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();

  if (++checksSinceSweep >= SWEEP_EVERY_N_CHECKS) {
    checksSinceSweep = 0;
    sweepExpired(now);
  }

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}
