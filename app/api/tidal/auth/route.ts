import { NextResponse } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, buildTidalAuthUrl } from '@/lib/tidal';
import { APP_CONFIG } from '@/lib/config';
import { cookies } from 'next/headers';

// GET /api/tidal/auth — Initiates TIDAL OAuth 2.1 PKCE flow
export async function GET() {
    const clientId = process.env.TIDAL_CLIENT_ID?.trim();

    if (!clientId) {
        return NextResponse.json({ error: 'TIDAL not configured' }, { status: 500 });
    }

    // NOTE: Must use crateoftheweek.com — the actual Vercel domain.
    // cratehackathon.com is a Squarespace forward and won't receive callbacks.
    const baseUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : 'https://crateoftheweek.com';

    const redirectUri = `${baseUrl}/api/tidal/callback`;

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = Math.random().toString(36).slice(2, 18);

    // Store PKCE verifier + state in cookies (secure, httpOnly)
    const cookieStore = await cookies();
    cookieStore.set('tidal_code_verifier', codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/',
    });
    cookieStore.set('tidal_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
    });

    const authUrl = buildTidalAuthUrl({
        clientId,
        redirectUri,
        codeChallenge,
        state,
    });

    return NextResponse.redirect(authUrl);
}
