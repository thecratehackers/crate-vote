import { NextResponse } from 'next/server';
import { deleteSong, banUser, adminDeleteSong } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

// DELETE - Remove a song (admin or song owner)
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const adminKey = request.headers.get('x-admin-key');
    const visitorId = getVisitorIdFromRequest(request);

    // Admin can delete any song
    if (adminKey === process.env.ADMIN_PASSWORD) {
        await adminDeleteSong(id);
        return NextResponse.json({ success: true });
    }

    // User can delete their own song
    if (visitorId) {
        const result = await deleteSong(id, visitorId);
        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// POST - Ban the user who added this song (admin only)
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const adminKey = request.headers.get('x-admin-key');
    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, visitorId } = body;

        if (action === 'ban' && visitorId) {
            await banUser(visitorId);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
