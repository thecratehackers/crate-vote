import { NextResponse } from 'next/server';
import {
    getQueueWindowStatus,
    startQueueWindow,
    stopQueueWindow,
} from '@/lib/redis-store';

function isAdmin(request: Request): boolean {
    return request.headers.get('x-admin-key') === process.env.ADMIN_PASSWORD;
}

export async function POST(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));

        if (body.action === 'stop') {
            await stopQueueWindow();
            return NextResponse.json({ success: true, ...(await getQueueWindowStatus()) });
        }

        const duration = body.duration || 60;
        await startQueueWindow(duration);

        return NextResponse.json({
            success: true,
            duration,
            ...(await getQueueWindowStatus()),
        });
    } catch (error) {
        console.error('Start queue window error:', error);
        return NextResponse.json(
            { error: 'Could not start The Queue. Please try again.' },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    try {
        const status = await getQueueWindowStatus();
        return NextResponse.json(status);
    } catch (error) {
        console.error('Get queue window status error:', error);
        return NextResponse.json(
            { active: false, endTime: null, remaining: 0 },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required. Please check your admin password.' }, { status: 401 });
    }

    try {
        await stopQueueWindow();
        return NextResponse.json({ success: true, ...(await getQueueWindowStatus()) });
    } catch (error) {
        console.error('Stop queue window error:', error);
        return NextResponse.json(
            { error: 'Could not stop The Queue. Please try again.' },
            { status: 500 }
        );
    }
}
