import { NextResponse } from 'next/server';
import { getSortedSongs, updateSongAudioFeatures } from '@/lib/redis-store';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';

async function getClientToken(): Promise<string> {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Missing Spotify credentials');
    }

    const response = await fetch(SPOTIFY_AUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error('Failed to get Spotify token');
    }

    const data = await response.json();
    return data.access_token;
}

// POST - Refresh audio features for all songs
export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');
    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        const token = await getClientToken();
        const songs = await getSortedSongs();

        if (songs.length === 0) {
            return NextResponse.json({ message: 'No songs to refresh', updated: 0 });
        }

        const trackIds = songs.map(s => s.id);

        // Fetch audio features for all tracks
        const featuresResponse = await fetch(
            `${SPOTIFY_API_BASE}/audio-features?ids=${trackIds.join(',')}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            }
        );

        if (!featuresResponse.ok) {
            const error = await featuresResponse.text();
            console.error('Audio features API error:', error);
            return NextResponse.json({ error: 'Could not fetch audio features from Spotify. Please try again later.' }, { status: 500 });
        }

        const featuresData = await featuresResponse.json();
        let updatedCount = 0;

        // Update each song with its audio features
        for (const feature of featuresData.audio_features) {
            if (feature) {
                await updateSongAudioFeatures(feature.id, {
                    bpm: Math.round(feature.tempo),
                    energy: feature.energy,
                    valence: feature.valence,
                    danceability: feature.danceability,
                });
                updatedCount++;
            }
        }

        return NextResponse.json({
            message: `Refreshed audio features for ${updatedCount} songs`,
            updated: updatedCount,
            total: songs.length
        });
    } catch (error) {
        console.error('Refresh features error:', error);
        return NextResponse.json({ error: 'Could not refresh song features. Please try again.' }, { status: 500 });
    }
}
