import { NextRequest, NextResponse } from 'next/server';
import { resetSession } from '@/lib/redis-store';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    // Check admin auth via cookie
    const cookieStore = cookies();
    const adminAuth = cookieStore.get('admin-auth');

    if (!adminAuth?.value) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await resetSession();
        return NextResponse.json({
            success: true,
            message: 'Session wiped! All songs, votes, and user data cleared.'
        });
    } catch (error) {
        console.error('Failed to wipe session:', error);
        return NextResponse.json({ error: 'Failed to wipe session' }, { status: 500 });
    }
}
