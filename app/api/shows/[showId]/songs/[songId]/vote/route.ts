import { NextResponse } from 'next/server';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';
import {
    voteOnShowSong,
    getSortedSongsForShow,
    getUserVotesForShow,
} from '@/lib/stores/show-store';
import { isUserBanned, censorProfanity } from '@/lib/redis-store';
import {
    checkRateLimit,
    checkSongVoteLimit,
    RATE_LIMITS,
    getClientIdentifier,
    getRateLimitHeaders,
} from '@/lib/rate-limit';

// POST /api/shows/[showId]/songs/[songId]/vote
export async function POST(
    request: Request,
    { params }: { params: Promise<{ showId: string; songId: string }> }
) {
    const { showId, songId } = await params;
    const visitorId = getVisitorIdFromRequest(request);
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = !!adminKey && adminKey === process.env.ADMIN_PASSWORD;

    if (!visitorId) {
        return NextResponse.json(
            { error: 'Session expired. Please refresh and try again.' },
            { status: 400 }
        );
    }

    if (!isAdmin) {
        const banned = await isUserBanned(visitorId);
        if (banned) {
            return NextResponse.json({ error: 'Your account has been suspended.' }, { status: 403 });
        }

        const clientId = getClientIdentifier(request);
        const globalCheck = await checkRateLimit(`${clientId}:vote:${showId}`, RATE_LIMITS.vote);
        if (!globalCheck.success) {
            const response = NextResponse.json(
                { error: "Slow down! You're voting too fast." },
                { status: 429 }
            );
            for (const [k, v] of Object.entries(getRateLimitHeaders(globalCheck))) {
                response.headers.set(k, v);
            }
            return response;
        }

        const songCheck = await checkSongVoteLimit(clientId, `${showId}:${songId}`);
        if (!songCheck.success) {
            const response = NextResponse.json(
                { error: 'Wait a moment before voting on this song again.' },
                { status: 429 }
            );
            for (const [k, v] of Object.entries(getRateLimitHeaders(songCheck))) {
                response.headers.set(k, v);
            }
            return response;
        }
    }

    try {
        const body = await request.json();
        const { vote: direction } = body;
        if (direction !== 1 && direction !== -1) {
            return NextResponse.json({ error: 'Invalid vote direction.' }, { status: 400 });
        }

        const result = await voteOnShowSong(showId, songId, visitorId, direction, isAdmin);
        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // Return fresh state for instant client update
        const [songs, userVotes] = await Promise.all([
            getSortedSongsForShow(showId),
            getUserVotesForShow(showId, visitorId),
        ]);

        const censored = songs.map((s) => ({
            ...s,
            name: censorProfanity(s.name),
            artist: censorProfanity(s.artist),
        }));

        return NextResponse.json({
            success: true,
            freshState: { songs: censored, userVotes },
        });
    } catch (error) {
        console.error('Vote error:', error);
        return NextResponse.json({ error: 'Could not record vote.' }, { status: 500 });
    }
}
