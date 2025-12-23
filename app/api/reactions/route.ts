import { NextResponse } from 'next/server';
import { addReaction, removeReaction, getUserReaction, getReactionCounts } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

// POST - Add or toggle a reaction
export async function POST(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);

    if (!visitorId) {
        return NextResponse.json({ error: 'Session required' }, { status: 400 });
    }

    try {
        const { songId, reaction } = await request.json();

        if (!songId || !reaction) {
            return NextResponse.json({ error: 'Missing songId or reaction' }, { status: 400 });
        }

        // Validate reaction type
        const validReactions = ['fire', 'skull', 'laugh', 'heart'];
        if (!validReactions.includes(reaction)) {
            return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
        }

        // Check if user already has this reaction (toggle off)
        const currentReaction = await getUserReaction(songId, visitorId);

        if (currentReaction === reaction) {
            // Remove the reaction (toggle off)
            const result = await removeReaction(songId, visitorId, reaction);
            return NextResponse.json({
                success: true,
                action: 'removed',
                reaction: null,
                counts: result.counts
            });
        } else {
            // Add/change the reaction
            const result = await addReaction(songId, visitorId, reaction);
            return NextResponse.json({
                success: true,
                action: 'added',
                reaction,
                counts: result.counts
            });
        }
    } catch (error) {
        console.error('Reaction error:', error);
        return NextResponse.json({ error: 'Failed to process reaction' }, { status: 500 });
    }
}

// GET - Get reaction counts and user's reaction for a song
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const songId = searchParams.get('songId');
    const visitorId = getVisitorIdFromRequest(request);

    if (!songId) {
        return NextResponse.json({ error: 'Missing songId' }, { status: 400 });
    }

    try {
        const counts = await getReactionCounts(songId);
        const userReaction = visitorId ? await getUserReaction(songId, visitorId) : null;

        return NextResponse.json({ counts, userReaction });
    } catch (error) {
        console.error('Get reactions error:', error);
        return NextResponse.json({ error: 'Failed to get reactions' }, { status: 500 });
    }
}
