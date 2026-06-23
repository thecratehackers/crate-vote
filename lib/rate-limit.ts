/**
 * Redis-backed rate limiter for API routes
 * Persists across serverless cold starts for true abuse prevention
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || 'https://placeholder.upstash.io',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || 'placeholder',
});

const RATE_LIMIT_PREFIX = 'rl:';

// Per-instance in-memory fallback used ONLY when Redis is unreachable. It can't see
// other serverless instances, but it stops the app from silently failing fully OPEN
// (no limits at all) during a Redis blip — the old behavior an attacker could exploit.
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();

    // Opportunistic cleanup so the map can't grow unbounded over a long show.
    if (memoryBuckets.size > 10000) {
        const expired: string[] = [];
        memoryBuckets.forEach((bucket, key) => {
            if (now > bucket.resetAt) expired.push(key);
        });
        expired.forEach(key => memoryBuckets.delete(key));
    }

    const existing = memoryBuckets.get(identifier);
    if (!existing || now > existing.resetAt) {
        const resetAt = now + config.windowMs;
        memoryBuckets.set(identifier, { count: 1, resetAt });
        return { success: 1 <= config.limit, remaining: Math.max(0, config.limit - 1), resetTime: resetAt };
    }

    existing.count += 1;
    return {
        success: existing.count <= config.limit,
        remaining: Math.max(0, config.limit - existing.count),
        resetTime: existing.resetAt,
    };
}

interface RateLimitConfig {
    /** Maximum number of requests allowed in the window */
    limit: number;
    /** Time window in milliseconds */
    windowMs: number;
}

interface RateLimitResult {
    success: boolean;
    remaining: number;
    resetTime: number;
}

/**
 * Check if a request should be rate limited (Redis-backed)
 * @param identifier - Unique identifier for the client (visitor ID, IP, etc.)
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed, remaining requests, and reset time
 */
export async function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    const key = `${RATE_LIMIT_PREFIX}${identifier}`;
    const windowSeconds = Math.ceil(config.windowMs / 1000);

    try {
        // Atomic increment
        const current = await redis.incr(key);

        // First request in window - set expiry
        if (current === 1) {
            await redis.expire(key, windowSeconds);
        }

        // Get TTL for accurate reset time
        const ttl = await redis.ttl(key);
        const resetTime = Date.now() + (ttl > 0 ? ttl * 1000 : config.windowMs);

        return {
            success: current <= config.limit,
            remaining: Math.max(0, config.limit - current),
            resetTime,
        };
    } catch (error) {
        console.error('Redis rate limit error — falling back to in-memory limiter:', error);
        // Degrade to a per-instance in-memory limiter instead of failing fully open.
        return memoryRateLimit(identifier, config);
    }
}

// ============ PRESET RATE LIMITS ============

export const RATE_LIMITS = {
    // General API calls - 100 requests per minute
    api: { limit: 100, windowMs: 60 * 1000 },

    // Voting - 30 votes per minute (stricter to prevent abuse)
    vote: { limit: 30, windowMs: 60 * 1000 },

    // Adding songs - 5 per minute
    addSong: { limit: 5, windowMs: 60 * 1000 },

    // Search - 20 searches per minute
    search: { limit: 20, windowMs: 60 * 1000 },

    // Admin actions - 30 per minute
    admin: { limit: 30, windowMs: 60 * 1000 },

    // Export - 3 per minute (expensive operation)
    export: { limit: 3, windowMs: 60 * 1000 },

    // Per-song vote cooldown - 1 per 5 seconds per song
    voteSong: { limit: 1, windowMs: 5 * 1000 },

    // Per-IP vote CEILING - deliberately high so a whole venue sharing one NAT'd
    // wifi IP is NOT throttled, but a single scripted bot rotating identities from
    // one IP still gets capped. This backstops the spoofable header path.
    voteIpCeiling: { limit: 600, windowMs: 60 * 1000 },
} as const;

/**
 * Create rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime.toString(),
        'Retry-After': result.success ? '0' : Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
    };
}

/**
 * Helper to get client identifier from request
 * Uses multiple signals for robust identification
 */
export function getClientIdentifier(request: Request): string {
    const visitorId = request.headers.get('x-visitor-id');
    if (visitorId) return `v:${visitorId}`;

    // Fallback to IP (Vercel provides this)
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) return `ip:${forwardedFor.split(',')[0].trim()}`;

    const realIp = request.headers.get('x-real-ip');
    if (realIp) return `ip:${realIp}`;

    // Last resort - use CF-Connecting-IP (Cloudflare)
    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) return `ip:${cfIp}`;

    return 'unknown';
}

/**
 * Check per-song vote rate limit (prevents spam voting on same song)
 */
export async function checkSongVoteLimit(clientId: string, songId: string): Promise<RateLimitResult> {
    return checkRateLimit(`${clientId}:song:${songId}`, RATE_LIMITS.voteSong);
}

/**
 * Extract the real client IP. Prefer `x-real-ip` (set by Vercel to the actual
 * connecting IP, not client-controllable) over `x-forwarded-for` (whose leftmost
 * entry a client could spoof).
 */
export function getClientIp(request: Request): string {
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();

    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) return forwardedFor.split(',')[0].trim();

    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) return cfIp.trim();

    return 'unknown';
}
