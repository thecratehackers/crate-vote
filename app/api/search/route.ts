import { NextResponse } from 'next/server';
import { searchTracks } from '@/lib/spotify';
import { checkRateLimit, RATE_LIMITS, getClientIdentifier, getRateLimitHeaders } from '@/lib/rate-limit';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Please enter a song name or artist to search.' }, { status: 400 });
    }

    // Sanitize query for safe display in error messages (prevent XSS)
    const safeQuery = query.slice(0, 50).replace(/[<>"'&]/g, '');

    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateCheck = await checkRateLimit(clientId + ':search', RATE_LIMITS.search);
    if (!rateCheck.success) {
        const response = NextResponse.json(
            { error: 'Too many searches. Please wait a moment before searching again.' },
            { status: 429 }
        );
        const headers = getRateLimitHeaders(rateCheck);
        Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
        return response;
    }

    try {
        const tracks = await searchTracks(query, 10);
        return NextResponse.json({ tracks });
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            console.error('Search error:', error);
        }
        return NextResponse.json({ error: 'Could not search Spotify at this time. Please try again in a moment.' }, { status: 500 });
    }
}

