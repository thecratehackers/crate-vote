import { NextResponse } from 'next/server';
import {
    getSortedSongs,
    setPlaylistLocked,
    isPlaylistLocked,
    getStats,
    resetSession,
    deepCleanup,
    getActiveUsers,
    banUserAndDeleteSongs,
    isUserBanned,
    adminHeartbeat,
    getActiveAdminCount,
    getPlaylistTitle,
    setPlaylistTitle,
    addKarma,
    getUserKarma,
    getRecentActivity,
    removeActivity,
    removeUserActivities,
    getSessionPermissions,
    setSessionPermissions,
    getYouTubeEmbed,
    setYouTubeEmbed,
    getStreamConfig,
    setStreamConfig,
    getShowClock,
} from '@/lib/redis-store';

// GET - Get playlist status and stats
export async function GET(request: Request) {
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = adminKey === process.env.ADMIN_PASSWORD;

    // Send heartbeat if admin
    if (isAdmin) {
        const adminId = request.headers.get('x-admin-id') || 'admin-' + Date.now();
        await adminHeartbeat(adminId);
    }

    const [songs, isLocked, stats, activeUsersRaw, activeAdminCount, playlistTitle, recentActivity, sessionPermissions, youtubeEmbed, streamConfig, showClock] = await Promise.all([
        getSortedSongs(),
        isPlaylistLocked(),
        getStats(),
        getActiveUsers(),
        getActiveAdminCount(),
        getPlaylistTitle(),
        isAdmin ? getRecentActivity() : Promise.resolve([]),  // Only fetch for admins
        getSessionPermissions(),
        getYouTubeEmbed(),
        getStreamConfig(),
        getShowClock(),
    ]);

    // Format active users for frontend (check ban status and karma for each)
    // Already sorted by most recent activity from getActiveUsers
    const activeUsers = await Promise.all(
        activeUsersRaw.map(async (user) => ({
            visitorId: user.visitorId,
            name: user.username,  // Use username from their songs
            songsAdded: user.songCount,
            isBanned: await isUserBanned(user.visitorId),
            karma: await getUserKarma(user.visitorId),
            lastActivity: user.lastActivity,
        }))
    );

    return NextResponse.json({
        songs,
        isLocked,
        stats,
        activeUsers,
        activeAdminCount,
        playlistTitle,
        recentActivity: isAdmin ? recentActivity : undefined,
        permissions: sessionPermissions,
        youtubeEmbed,
        streamConfig,
        showClock,
    });
}

// POST - Admin actions on playlist
export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');
    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Invalid admin password. Please check your credentials and try again.' }, { status: 401 });
    }

    // Send heartbeat on any admin action
    const adminId = request.headers.get('x-admin-id') || 'admin-' + Date.now();
    await adminHeartbeat(adminId);

    try {
        const body = await request.json();
        const { action, visitorId, title, locked } = body;

        switch (action) {
            case 'setLock':
                await setPlaylistLocked(locked);
                return NextResponse.json({ success: true, isLocked: locked });
            case 'lock':
                await setPlaylistLocked(true);
                return NextResponse.json({ success: true, isLocked: true });
            case 'unlock':
                await setPlaylistLocked(false);
                return NextResponse.json({ success: true, isLocked: false });
            case 'reset':
                await resetSession();
                return NextResponse.json({ success: true });
            case 'ban':
                if (!visitorId) {
                    return NextResponse.json({ error: 'User ID is required to ban someone. Select a user from the list.' }, { status: 400 });
                }
                // Ban user AND delete all their songs AND activities
                const banResult = await banUserAndDeleteSongs(visitorId);
                await removeUserActivities(visitorId);
                return NextResponse.json({ success: true, deletedSongs: banResult.deletedSongCount });
            case 'deleteActivity':
                const { activityId } = body;
                if (!activityId) {
                    return NextResponse.json({ error: 'Select an activity to delete.' }, { status: 400 });
                }
                const deleteResult = await removeActivity(activityId);
                if (!deleteResult.success) {
                    return NextResponse.json({ error: deleteResult.error }, { status: 400 });
                }
                return NextResponse.json({ success: true });
            case 'setTitle':
                if (!title || typeof title !== 'string') {
                    return NextResponse.json({ error: 'Please enter a playlist title.' }, { status: 400 });
                }
                await setPlaylistTitle(title.slice(0, 100)); // Max 100 chars
                return NextResponse.json({ success: true, playlistTitle: title.slice(0, 100) });
            case 'grantKarma':
                if (!visitorId) {
                    return NextResponse.json({ error: 'Select a user to grant karma to.' }, { status: 400 });
                }
                const karmaPoints = body.points || 1;
                const newKarma = await addKarma(visitorId, karmaPoints);
                return NextResponse.json({ success: true, karma: newKarma });
            case 'cleanup':
                // Deep cleanup - remove orphaned vote sets and free storage
                const cleanupResult = await deepCleanup();
                return NextResponse.json({
                    success: true,
                    deletedKeys: cleanupResult.deletedKeys,
                    freedBytes: cleanupResult.freedBytes
                });
            case 'setPermissions':
                // Set session permissions (canVote, canAddSongs)
                const { canVote, canAddSongs } = body;
                const newPermissions = await setSessionPermissions({
                    ...(canVote !== undefined && { canVote }),
                    ...(canAddSongs !== undefined && { canAddSongs }),
                });
                return NextResponse.json({ success: true, permissions: newPermissions });
            case 'setYouTubeEmbed':
                // Set or clear YouTube embed URL
                const { youtubeUrl } = body;
                await setYouTubeEmbed(youtubeUrl || null);
                return NextResponse.json({ success: true, youtubeEmbed: youtubeUrl || null });
            case 'setStreamConfig':
                // Set stream platform config (YouTube / Twitch / Off)
                const { streamPlatform, streamYoutubeUrl, streamTwitchChannel } = body;
                const newConfig = {
                    platform: streamPlatform || null,
                    youtubeUrl: streamYoutubeUrl || undefined,
                    twitchChannel: streamTwitchChannel || undefined,
                };
                await setStreamConfig(newConfig);
                return NextResponse.json({ success: true, streamConfig: newConfig });
            default:
                return NextResponse.json({ error: 'Unknown action. Please refresh and try again.' }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 });
    }
}
