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

    // Prevent clickjacking
    response.headers.set('X-Frame-Options', 'DENY');

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
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://player.twitch.tv https://embed.twitch.tv https://static.twitchcdn.net https://cdn.addevent.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https: blob:",
        "media-src 'self' https://www.youtube.com https://player.twitch.tv https://*.twitchcdn.net",
        "frame-src 'self' https://www.youtube.com https://open.spotify.com https://player.twitch.tv https://www.twitch.tv https://embed.twitch.tv https://www.addevent.com",
        "connect-src 'self' https://api.spotify.com https://*.upstash.io https://api.qrserver.com https://api.twitch.tv https://gql.twitch.tv https://*.twitchcdn.net https://www.addevent.com https://cdn.addevent.com",
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
