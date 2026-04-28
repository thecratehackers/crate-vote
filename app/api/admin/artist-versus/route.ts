import { NextRequest, NextResponse } from 'next/server';
import {
    getArtistVersusStatus,
    startArtistVersus,
    pickArtistVersus,
    bombArtistVersus,
    advanceArtistVersusRound,
    endArtistVersus,
    cancelArtistVersus,
} from '@/lib/redis-store';

function isAdmin(request: NextRequest): boolean {
    const adminKey = request.headers.get('x-admin-key');
    const expected = process.env.ADMIN_PASSWORD;
    return !!expected && adminKey === expected;
}

// GET - Full session state for admin polling
export async function GET(request: NextRequest) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    const status = await getArtistVersusStatus();
    return NextResponse.json(status);
}

// POST - All session actions: start, pick, bomb, next, end, cancel
export async function POST(request: NextRequest) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, choice, target, playerName } = body;

        switch (action) {
            case 'start': {
                const result = await startArtistVersus(playerName);
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, state: result.state });
            }

            case 'pick': {
                if (choice !== 'A' && choice !== 'B') {
                    return NextResponse.json({ error: 'Pick requires choice "A" or "B".' }, { status: 400 });
                }
                const result = await pickArtistVersus(choice);
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, state: result.state });
            }

            case 'bomb': {
                if (target !== 'A' && target !== 'B') {
                    return NextResponse.json({ error: 'Bomb requires target "A" or "B".' }, { status: 400 });
                }
                const result = await bombArtistVersus(target);
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({
                    success: true,
                    state: result.state,
                    nukedSongCount: result.nukedSongCount,
                });
            }

            case 'next': {
                const result = await advanceArtistVersusRound();
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, state: result.state });
            }

            case 'end': {
                const result = await endArtistVersus();
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, state: result.state });
            }

            case 'cancel': {
                await cancelArtistVersus();
                return NextResponse.json({ success: true, message: 'Artist Versus cancelled' });
            }

            default:
                return NextResponse.json({ error: 'Unknown artist versus action.' }, { status: 400 });
        }
    } catch (error) {
        console.error('Admin artist versus error:', error);
        return NextResponse.json({ error: 'Could not complete artist versus action. Please try again.' }, { status: 500 });
    }
}
