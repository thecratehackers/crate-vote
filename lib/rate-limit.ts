/**
 * Simple in-memory rate limiter for API routes
 * For production, consider using Redis-based rate limiting (Upstash has @upstash/ratelimit)
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// In-memory store (resets on server restart - acceptable for Vercel serverless)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
    const now = Date.now();
    const entries = Array.from(rateLimitStore.entries());
    for (let i = 0; i < entries.length; i++) {
        const [key, entry] = entries[i];
        if (entry.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean up every minute

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
 * Check if a request should be rate limited
 * @param identifier - Unique identifier for the client (visitor ID, IP, etc.)
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed, remaining requests, and reset time
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): RateLimitResult {
    const now = Date.now();
    const key = identifier;
    const entry = rateLimitStore.get(key);

    // If no entry or window expired, start fresh
    if (!entry || entry.resetTime < now) {
        const resetTime = now + config.windowMs;
        rateLimitStore.set(key, { count: 1, resetTime });
        return {
            success: true,
            remaining: config.limit - 1,
            resetTime,
        };
    }

    // Window still active
    if (entry.count >= config.limit) {
        return {
            success: false,
            remaining: 0,
            resetTime: entry.resetTime,
        };
    }

    // Increment count
    entry.count++;
    return {
        success: true,
        remaining: config.limit - entry.count,
        resetTime: entry.resetTime,
    };
}

// ============ PRESET RATE LIMITS ============

export const RATE_LIMITS = {
    // General API calls - 100 requests per minute
    api: { limit: 100, windowMs: 60 * 1000 },

    // Voting - 60 votes per minute (generous for rapid voting)
    vote: { limit: 60, windowMs: 60 * 1000 },

    // Adding songs - 10 per minute
    addSong: { limit: 10, windowMs: 60 * 1000 },

    // Search - 30 searches per minute
    search: { limit: 30, windowMs: 60 * 1000 },

    // Admin actions - 30 per minute
    admin: { limit: 30, windowMs: 60 * 1000 },

    // Export - 5 per minute (expensive operation)
    export: { limit: 5, windowMs: 60 * 1000 },
} as const;

/**
 * Create rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime.toString(),
    };
}

/**
 * Helper to get client identifier from request
 * Prefers visitor ID, falls back to IP
 */
export function getClientIdentifier(request: Request): string {
    const visitorId = request.headers.get('x-visitor-id');
    if (visitorId) return `v:${visitorId}`;

    // Fallback to IP (Vercel provides this)
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) return `ip:${forwardedFor.split(',')[0]}`;

    const realIp = request.headers.get('x-real-ip');
    if (realIp) return `ip:${realIp}`;

    return 'unknown';
}
