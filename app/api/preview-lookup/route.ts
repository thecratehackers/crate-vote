import { NextRequest, NextResponse } from 'next/server';
import { searchTracks } from '@/lib/itunes';

// Public endpoint. Takes { artist, songName } and returns a working preview URL
// from iTunes (which is far more reliable than Spotify's previewUrl field).
//
// Response: { previewUrl: string | null, source: 'itunes' | 'none' }
//
// Used as a fallback by the Artist Versus host UI when Spotify's previewUrl is
// missing or playback fails.
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { artist, songName } = body || {};

        if (typeof artist !== 'string' || !artist.trim()) {
            return NextResponse.json(
                { previewUrl: null, source: 'none', error: 'artist required' },
                { status: 400 }
            );
        }

        // Build a focused query. iTunes ranks well when given "artist songName"
        // but works fine with just an artist name too (will return their top tracks).
        const query = songName?.trim()
            ? `${artist.trim()} ${songName.trim()}`
            : artist.trim();

        const results = await searchTracks(query, 5);

        // Find the first result that actually has a previewUrl. iTunes almost
        // always returns one for major-label tracks but indie stuff occasionally
        // skips it.
        const hit = results.find(r => !!r.previewUrl);

        if (!hit?.previewUrl) {
            return NextResponse.json({ previewUrl: null, source: 'none' });
        }

        return NextResponse.json({
            previewUrl: hit.previewUrl,
            source: 'itunes',
            matchedArtist: hit.artist,
            matchedTrack: hit.name,
        });
    } catch (error) {
        console.error('Preview lookup failed:', error);
        return NextResponse.json(
            { previewUrl: null, source: 'none', error: 'lookup failed' },
            { status: 500 }
        );
    }
}
