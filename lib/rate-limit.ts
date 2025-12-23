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
        console.error('Redis rate limit error:', error);
        // Fail open on Redis errors to not break the app
        return {
            success: true,
            remaining: config.limit,
            resetTime: Date.now() + config.windowMs,
        };
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
