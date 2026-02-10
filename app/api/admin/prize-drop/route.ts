import { NextResponse } from 'next/server';
import { triggerPrizeDrop } from '@/lib/redis-store';

export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');

    // Verify admin
    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await triggerPrizeDrop();

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            winner: result.winner,
            message: `🎰 Golden Hour Drop! ${result.winner?.name} won a prize!`
        });
    } catch (error) {
        console.error('Prize drop error:', error);
        return NextResponse.json({ error: 'Failed to trigger prize drop' }, { status: 500 });
    }
}
