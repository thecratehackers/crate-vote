import { NextResponse } from 'next/server';
import { bombSong, getNowPlaying, getNowPlayingBombCount, setNowPlaying, clearNowPlaying, isUserBanned } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';
import { resolveVoterIdentity, attachVoterCookie } from '@/lib/identity';
import { checkRateLimit, RATE_LIMITS, getRateLimitHeaders, getClientIp } from '@/lib/rate-limit';

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
    // Server-authoritative identity: a valid signed cookie wins; otherwise we mint
    // one (seeded from the fingerprint header) and set it below. This makes the
    // per-user bomb dedupe key hard to forge, so a single troll can't stack bombs
    // and skip the whole room's now-playing song by rotating their visitor id.
    const identity = resolveVoterIdentity(request, getVisitorIdFromRequest(request));
    const visitorId = identity.id;

    const respond = (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
        const res = NextResponse.json(body, { status: init?.status });
        if (init?.headers) {
            Object.entries(init.headers).forEach(([k, v]) => res.headers.set(k, v));
        }
        attachVoterCookie(res, identity);
        return res;
    };

    if (!visitorId) {
        return respond({ error: 'Session expired. Refresh and try again.' }, { status: 400 });
    }

    // Per-IP ceiling — un-spoofable backstop. Stops one laptop from stacking bombs
    // across rotated identities to force-skip the live song.
    const ip = getClientIp(request);
    const ipCheck = await checkRateLimit(`ip:${ip}:bomb`, RATE_LIMITS.voteIpCeiling);
    if (!ipCheck.success) {
        return respond(
            { error: 'Too many bombs from this network right now. Please wait a moment.' },
            { status: 429, headers: getRateLimitHeaders(ipCheck) }
        );
    }

    // Per-identity bomb rate limit.
    const rateCheck = await checkRateLimit(`v:${visitorId}:bomb`, RATE_LIMITS.vote);
    if (!rateCheck.success) {
        return respond(
            { error: 'Slow down — you\'re bombing too fast. Try again in a few seconds.' },
            { status: 429, headers: getRateLimitHeaders(rateCheck) }
        );
    }

    // Check if banned
    const banned = await isUserBanned(visitorId);
    if (banned) {
        return respond({ error: 'Your account has been suspended.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { songId } = body;

        if (!songId || typeof songId !== 'string' || songId.length > 100) {
            return respond({ error: 'Invalid song ID.' }, { status: 400 });
        }

        const result = await bombSong(songId, visitorId);

        if (!result.success) {
            return respond({ error: result.error, bombCount: result.bombCount, threshold: result.threshold }, { status: 400 });
        }

        return respond({
            success: true,
            bombCount: result.bombCount,
            threshold: result.threshold,
            bombed: result.bombed,
        });
    } catch (error) {
        console.error('Bomb error:', error);
        return respond({ error: 'Something went wrong. Try again.' }, { status: 500 });
    }
}

// PUT - Set or clear the now-playing state (jukebox host only — admin-gated so a
// random participant can't hijack what the whole room sees as "now playing").
export async function PUT(request: Request) {
    const adminKey = request.headers.get('x-admin-key');
    if (!adminKey || adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Admin access required to control now-playing.' }, { status: 401 });
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
