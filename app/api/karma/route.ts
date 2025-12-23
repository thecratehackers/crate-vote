import { NextResponse } from 'next/server';
import { addKarma, getUserKarma, getKarmaBonuses, grantPresenceKarma } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

// POST - Grant karma for actions
export async function POST(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);

    if (!visitorId) {
        return NextResponse.json({ error: 'Session expired. Please refresh the page to continue earning karma.' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'share') {
            // Grant 1 karma for sharing
            const newKarma = await addKarma(visitorId, 1);
            const bonuses = await getKarmaBonuses(visitorId);
            return NextResponse.json({ success: true, karma: newKarma, bonuses });
        } else if (action === 'presence') {
            // Grant 1 karma for staying 5 mins
            const result = await grantPresenceKarma(visitorId);
            if (result.success) {
                const bonuses = await getKarmaBonuses(visitorId);
                return NextResponse.json({ success: true, karma: result.karma, bonuses });
            } else {
                return NextResponse.json({ error: result.error || 'Failed' }, { status: 400 });
            }
        } else if (action === 'jukebox') {
            // Grant 1 karma for watching 60+ seconds of jukebox video
            const newKarma = await addKarma(visitorId, 1);
            const bonuses = await getKarmaBonuses(visitorId);
            return NextResponse.json({ success: true, karma: newKarma, bonuses });
        }

        return NextResponse.json({ error: 'Unknown karma action. Please refresh and try again.' }, { status: 400 });
    } catch (error) {
        console.error('Karma error:', error);
        return NextResponse.json({ error: 'Could not update karma right now. Please try again later.' }, { status: 500 });
    }
}

// GET - Get user's karma and bonuses
export async function GET(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);

    if (!visitorId) {
        return NextResponse.json({ karma: 0, bonuses: { karma: 0, bonusVotes: 0, bonusSongAdds: 0 } });
    }

    const bonuses = await getKarmaBonuses(visitorId);
    return NextResponse.json({ karma: bonuses.karma, bonuses });
}
