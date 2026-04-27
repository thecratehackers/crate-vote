import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for security headers and request processing
 * Runs on every request to add security protections
 */
export function middleware(request: NextRequest) {
    // Clone the response
    const response = NextResponse.next();

    // ============ SECURITY HEADERS ============

    // Do not set X-Frame-Options here. The vote app is intentionally embedded
    // on the hackathon page, and X-Frame-Options would block that iframe.

    // Prevent MIME type sniffing
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // Enable browser XSS protection
    response.headers.set('X-XSS-Protection', '1; mode=block');

    // Referrer policy - don't leak full URL
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy - restrict sensitive features
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Content Security Policy - allow Spotify, YouTube, and essential services
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://player.twitch.tv https://embed.twitch.tv https://static.twitchcdn.net https://app.kartra.com https://va.vercel-scripts.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://app.kartra.com",
        "font-src 'self' https://fonts.gstatic.com https://d2uolguxr56s4e.cloudfront.net",
        "img-src 'self' data: https: blob:",
        "media-src 'self' https://www.youtube.com https://player.twitch.tv https://*.twitchcdn.net",
        "frame-src 'self' https://www.youtube.com https://open.spotify.com https://player.twitch.tv https://www.twitch.tv https://embed.twitch.tv https://app.kartra.com https://crateoftheweek.com https://www.crateoftheweek.com",
        "frame-ancestors 'self' https://cratehackathon.com https://www.cratehackathon.com https://*.cratehackathon.com https://crateoftheweek.com https://www.crateoftheweek.com https://*.kartra.com https://kartra.com",
        "connect-src 'self' https://api.spotify.com https://*.upstash.io https://api.qrserver.com https://api.twitch.tv https://gql.twitch.tv https://*.twitchcdn.net https://app.kartra.com https://vitals.vercel-insights.com",
        "form-action 'self' https://app.kartra.com https://*.kartra.com https://crateoftheweek.com https://www.crateoftheweek.com",
        "worker-src 'self' blob:",
    ].join('; ');

    response.headers.set('Content-Security-Policy', csp);

    return response;
}

// Apply to all routes except static files
export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
