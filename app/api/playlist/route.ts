import { NextResponse } from 'next/server';
import {
    getSortedSongs,
    setPlaylistLocked,
    isPlaylistLocked,
    getStats,
    resetSession,
    getActiveUsers,
    banUserAndDeleteSongs,
    isUserBanned,
    adminHeartbeat,
    getActiveAdminCount,
    getPlaylistTitle,
    setPlaylistTitle,
    addKarma,
    getUserKarma
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

    const [songs, isLocked, stats, activeUsersRaw, activeAdminCount, playlistTitle] = await Promise.all([
        getSortedSongs(),
        isPlaylistLocked(),
        getStats(),
        getActiveUsers(),
        getActiveAdminCount(),
        getPlaylistTitle(),
    ]);

    // Format active users for frontend (check ban status and karma for each)
    const activeUsers = await Promise.all(
        activeUsersRaw.map(async (user) => ({
            visitorId: user.visitorId,
            name: user.username,  // Use username from their songs
            songsAdded: user.songCount,
            isBanned: await isUserBanned(user.visitorId),
            karma: await getUserKarma(user.visitorId),
        }))
    );

    return NextResponse.json({
        songs,
        isLocked,
        stats,
        activeUsers,
        activeAdminCount,
        playlistTitle,
    });
}

// POST - Admin actions on playlist
export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');
    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Send heartbeat on any admin action
    const adminId = request.headers.get('x-admin-id') || 'admin-' + Date.now();
    await adminHeartbeat(adminId);

    try {
        const body = await request.json();
        const { action, visitorId, title } = body;

        switch (action) {
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
                    return NextResponse.json({ error: 'Visitor ID required' }, { status: 400 });
                }
                // Ban user AND delete all their songs
                const result = await banUserAndDeleteSongs(visitorId);
                return NextResponse.json({ success: true, deletedSongs: result.deletedSongCount });
            case 'setTitle':
                if (!title || typeof title !== 'string') {
                    return NextResponse.json({ error: 'Title required' }, { status: 400 });
                }
                await setPlaylistTitle(title.slice(0, 100)); // Max 100 chars
                return NextResponse.json({ success: true, playlistTitle: title.slice(0, 100) });
            case 'grantKarma':
                if (!visitorId) {
                    return NextResponse.json({ error: 'Visitor ID required' }, { status: 400 });
                }
                const karmaPoints = body.points || 1;
                const newKarma = await addKarma(visitorId, karmaPoints);
                return NextResponse.json({ success: true, karma: newKarma });
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
