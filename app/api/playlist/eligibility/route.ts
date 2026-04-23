import { NextResponse } from 'next/server';
import { getExportEligibility } from '@/lib/redis-store';

// GET /api/playlist/eligibility?visitorId=xxx
// Check if a user has fully participated and is eligible to export the playlist
export async function GET(request: Request) {
    const visitorId = request.headers.get('x-visitor-id');

    if (!visitorId) {
        return NextResponse.json(
            { error: 'Missing visitor ID. Please refresh the page.' },
            { status: 400 }
        );
    }

    try {
        const eligibility = await getExportEligibility(visitorId);
        if (!eligibility.eligible) {
            console.warn('[export-eligibility] denied', {
                visitorId,
                songsAdded: eligibility.songsAdded,
                upvotesUsed: eligibility.upvotesUsed,
                downvotesUsed: eligibility.downvotesUsed,
                reasons: eligibility.reasons,
            });
        } else {
            console.log('[export-eligibility] allowed', { visitorId });
        }
        return NextResponse.json(eligibility);
    } catch (error) {
        console.error('Failed to check export eligibility:', error);
        return NextResponse.json(
            { error: 'Could not check eligibility. Please try again.' },
            { status: 500 }
        );
    }
}
