import { NextResponse } from 'next/server';
import { getTimerStatus, startTimer, stopTimer, resetTimer, isUserBanned, isRedisConfigured } from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

// GET - Get timer status (public)
export async function GET(request: Request) {
    // Check Redis configuration first
    if (!isRedisConfigured()) {
        return NextResponse.json({
            error: 'Database not configured',
            details: 'Redis environment variables are missing. Please check Vercel project settings.'
        }, { status: 503 });
    }

    const visitorId = getVisitorIdFromRequest(request);
    const timer = await getTimerStatus();
    const isBanned = visitorId ? await isUserBanned(visitorId) : false;

    return NextResponse.json({
        ...timer,
        isBanned,
    });
}

// POST - Admin timer controls
export async function POST(request: Request) {
    // Check Redis configuration first
    if (!isRedisConfigured()) {
        return NextResponse.json({
            error: 'Database not configured',
            details: 'Redis environment variables are missing.'
        }, { status: 503 });
    }

    const adminKey = request.headers.get('x-admin-key');
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!adminKey || adminKey !== expectedPassword) {
        return NextResponse.json({ error: 'Unauthorized - check admin password' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, duration } = body;

        switch (action) {
            case 'start':
                await startTimer(duration);
                const timerAfterStart = await getTimerStatus();
                return NextResponse.json({ success: true, ...timerAfterStart });

            case 'stop':
                await stopTimer();
                const timerAfterStop = await getTimerStatus();
                return NextResponse.json({ success: true, ...timerAfterStop });

            case 'reset':
                await resetTimer();
                const timerAfterReset = await getTimerStatus();
                return NextResponse.json({ success: true, ...timerAfterReset });

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
