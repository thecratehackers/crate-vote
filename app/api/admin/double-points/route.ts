import { NextResponse } from 'next/server';
import { startDoublePoints, getDoublePointsStatus } from '@/lib/redis-store';

// POST - Start Double Points Round (admin only)
export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');

    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const duration = body.duration || 120; // Default 2 minutes

        const result = await startDoublePoints(duration);

        return NextResponse.json({
            success: true,
            endTime: result.endTime,
            duration,
        });
    } catch (error) {
        console.error('Start double points error:', error);
        return NextResponse.json(
            { error: 'Could not start Double Points. Please try again.' },
            { status: 500 }
        );
    }
}

// GET - Check Double Points status
export async function GET() {
    try {
        const status = await getDoublePointsStatus();
        return NextResponse.json(status);
    } catch (error) {
        console.error('Get double points status error:', error);
        return NextResponse.json(
            { active: false, endTime: null, remaining: 0 },
            { status: 500 }
        );
    }
}
