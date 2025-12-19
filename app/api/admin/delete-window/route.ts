import { NextResponse } from 'next/server';
import { startDeleteWindow, getDeleteWindowStatus } from '@/lib/redis-store';

// POST - Start a delete window (admin only)
export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');

    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const duration = body.duration || 30; // Default 30 seconds

        const result = await startDeleteWindow(duration);

        return NextResponse.json({
            success: true,
            endTime: result.endTime,
            duration,
        });
    } catch (error) {
        console.error('Start delete window error:', error);
        return NextResponse.json(
            { error: 'Failed to start delete window' },
            { status: 500 }
        );
    }
}

// GET - Check delete window status
export async function GET() {
    try {
        const status = await getDeleteWindowStatus();
        return NextResponse.json(status);
    } catch (error) {
        console.error('Get delete window status error:', error);
        return NextResponse.json(
            { active: false, endTime: null, remaining: 0 },
            { status: 500 }
        );
    }
}
