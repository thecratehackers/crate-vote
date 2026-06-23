import { NextResponse } from 'next/server';
import {
    adminPurgeDeleteSong,
    getDeleteWindowStatus,
    getRecentPurgeDeletions,
    startDeleteWindow,
    stopDeleteWindow,
    undoLastPurgeDelete,
} from '@/lib/redis-store';

function isAdmin(request: Request): boolean {
    return request.headers.get('x-admin-key') === process.env.ADMIN_PASSWORD;
}

async function getCommandStatus() {
    const [status, recentDeletions] = await Promise.all([
        getDeleteWindowStatus(),
        getRecentPurgeDeletions(25),
    ]);

    return {
        ...status,
        recentDeletions,
        deletedCount: recentDeletions.filter(event => !event.restoredAt).length,
    };
}

// POST - Start a delete window (admin only)
export async function POST(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const { action } = body;

        if (action === 'stop') {
            await stopDeleteWindow();
            return NextResponse.json({ success: true, ...(await getCommandStatus()) });
        }

        if (action === 'undo') {
            const result = await undoLastPurgeDelete('admin');
            if (!result.success) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }
            return NextResponse.json({ success: true, restored: result.event, ...(await getCommandStatus()) });
        }

        if (action === 'delete') {
            const result = await adminPurgeDeleteSong(body.songId, body.deletedByName || 'Volunteer');
            if (!result.success) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }
            return NextResponse.json({ success: true, deleted: result.event, ...(await getCommandStatus()) });
        }

        const duration = body.duration || 90; // Default 90 seconds (longer so poll lag can't eat the whole window)

        const result = await startDeleteWindow(duration);

        return NextResponse.json({
            success: true,
            duration,
            ...(await getCommandStatus()),
        });
    } catch (error) {
        console.error('Start delete window error:', error);
        return NextResponse.json(
            { error: 'Could not start The Purge. Please try again.' },
            { status: 500 }
        );
    }
}

// GET - Check delete window status
export async function GET(request: Request) {
    try {
        const status = await getDeleteWindowStatus();
        if (!isAdmin(request)) {
            return NextResponse.json(status);
        }
        return NextResponse.json(await getCommandStatus());
    } catch (error) {
        console.error('Get delete window status error:', error);
        return NextResponse.json(
            { active: false, endTime: null, remaining: 0, recentDeletions: [], deletedCount: 0 },
            { status: 500 }
        );
    }
}

// DELETE - End The Purge early (admin only)
export async function DELETE(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        await stopDeleteWindow();
        return NextResponse.json({ success: true, ...(await getCommandStatus()) });
    } catch (error) {
        console.error('Stop delete window error:', error);
        return NextResponse.json(
            { error: 'Could not stop The Purge. Please try again.' },
            { status: 500 }
        );
    }
}
