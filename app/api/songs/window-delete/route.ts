import { NextResponse } from 'next/server';
import { useWindowDelete, canUserDeleteInWindow } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

// POST - User deletes a song during delete window
export async function POST(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);

    if (!visitorId) {
        return NextResponse.json({ error: 'Session expired. Please refresh the page to participate in Chaos Mode.' }, { status: 401 });
    }

    try {
        const { songId } = await request.json();

        if (!songId) {
            return NextResponse.json({ error: 'Please select a song to delete.' }, { status: 400 });
        }

        const result = await useWindowDelete(visitorId, songId);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Window delete error:', error);
        return NextResponse.json(
            { error: 'Could not delete song. Please try again quickly before time runs out!' },
            { status: 500 }
        );
    }
}

// GET - Check if user can delete
export async function GET(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);

    if (!visitorId) {
        return NextResponse.json({ canDelete: false, reason: 'Not logged in' });
    }

    try {
        const result = await canUserDeleteInWindow(visitorId);
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ canDelete: false, reason: 'Error checking status' });
    }
}
