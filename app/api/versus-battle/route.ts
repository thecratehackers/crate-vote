import { NextRequest, NextResponse } from 'next/server';
import { getVersusBattleStatus } from '@/lib/redis-store';

// GET - Get current battle status for users (no vote counts until battle ends)
export async function GET(request: NextRequest) {
    const visitorId = request.headers.get('x-visitor-id') || undefined;

    // Don't include vote counts for regular users (hidden until end)
    const status = await getVersusBattleStatus(visitorId, false);

    return NextResponse.json(status);
}
