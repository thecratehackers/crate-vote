import { NextResponse } from 'next/server';
import { bombSong, getNowPlaying, getNowPlayingBombCount, setNowPlaying, clearNowPlaying, isUserBanned } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

// GET - Get now-playing status + bomb count
export async function GET() {
    const [nowPlaying, bombData] = await Promise.all([
        getNowPlaying(),
        getNowPlayingBombCount(),
    ]);

    return NextResponse.json({
        nowPlaying,
        bombCount: bombData.bombCount,
        bombThreshold: bombData.threshold,
    });
}

// POST - Bomb the currently playing song
export async function POST(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);
    if (!visitorId) {
        return NextResponse.json({ error: 'Session expired. Refresh and try again.' }, { status: 400 });
    }

    // Check if banned
    const banned = await isUserBanned(visitorId);
    if (banned) {
        return NextResponse.json({ error: 'Your account has been suspended.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { songId } = body;

        if (!songId || typeof songId !== 'string') {
            return NextResponse.json({ error: 'Invalid song ID.' }, { status: 400 });
        }

        const result = await bombSong(songId, visitorId);

        if (!result.success) {
            return NextResponse.json({ error: result.error, bombCount: result.bombCount, threshold: result.threshold }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            bombCount: result.bombCount,
            threshold: result.threshold,
            bombed: result.bombed,
        });
    } catch (error) {
        console.error('Bomb error:', error);
        return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
    }
}

// PUT - Set or clear the now-playing state (called by jukebox host)
export async function PUT(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);
    if (!visitorId) {
        return NextResponse.json({ error: 'Session expired.' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { action, songId, songName, artistName, albumArt } = body;

        if (action === 'clear') {
            await clearNowPlaying();
            return NextResponse.json({ success: true });
        }

        if (action === 'set') {
            if (!songId || !songName || !artistName) {
                return NextResponse.json({ error: 'Missing song data.' }, { status: 400 });
            }

            await setNowPlaying({
                songId,
                songName,
                artistName,
                albumArt: albumArt || '',
                startedAt: Date.now(),
            });
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    } catch (error) {
        console.error('Now-playing update error:', error);
        return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
    }
}
