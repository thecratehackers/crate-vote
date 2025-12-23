import { NextResponse } from 'next/server';
import { karmaRain } from '@/lib/redis-store';
import { headers } from 'next/headers';

export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');

    // Verify admin
    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get all karma records and give everyone +1
        const result = await karmaRain();

        return NextResponse.json({
            success: true,
            usersRained: result.count,
            message: `🌧️ Karma Rain! ${result.count} users received +1 karma!`
        });
    } catch (error) {
        console.error('Karma rain error:', error);
        return NextResponse.json({ error: 'Failed to trigger karma rain' }, { status: 500 });
    }
}
