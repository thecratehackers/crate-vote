import { NextRequest, NextResponse } from 'next/server';
import {
    startVersusBattle,
    getVersusBattleStatus,
    resolveVersusBattle,
    startLightningRound,
    cancelVersusBattle,
} from '@/lib/redis-store';

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';

// Verify admin key
function isAdmin(request: NextRequest): boolean {
    const adminKey = request.headers.get('x-admin-key');
    return adminKey === ADMIN_KEY;
}

// GET - Get battle status (with vote counts for admin)
export async function GET(request: NextRequest) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    const status = await getVersusBattleStatus(undefined, true); // Include vote counts for admin
    return NextResponse.json(status);
}

// POST - Start battle, resolve, lightning round, override, or cancel
export async function POST(request: NextRequest) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, winner } = body;

        switch (action) {
            case 'start': {
                const result = await startVersusBattle();
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({
                    success: true,
                    songA: result.songA,
                    songB: result.songB,
                    endTime: result.endTime,
                });
            }

            case 'resolve': {
                const result = await resolveVersusBattle();
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }

                // If it's a tie, return that info so admin can trigger lightning round
                if (result.isTie) {
                    return NextResponse.json({
                        success: true,
                        isTie: true,
                        votesA: result.votesA,
                        votesB: result.votesB,
                        message: 'Tie! Start lightning round or override.',
                    });
                }

                return NextResponse.json({
                    success: true,
                    winner: result.winner,
                    loser: result.loser,
                    deletedSongName: result.deletedSongName,
                    votesA: result.votesA,
                    votesB: result.votesB,
                });
            }

            case 'lightning': {
                const result = await startLightningRound();
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({
                    success: true,
                    endTime: result.endTime,
                    message: '⚡ Lightning round started! 15 seconds!',
                });
            }

            case 'override': {
                if (!winner || (winner !== 'A' && winner !== 'B')) {
                    return NextResponse.json({ error: 'Please specify which song wins (A or B).' }, { status: 400 });
                }
                const result = await resolveVersusBattle(winner);
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({
                    success: true,
                    winner: result.winner,
                    loser: result.loser,
                    deletedSongName: result.deletedSongName,
                    votesA: result.votesA,
                    votesB: result.votesB,
                    message: `Admin override: Song ${winner} wins!`,
                });
            }

            case 'cancel': {
                await cancelVersusBattle();
                return NextResponse.json({ success: true, message: 'Battle cancelled' });
            }

            default:
                return NextResponse.json({ error: 'Unknown battle action. Please refresh and try again.' }, { status: 400 });
        }
    } catch (error) {
        console.error('Admin versus battle error:', error);
        return NextResponse.json({ error: 'Could not complete battle action. Please try again.' }, { status: 500 });
    }
}
