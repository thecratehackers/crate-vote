import { NextResponse } from 'next/server';
import { searchMusicVideo, isYouTubeConfigured } from '@/lib/youtube';
import { checkRateLimit, RATE_LIMITS, getClientIdentifier, getRateLimitHeaders } from '@/lib/rate-limit';

export async function GET(request: Request) {
    // Check if YouTube API is configured
    if (!isYouTubeConfigured()) {
        return NextResponse.json(
            { error: 'YouTube API not configured', videoId: null },
            { status: 503 }
        );
    }

    const { searchParams } = new URL(request.url);
    const song = searchParams.get('song');
    const artist = searchParams.get('artist');

    if (!song || !artist) {
        return NextResponse.json(
            { error: 'Missing song or artist parameter', videoId: null },
            { status: 400 }
        );
    }

    // Rate limiting - use search limit
    const clientId = getClientIdentifier(request);
    const rateCheck = checkRateLimit(clientId + ':youtube', RATE_LIMITS.search);
    if (!rateCheck.success) {
        const response = NextResponse.json(
            { error: 'Too many requests', videoId: null },
            { status: 429 }
        );
        const headers = getRateLimitHeaders(rateCheck);
        Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
        return response;
    }

    try {
        const videoId = await searchMusicVideo(song, artist);

        return NextResponse.json({
            videoId,
            song,
            artist,
        });
    } catch (error) {
        console.error('YouTube search error:', error);
        return NextResponse.json(
            { error: 'Failed to search YouTube', videoId: null },
            { status: 500 }
        );
    }
}
