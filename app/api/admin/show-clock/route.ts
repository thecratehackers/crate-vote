import { NextResponse } from 'next/server';
import {
    getShowClock,
    setShowClockSegments,
    startShowClock,
    advanceShowClockSegment,
    extendCurrentSegment,
    stopShowClock,
    clearShowClock,
} from '@/lib/redis-store';
import type { ShowSegment } from '@/lib/redis-store';

// GET - Get current show clock state (public read, no auth required for ticker display)
export async function GET() {
    try {
        const showClock = await getShowClock();
        return NextResponse.json(showClock);
    } catch (error) {
        console.error('Failed to get show clock:', error);
        return NextResponse.json({ error: 'Could not load show clock.' }, { status: 500 });
    }
}

// POST - Admin show clock controls
export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!adminKey || adminKey !== expectedPassword) {
        return NextResponse.json({ error: 'Invalid admin password.' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'saveSegments': {
                const { segments } = body as { segments: ShowSegment[] };
                if (!segments || !Array.isArray(segments)) {
                    return NextResponse.json({ error: 'Segments array is required.' }, { status: 400 });
                }
                if (segments.length > 5) {
                    return NextResponse.json({ error: 'Maximum 5 segments allowed.' }, { status: 400 });
                }
                // Validate each segment
                for (const seg of segments) {
                    if (!seg.name || typeof seg.name !== 'string' || seg.name.length > 50) {
                        return NextResponse.json({ error: 'Each segment needs a name (max 50 chars).' }, { status: 400 });
                    }
                    if (!seg.durationMs || seg.durationMs < 60000 || seg.durationMs > 3600000) {
                        return NextResponse.json({ error: 'Segment duration must be between 1 and 60 minutes.' }, { status: 400 });
                    }
                }
                const clock = await setShowClockSegments(segments);
                return NextResponse.json({ success: true, showClock: clock });
            }

            case 'start': {
                const clock = await startShowClock();
                if (clock.segments.length === 0) {
                    return NextResponse.json({ error: 'No segments configured. Add segments first.' }, { status: 400 });
                }
                return NextResponse.json({ success: true, showClock: clock });
            }

            case 'advance': {
                const clock = await advanceShowClockSegment();
                return NextResponse.json({ success: true, showClock: clock });
            }

            case 'extend': {
                const { additionalMs } = body;
                if (!additionalMs || additionalMs < 0) {
                    return NextResponse.json({ error: 'Extension time is required.' }, { status: 400 });
                }
                const clock = await extendCurrentSegment(additionalMs);
                return NextResponse.json({ success: true, showClock: clock });
            }

            case 'stop': {
                const clock = await stopShowClock();
                return NextResponse.json({ success: true, showClock: clock });
            }

            case 'clear': {
                await clearShowClock();
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json({ error: 'Unknown show clock action.' }, { status: 400 });
        }
    } catch (error) {
        console.error('Show clock action failed:', error);
        return NextResponse.json({ error: 'Show clock action failed. Please try again.' }, { status: 500 });
    }
}
