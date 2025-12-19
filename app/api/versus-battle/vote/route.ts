import { NextRequest, NextResponse } from 'next/server';
import { voteInVersusBattle, isUserBanned } from '@/lib/redis-store';

// POST - User votes in the battle (one and done)
export async function POST(request: NextRequest) {
    const visitorId = request.headers.get('x-visitor-id');

    if (!visitorId) {
        return NextResponse.json({ error: 'Session expired. Please refresh the page to vote in battles.' }, { status: 400 });
    }

    // Check if user is banned
    const banned = await isUserBanned(visitorId);
    if (banned) {
        return NextResponse.json({ error: 'Your account has been suspended and cannot participate in battles.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { choice } = body;

        if (!choice || (choice !== 'A' && choice !== 'B')) {
            return NextResponse.json({ error: 'Please click on one of the songs to cast your vote.' }, { status: 400 });
        }

        const result = await voteInVersusBattle(visitorId, choice);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true, voted: choice });
    } catch (error) {
        console.error('Versus vote error:', error);
        return NextResponse.json({ error: 'Could not record your vote. Please try again.' }, { status: 500 });
    }
}
