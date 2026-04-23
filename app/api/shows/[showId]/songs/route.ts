import { NextResponse } from 'next/server';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';
import { addShowSong } from '@/lib/stores/show-store';
import { isUserBanned } from '@/lib/redis-store';
import {
    checkRateLimit,
    RATE_LIMITS,
    getClientIdentifier,
    getRateLimitHeaders,
} from '@/lib/rate-limit';

// POST /api/shows/[showId]/songs - Add a song to a show
export async function POST(
    request: Request,
    { params }: { params: Promise<{ showId: string }> }
) {
    const { showId } = await params;
    const visitorId = getVisitorIdFromRequest(request);
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = !!adminKey && adminKey === process.env.ADMIN_PASSWORD;

    if (!visitorId) {
        return NextResponse.json(
            { error: 'Session expired. Please refresh and try again.' },
            { status: 400 }
        );
    }

    if (!isAdmin) {
        const banned = await isUserBanned(visitorId);
        if (banned) {
            return NextResponse.json(
                { error: 'Your account has been suspended.' },
                { status: 403 }
            );
        }

        const clientId = getClientIdentifier(request);
        const rateCheck = await checkRateLimit(
            `${clientId}:addSong:${showId}`,
            RATE_LIMITS.addSong
        );
        if (!rateCheck.success) {
            const response = NextResponse.json(
                { error: 'Too many requests. Please slow down.' },
                { status: 429 }
            );
            for (const [k, v] of Object.entries(getRateLimitHeaders(rateCheck))) {
                response.headers.set(k, v);
            }
            return response;
        }
    }

    try {
        const body = await request.json();
        const {
            id,
            spotifyUri,
            name,
            artist,
            album,
            albumArt,
            previewUrl,
            popularity,
            bpm,
            energy,
            valence,
            danceability,
            camelotKey,
            addedByName,
            addedByLocation,
            remixTag,
            durationMs,
        } = body;

        if (!id || !spotifyUri || !name || !artist) {
            return NextResponse.json({ error: 'Missing required song fields.' }, { status: 400 });
        }
        if (!/^[a-zA-Z0-9]{22}$/.test(id)) {
            return NextResponse.json({ error: 'Invalid Spotify track ID.' }, { status: 400 });
        }
        if (!/^spotify:track:[a-zA-Z0-9]{22}$/.test(spotifyUri)) {
            return NextResponse.json({ error: 'Invalid Spotify URI.' }, { status: 400 });
        }

        const MAX_DURATION_MS = 8 * 60 * 1000;
        if (!isAdmin && durationMs && durationMs > MAX_DURATION_MS) {
            return NextResponse.json(
                { error: 'Songs longer than 8 minutes are not allowed.' },
                { status: 400 }
            );
        }

        const sanitizedName = (addedByName || 'Anonymous')
            .replace(/<[^>]*>/g, '')
            .replace(/[<>"'&]/g, '')
            .trim()
            .slice(0, 50);

        const sanitizedRemix = remixTag
            ? String(remixTag).replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().slice(0, 80) || undefined
            : undefined;

        const result = await addShowSong({
            showId,
            visitorId,
            isAdmin,
            song: {
                id,
                spotifyUri,
                name,
                artist,
                album: album || '',
                albumArt: albumArt || '',
                previewUrl: previewUrl || null,
                addedBy: visitorId,
                addedByName: isAdmin ? `${sanitizedName} (admin)` : sanitizedName,
                addedByLocation,
                remixTag: sanitizedRemix,
                popularity: popularity || 0,
                bpm: bpm || null,
                energy: energy || null,
                valence: valence || null,
                danceability: danceability || null,
                camelotKey: camelotKey || null,
            },
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true, song: result.song });
    } catch (error) {
        console.error('Add show song error:', error);
        return NextResponse.json({ error: 'Could not add song.' }, { status: 500 });
    }
}
