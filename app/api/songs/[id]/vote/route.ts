import { NextResponse } from 'next/server';
import { vote, adminVote, isPlaylistLocked, addActivity } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';
import { checkRateLimit, RATE_LIMITS, getClientIdentifier, getRateLimitHeaders } from '@/lib/rate-limit';

// POST - Vote on a song
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const visitorId = getVisitorIdFromRequest(request);
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = adminKey && adminKey === process.env.ADMIN_PASSWORD;

    if (!visitorId) {
        return NextResponse.json({ error: 'Session expired. Please refresh the page and enter your name to vote.' }, { status: 400 });
    }

    // Rate limiting for non-admin requests
    if (!isAdmin) {
        const clientId = getClientIdentifier(request);
        const rateCheck = checkRateLimit(clientId + ':vote', RATE_LIMITS.vote);
        if (!rateCheck.success) {
            const response = NextResponse.json(
                { error: 'Slow down! You\'re voting too fast.' },
                { status: 429 }
            );
            const headers = getRateLimitHeaders(rateCheck);
            Object.entries(headers).forEach(([key, value]) => {
                response.headers.set(key, value);
            });
            return response;
        }
    }

    // Check if playlist is locked (skip for admins)
    if (!isAdmin) {
        const locked = await isPlaylistLocked();
        if (locked) {
            return NextResponse.json({ error: 'Voting is currently paused. Wait for the host to unlock the playlist to continue voting.' }, { status: 400 });
        }
    }

    try {
        const body = await request.json();
        const { vote: voteDirection, userName, songName } = body;

        if (voteDirection !== 1 && voteDirection !== -1) {
            return NextResponse.json({ error: 'Invalid vote. Please try clicking the vote button again.' }, { status: 400 });
        }

        // Use adminVote for admins (unlimited), regular vote for users
        const result = isAdmin
            ? await adminVote(id, visitorId, voteDirection)
            : await vote(id, visitorId, voteDirection);

        if (!result.success) {
            console.log('Vote failed:', result.error);
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // 📢 Log activity for live feed (only if we have the info)
        if (userName && songName) {
            await addActivity({
                type: voteDirection === 1 ? 'upvote' : 'downvote',
                userName,
                visitorId,
                songName,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Vote error:', error);
        return NextResponse.json({ error: 'Something went wrong. Please refresh and try voting again.' }, { status: 500 });
    }
}
