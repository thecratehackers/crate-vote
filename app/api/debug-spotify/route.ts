import { NextResponse } from 'next/server';

// Simple test to debug Spotify playlist API
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('id') || '37i9dQZF1DX6xnkAwJX7tn';

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: 'Missing Spotify credentials', hasId: !!clientId, hasSecret: !!clientSecret });
    }

    // Get token
    try {
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            },
            body: 'grant_type=client_credentials',
            cache: 'no-store',
        });

        if (!tokenResponse.ok) {
            const err = await tokenResponse.text();
            return NextResponse.json({ error: 'Token failed', status: tokenResponse.status, details: err });
        }

        const tokenData = await tokenResponse.json();
        const token = tokenData.access_token;

        // Try to fetch the playlist
        const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}`;
        console.log('Fetching playlist from:', playlistUrl);

        const playlistResponse = await fetch(playlistUrl, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        });

        const responseText = await playlistResponse.text();

        return NextResponse.json({
            playlistId,
            url: playlistUrl,
            status: playlistResponse.status,
            ok: playlistResponse.ok,
            response: playlistResponse.ok ? JSON.parse(responseText) : responseText,
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Exception',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
