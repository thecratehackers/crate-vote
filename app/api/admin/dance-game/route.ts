import { NextRequest, NextResponse } from 'next/server';
import {
    getDanceGameStatus,
    startDanceGame,
    spinDanceGame,
    endDanceGame,
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

    const status = await getDanceGameStatus();
    return NextResponse.json(status);
}

// POST - All session actions: start, spin, end
export async function POST(request: NextRequest) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const { action } = body;

        switch (action) {
            case 'start': {
                const result = await startDanceGame();
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, state: result.state });
            }

            case 'spin': {
                const result = await spinDanceGame();
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, state: result.state });
            }

            case 'end': {
                await endDanceGame();
                return NextResponse.json({ success: true, message: 'Can You Dance To It? ended.' });
            }

            default:
                return NextResponse.json({ error: 'Unknown dance game action.' }, { status: 400 });
        }
    } catch (error) {
        console.error('Admin dance game error:', error);
        return NextResponse.json({ error: 'Could not complete dance game action. Please try again.' }, { status: 500 });
    }
}
