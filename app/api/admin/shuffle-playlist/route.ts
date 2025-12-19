import { NextResponse } from 'next/server';
import { shufflePlaylist } from '@/lib/redis-store';

// POST - Shuffle all songs in the playlist
export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');

    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        const result = await shufflePlaylist();

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Shuffle failed' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: `Shuffled ${result.shuffledCount} songs`,
            shuffledCount: result.shuffledCount,
        });
    } catch (error) {
        console.error('Shuffle playlist error:', error);
        return NextResponse.json(
            { error: 'Could not shuffle playlist. Please try again.' },
            { status: 500 }
        );
    }
}
