import { NextResponse } from 'next/server';
import { vote, adminVote, isPlaylistLocked, addActivity } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

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
        console.log('Vote failed: No visitor ID');
        return NextResponse.json({ error: 'Visitor ID required' }, { status: 400 });
    }

    // Check if playlist is locked (skip for admins)
    if (!isAdmin) {
        const locked = await isPlaylistLocked();
        if (locked) {
            console.log('Vote failed: Playlist is locked');
            return NextResponse.json({ error: 'Playlist is locked' }, { status: 400 });
        }
    }

    try {
        const body = await request.json();
        const { vote: voteDirection, userName, songName } = body;

        if (voteDirection !== 1 && voteDirection !== -1) {
            console.log('Vote failed: Invalid vote value', voteDirection);
            return NextResponse.json({ error: 'Vote must be 1 or -1' }, { status: 400 });
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
                songName,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Vote error:', error);
        return NextResponse.json({ error: 'Failed to vote' }, { status: 500 });
    }
}
