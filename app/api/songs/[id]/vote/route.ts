import { NextResponse } from 'next/server';
import { vote, adminVote, isPlaylistLocked, addActivity, getSortedSongs, getUserVotes, censorProfanity, sanitizeSongForClient } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';
import { resolveVoterIdentity, attachVoterCookie } from '@/lib/identity';
import { checkRateLimit, checkSongVoteLimit, RATE_LIMITS, getRateLimitHeaders, getClientIp } from '@/lib/rate-limit';

// POST - Vote on a song
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = adminKey && adminKey === process.env.ADMIN_PASSWORD;

    // Server-authoritative identity: a valid signed cookie wins; otherwise we mint
    // one (seeded from the fingerprint header for continuity) and set it below.
    const identity = resolveVoterIdentity(request, getVisitorIdFromRequest(request));
    const visitorId = identity.id;

    // Helper so every return path (errors included) also sets the voter cookie.
    const respond = (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
        const res = NextResponse.json(body, { status: init?.status });
        if (init?.headers) {
            Object.entries(init.headers).forEach(([k, v]) => res.headers.set(k, v));
        }
        attachVoterCookie(res, identity);
        return res;
    };

    if (!visitorId) {
        return respond({ error: 'Session expired. Please refresh the page and enter your name to vote.' }, { status: 400 });
    }

    // Rate limiting for non-admin requests
    if (!isAdmin) {
        // Per-IP CEILING — un-spoofable backstop. High enough that a venue sharing
        // one wifi IP is fine, low enough to stop a scripted bot rotating identities.
        const ip = getClientIp(request);
        const ipCheck = await checkRateLimit(`ip:${ip}:vote`, RATE_LIMITS.voteIpCeiling);
        if (!ipCheck.success) {
            return respond(
                { error: 'Too many votes from this network right now. Please wait a moment.' },
                { status: 429, headers: getRateLimitHeaders(ipCheck) }
            );
        }

        // Per-identity global vote limit (30/minute). Keyed on the resolved identity
        // (cookie id when present) so it can't be reset by clearing localStorage.
        const globalCheck = await checkRateLimit(`v:${visitorId}:vote`, RATE_LIMITS.vote);
        if (!globalCheck.success) {
            return respond(
                { error: 'Slow down! You\'re voting too fast. Try again in a few seconds.' },
                { status: 429, headers: getRateLimitHeaders(globalCheck) }
            );
        }

        // Check per-song rate limit (1 per 5 seconds per song)
        const songCheck = await checkSongVoteLimit(`v:${visitorId}`, id);
        if (!songCheck.success) {
            return respond(
                { error: 'Wait a moment before voting on this song again.' },
                { status: 429, headers: getRateLimitHeaders(songCheck) }
            );
        }
    }

    // Check if playlist is locked (skip for admins)
    if (!isAdmin) {
        const locked = await isPlaylistLocked();
        if (locked) {
            return respond({ error: 'Voting is currently paused. Wait for the host to unlock the playlist.' }, { status: 400 });
        }
    }

    try {
        const body = await request.json();
        const { vote: voteDirection, userName, songName, userLocation } = body;

        if (voteDirection !== 1 && voteDirection !== -1) {
            return respond({ error: 'Invalid vote. Please try clicking the vote button again.' }, { status: 400 });
        }

        // Use adminVote for admins (unlimited), regular vote for users
        const result = isAdmin
            ? await adminVote(id, visitorId, voteDirection)
            : await vote(id, visitorId, voteDirection);

        if (!result.success) {
            return respond({ error: result.error }, { status: 400 });
        }

        // 📢 Log activity for live feed (only if we have the info)
        if (userName && songName) {
            await addActivity({
                type: voteDirection === 1 ? 'upvote' : 'downvote',
                userName,
                visitorId,
                songName,
                userLocation: userLocation || undefined,
            });
        }

        // 🚀 Return fresh state so client can skip the next poll cycle entirely
        const [freshSongs, freshUserVotes] = await Promise.all([
            getSortedSongs(),
            getUserVotes(visitorId),
        ]);

        const censoredSongs = freshSongs.map(song => sanitizeSongForClient({
            ...song,
            name: censorProfanity(song.name),
            artist: censorProfanity(song.artist),
        }));

        return respond({
            success: true,
            freshState: {
                songs: censoredSongs,
                userVotes: freshUserVotes,
            },
        });
    } catch (error) {
        console.error('Vote error:', error);
        return respond({ error: 'Something went wrong. Please refresh and try voting again.' }, { status: 500 });
    }
}

