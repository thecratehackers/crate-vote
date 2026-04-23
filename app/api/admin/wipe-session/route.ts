import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { archiveAndResetLegacySession } from '@/lib/migration/legacy-to-multi-tab';

export async function POST(request: NextRequest) {
    const cookieStore = cookies();
    const adminAuth = cookieStore.get('admin-auth');

    if (!adminAuth?.value) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Snapshot the live session into an archived show before wiping.
        // The archive is votable for 30 days, then permanently locked.
        const result = await archiveAndResetLegacySession(adminAuth.value);
        return NextResponse.json({
            success: true,
            message: 'Session archived and wiped. Archive is votable for 30 days.',
            archivedShowId: result.archivedShowId,
            songsArchived: result.songsArchived,
            archiveError: result.archiveError,
        });
    } catch (error) {
        console.error('Failed to archive + wipe session:', error);
        return NextResponse.json({ error: 'Failed to wipe session' }, { status: 500 });
    }
}
