import { NextResponse } from 'next/server';
import { exchangeTidalCode } from '@/lib/tidal';
import { APP_CONFIG } from '@/lib/config';
import { cookies } from 'next/headers';

// GET /api/tidal/callback — Handles TIDAL OAuth 2.1 callback
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    const baseUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : 'https://crateoftheweek.com';

    if (error) {
        console.error('TIDAL auth error:', error, searchParams.get('error_description'));
        return NextResponse.redirect(new URL('/export?tidal_error=denied', baseUrl));
    }

    if (!code || !state) {
        return NextResponse.redirect(new URL('/export?tidal_error=missing_params', baseUrl));
    }

    // Validate state
    const cookieStore = await cookies();
    const storedState = cookieStore.get('tidal_state')?.value;
    const codeVerifier = cookieStore.get('tidal_code_verifier')?.value;

    if (!storedState || storedState !== state) {
        console.error('TIDAL state mismatch:', { storedState, state });
        return NextResponse.redirect(new URL('/export?tidal_error=state_mismatch', baseUrl));
    }

    if (!codeVerifier) {
        console.error('Missing TIDAL code verifier');
        return NextResponse.redirect(new URL('/export?tidal_error=missing_verifier', baseUrl));
    }

    // Clean up PKCE cookies
    cookieStore.delete('tidal_state');
    cookieStore.delete('tidal_code_verifier');

    const redirectUri = `${baseUrl}/api/tidal/callback`;

    try {
        // Exchange code for tokens
        const tokens = await exchangeTidalCode({
            code,
            redirectUri,
            codeVerifier,
        });

        // Store TIDAL session in cookies (these are used by the export endpoint)
        cookieStore.set('tidal_access_token', tokens.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: tokens.expiresIn,
            path: '/',
        });

        if (tokens.refreshToken) {
            cookieStore.set('tidal_refresh_token', tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 30, // 30 days
                path: '/',
            });
        }

        // Redirect to export page with success flag
        return NextResponse.redirect(new URL('/export?tidal_connected=true', baseUrl));
    } catch (err) {
        console.error('TIDAL token exchange failed:', err);
        return NextResponse.redirect(new URL('/export?tidal_error=exchange_failed', baseUrl));
    }
}
