import { NextRequest, NextResponse } from 'next/server';
import { resolvePreviewUrl } from '@/lib/preview-resolver';

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

        const result = await resolvePreviewUrl({
            artist,
            songName,
        });

        if (!result.previewUrl) {
            return NextResponse.json({ previewUrl: null, source: 'none' });
        }

        return NextResponse.json({
            previewUrl: result.previewUrl,
            source: result.source,
            matchedArtist: result.matchedArtist,
            matchedTrack: result.matchedTrack,
        });
    } catch (error) {
        console.error('Preview lookup failed:', error);
        return NextResponse.json(
            { previewUrl: null, source: 'none', error: 'lookup failed' },
            { status: 500 }
        );
    }
}
