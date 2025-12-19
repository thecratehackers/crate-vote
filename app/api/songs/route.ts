import { NextResponse } from 'next/server';
import { getSortedSongs, addSong, adminAddSong, getUserStatus, getUserVotes, isPlaylistLocked, isUserBanned, containsProfanity, censorProfanity, getPlaylistTitle, getRecentActivity, addActivity, getKarmaBonuses, autoPruneSongs, checkAndGrantTop3Karma, isRedisConfigured, updateViewerHeartbeat, getActiveViewerCount, getDeleteWindowStatus, canUserDeleteInWindow } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

// ============ THROTTLED BACKGROUND TASKS ============
// At 1000 users polling every 15s, we get ~67 req/sec
// Running expensive tasks on every request is wasteful
// Instead, run them at most once every 30 seconds

let lastPruneTime = 0;
let lastKarmaCheckTime = 0;
const BACKGROUND_TASK_INTERVAL = 30000; // 30 seconds

function shouldRunPrune(): boolean {
    const now = Date.now();
    if (now - lastPruneTime > BACKGROUND_TASK_INTERVAL) {
        lastPruneTime = now;
        return true;
    }
    return false;
}

function shouldRunKarmaCheck(): boolean {
    const now = Date.now();
    if (now - lastKarmaCheckTime > BACKGROUND_TASK_INTERVAL) {
        lastKarmaCheckTime = now;
        return true;
    }
    return false;
}

const MAX_PLAYLIST_SIZE = 100; // Must match redis-store

// GET - Get all songs sorted by score
export async function GET(request: Request) {
    // Check Redis configuration first
    if (!isRedisConfigured()) {
        return NextResponse.json({
            error: 'Database not configured',
            details: 'Redis environment variables are missing. Please check Vercel project settings.'
        }, { status: 503 });
    }

    const visitorId = getVisitorIdFromRequest(request);

    // Background tasks - THROTTLED (run at most once per 30s, not on every request)
    if (shouldRunPrune()) {
        autoPruneSongs().catch(console.error);
    }
    if (shouldRunKarmaCheck()) {
        checkAndGrantTop3Karma().catch(console.error);
    }

    // Update viewer heartbeat (for live viewer count) - fire and forget
    if (visitorId) {
        updateViewerHeartbeat(visitorId).catch(console.error);
    }

    // Fetch data in parallel - most of these are cached
    const [songs, isLocked, playlistTitle, recentActivity, viewerCount, deleteWindowStatus] = await Promise.all([
        getSortedSongs(),
        isPlaylistLocked(),
        getPlaylistTitle(),
        getRecentActivity(),
        getActiveViewerCount(),
        getDeleteWindowStatus(),
    ]);

    // Check if user can delete during window
    let canDeleteInWindow = false;
    if (visitorId && deleteWindowStatus.active) {
        const deleteCheck = await canUserDeleteInWindow(visitorId);
        canDeleteInWindow = deleteCheck.canDelete;
    }

    // Compute playlist stats from songs we already have (avoid extra Redis call)
    const songCount = songs.length;
    const hasDisplaceable = songs.some(s => s.score <= 0);
    const playlistStats = {
        current: songCount,
        max: MAX_PLAYLIST_SIZE,
        canAdd: songCount < MAX_PLAYLIST_SIZE || hasDisplaceable,
    };

    // Censor profanity in song titles/artists for display
    const censoredSongs = songs.map(song => ({
        ...song,
        name: censorProfanity(song.name),
        artist: censorProfanity(song.artist),
    }));

    const userVotes = visitorId ? await getUserVotes(visitorId) : { upvotedSongIds: [], downvotedSongIds: [] };
    const userStatus = visitorId ? await getUserStatus(visitorId) : { songsRemaining: 5, songsAdded: 0, deletesRemaining: 5, deletesUsed: 0, upvotesRemaining: 5, upvotesUsed: 0, downvotesRemaining: 5, downvotesUsed: 0 };
    const karmaBonuses = visitorId ? await getKarmaBonuses(visitorId) : { karma: 0, bonusVotes: 0, bonusSongAdds: 0 };

    return NextResponse.json({
        songs: censoredSongs,
        userVotes,
        userStatus,
        isLocked,
        playlistTitle,
        recentActivity,
        karmaBonuses,
        playlistStats,
        viewerCount,
        deleteWindow: {
            active: deleteWindowStatus.active,
            endTime: deleteWindowStatus.endTime,
            remaining: deleteWindowStatus.remaining,
            canDelete: canDeleteInWindow,
        },
    });
}

// POST - Add a new song
export async function POST(request: Request) {
    // Check Redis configuration first
    if (!isRedisConfigured()) {
        return NextResponse.json({
            error: 'Database not configured',
            details: 'Redis environment variables are missing.'
        }, { status: 503 });
    }

    const visitorId = getVisitorIdFromRequest(request);
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = adminKey && adminKey === process.env.ADMIN_PASSWORD;

    if (!visitorId) {
        return NextResponse.json({ error: 'Visitor ID required' }, { status: 400 });
    }

    // Check if banned (skip for admins)
    if (!isAdmin) {
        const banned = await isUserBanned(visitorId);
        if (banned) {
            return NextResponse.json({ error: 'You have been banned from this session' }, { status: 403 });
        }
    }

    try {
        const body = await request.json();
        const { id, spotifyUri, name, artist, album, albumArt, previewUrl, popularity, bpm, energy, valence, danceability, addedByName, explicit, durationMs } = body;

        if (!id || !spotifyUri || !name || !artist) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Note: Explicit songs are allowed - profanity in titles is censored in display

        // ⏱️ DURATION LIMIT - Block songs over 8 minutes (skip for admins)
        const MAX_DURATION_MS = 8 * 60 * 1000; // 8 minutes
        if (!isAdmin && durationMs && durationMs > MAX_DURATION_MS) {
            return NextResponse.json({ error: 'Songs over 8 minutes are not allowed' }, { status: 400 });
        }

        // 🛡️ RESERVED USERNAMES - Prevent impersonation
        const reservedWords = ['admin', 'moderator', 'mod', 'host', 'system'];
        const reservedExactNames = ['aaron', 'crate hackers', 'dj aaron', 'cratehackers'];
        const lowerName = (addedByName || '').toLowerCase().trim();
        if (!isAdmin && (
            reservedWords.some(word => lowerName.includes(word)) ||
            reservedExactNames.includes(lowerName)
        )) {
            return NextResponse.json({ error: 'This username is reserved' }, { status: 400 });
        }

        // Note: Explicit songs are allowed - profanity is censored in display only

        const songData = {
            id,
            spotifyUri,
            name,
            artist,
            album,
            albumArt,
            previewUrl,
            addedBy: visitorId,
            addedByName: isAdmin ? `${addedByName || 'Admin'} (admin)` : (addedByName || 'Anonymous'),
            // Audio features for DJs
            popularity: popularity || 0,
            bpm: bpm || null,
            energy: energy || null,
            valence: valence || null,
            danceability: danceability || null,
        };

        // Use adminAddSong for admins (unlimited), regular addSong for users
        const result = isAdmin
            ? await adminAddSong(songData)
            : await addSong(songData, visitorId);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // 📢 Log activity for live feed
        const displayName = isAdmin ? `${addedByName || 'Admin'} (admin)` : (addedByName || 'Anonymous');
        await addActivity({
            type: 'add',
            userName: displayName,
            visitorId: visitorId || 'unknown',
            songName: name,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Add song error:', error);
        return NextResponse.json({ error: 'Failed to add song' }, { status: 500 });
    }
}
