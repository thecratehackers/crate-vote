import { NextResponse } from 'next/server';
import { getSortedSongs, addSong, adminAddSong, getUserStatus, getUserVotes, isPlaylistLocked, isUserBanned, containsProfanity, censorProfanity, getPlaylistTitle, getRecentActivity, addActivity, getKarmaBonuses, autoPruneSongs, checkAndGrantTop3Karma, isRedisConfigured, updateViewerHeartbeat, getActiveViewerCount, getDeleteWindowStatus, canUserDeleteInWindow, getVersusBattleStatus, getKarmaRainStatus, getSessionPermissions, getYouTubeEmbed } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';
import { checkRateLimit, RATE_LIMITS, getClientIdentifier, getRateLimitHeaders } from '@/lib/rate-limit';

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
    const [songs, isLocked, playlistTitle, recentActivity, viewerCount, deleteWindowStatus, versusBattleStatus, karmaRainStatus, sessionPermissions, youtubeEmbed] = await Promise.all([
        getSortedSongs(),
        isPlaylistLocked(),
        getPlaylistTitle(),
        getRecentActivity(),
        getActiveViewerCount(),
        getDeleteWindowStatus(),
        getVersusBattleStatus(visitorId || undefined, false), // Don't include vote counts for users
        getKarmaRainStatus(),
        getSessionPermissions(),
        getYouTubeEmbed(),
    ]);

    // Check if user can delete during window
    let canDeleteInWindow = false;
    let deleteWindowReason: string | undefined;
    if (visitorId && deleteWindowStatus.active) {
        const deleteCheck = await canUserDeleteInWindow(visitorId);
        canDeleteInWindow = deleteCheck.canDelete;
        deleteWindowReason = deleteCheck.reason;
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
    const userStatus = visitorId ? await getUserStatus(visitorId) : { songsRemaining: 5, songsAdded: 0, deletesRemaining: 5, deletesUsed: 0, upvotesRemaining: 5, upvotesUsed: 0, downvotesRemaining: 5, downvotesUsed: 0, isGodMode: false };
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
            reason: deleteWindowReason,
        },
        versusBattle: versusBattleStatus,
        karmaRain: karmaRainStatus,
        permissions: sessionPermissions,
        youtubeEmbed,
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
        return NextResponse.json({ error: 'Session expired. Please refresh the page to continue.' }, { status: 400 });
    }

    // Rate limiting for non-admin requests
    if (!isAdmin) {
        const clientId = getClientIdentifier(request);
        const rateCheck = await checkRateLimit(clientId + ':addSong', RATE_LIMITS.addSong);
        if (!rateCheck.success) {
            const response = NextResponse.json(
                { error: 'Too many requests. Please wait a moment before adding more songs.' },
                { status: 429 }
            );
            const headers = getRateLimitHeaders(rateCheck);
            Object.entries(headers).forEach(([key, value]) => {
                response.headers.set(key, value);
            });
            return response;
        }
    }

    // Check if banned (skip for admins)
    if (!isAdmin) {
        const banned = await isUserBanned(visitorId);
        if (banned) {
            return NextResponse.json({ error: 'Your account has been suspended. Contact the host if you believe this is an error.' }, { status: 403 });
        }
    }

    try {
        const body = await request.json();
        const { id, spotifyUri, name, artist, album, albumArt, previewUrl, popularity, bpm, energy, valence, danceability, camelotKey, addedByName, addedByAvatar, addedByLocation, explicit, durationMs } = body;

        // ============ INPUT VALIDATION & SANITIZATION ============

        // Required fields check
        if (!id || !spotifyUri || !name || !artist) {
            return NextResponse.json({ error: 'Something went wrong with the song data. Please search again and try adding a different track.' }, { status: 400 });
        }

        // Type validation
        if (typeof id !== 'string' || typeof name !== 'string' || typeof artist !== 'string') {
            return NextResponse.json({ error: 'Invalid data format. Please refresh and try again.' }, { status: 400 });
        }

        // Length limits (prevent database bloat attacks)
        if (id.length > 100 || name.length > 300 || artist.length > 300 || (album && album.length > 300)) {
            return NextResponse.json({ error: 'Song data is too long. Please try a different track.' }, { status: 400 });
        }

        // Spotify ID format validation (alphanumeric, 22 chars)
        if (!/^[a-zA-Z0-9]{22}$/.test(id)) {
            return NextResponse.json({ error: 'Invalid Spotify track ID. Please search again.' }, { status: 400 });
        }

        // Spotify URI format validation
        if (!/^spotify:track:[a-zA-Z0-9]{22}$/.test(spotifyUri)) {
            return NextResponse.json({ error: 'Invalid Spotify URI. Please search again.' }, { status: 400 });
        }

        // URL validation for album art and preview
        if (albumArt && !/^https:\/\//.test(albumArt)) {
            return NextResponse.json({ error: 'Invalid album art URL.' }, { status: 400 });
        }
        if (previewUrl && !/^https:\/\//.test(previewUrl)) {
            return NextResponse.json({ error: 'Invalid preview URL.' }, { status: 400 });
        }

        // Numeric field validation
        if (durationMs !== undefined && (typeof durationMs !== 'number' || durationMs < 0 || durationMs > 3600000)) {
            return NextResponse.json({ error: 'Invalid duration.' }, { status: 400 });
        }
        if (popularity !== undefined && (typeof popularity !== 'number' || popularity < 0 || popularity > 100)) {
            return NextResponse.json({ error: 'Invalid popularity.' }, { status: 400 });
        }

        // Sanitize username (strip HTML/scripts)
        const sanitizedAddedByName = (addedByName || 'Anonymous')
            .replace(/<[^>]*>/g, '') // Strip HTML tags
            .replace(/[<>"'&]/g, '') // Remove dangerous chars
            .trim()
            .slice(0, 50); // Max length

        // ⏱️ DURATION LIMIT - Block songs over 8 minutes (skip for admins)
        const MAX_DURATION_MS = 8 * 60 * 1000; // 8 minutes
        if (!isAdmin && durationMs && durationMs > MAX_DURATION_MS) {
            return NextResponse.json({ error: 'This song is too long! Songs over 8 minutes cannot be added. Try a radio edit or shorter version.' }, { status: 400 });
        }

        // 🛡️ RESERVED USERNAMES - Prevent impersonation
        const reservedWords = ['admin', 'moderator', 'mod', 'host', 'system'];
        const reservedExactNames = ['aaron', 'crate hackers', 'dj aaron', 'cratehackers'];
        const lowerName = sanitizedAddedByName.toLowerCase();
        if (!isAdmin && (
            reservedWords.some(word => lowerName.includes(word)) ||
            reservedExactNames.includes(lowerName)
        )) {
            return NextResponse.json({ error: 'That username is reserved. Please choose a different name and try again.' }, { status: 400 });
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
            addedByName: isAdmin ? `${sanitizedAddedByName} (admin)` : sanitizedAddedByName,
            addedByAvatar: addedByAvatar || '🎧',
            addedByLocation: addedByLocation || undefined,  // Location where user is voting from
            // Audio features for DJs
            popularity: popularity || 0,
            bpm: bpm || null,
            energy: energy || null,
            valence: valence || null,
            danceability: danceability || null,
            camelotKey: camelotKey || null,
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
            userLocation: addedByLocation || undefined,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Add song error:', error);
        return NextResponse.json({ error: 'Unable to add song right now. Please wait a moment and try again.' }, { status: 500 });
    }
}
