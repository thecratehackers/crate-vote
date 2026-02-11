import { NextResponse } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, buildTidalAuthUrl } from '@/lib/tidal';

// GET /api/tidal/debug — Shows the auth URL that would be generated (debug only)
export async function GET() {
    const clientId = process.env.TIDAL_CLIENT_ID?.trim();

    if (!clientId) {
        return NextResponse.json({ error: 'TIDAL not configured', hasClientId: false });
    }

    const baseUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : 'https://crateoftheweek.com';

    const redirectUri = `${baseUrl}/api/tidal/callback`;

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const authUrl = buildTidalAuthUrl({
        clientId,
        redirectUri,
        codeChallenge,
        state: 'debug_test',
    });

    return NextResponse.json({
        clientId,
        redirectUri,
        codeChallenge,
        authUrl,
        nodeEnv: process.env.NODE_ENV,
    });
}
