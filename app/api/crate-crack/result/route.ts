import { NextResponse } from 'next/server';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';
import { submitCrateCrackResult } from '@/lib/redis-store';

export async function POST(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);

    if (!visitorId) {
        return NextResponse.json({ error: 'Session expired. Refresh and try again.' }, { status: 400 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const orderedIds = body.action === 'evade' || body.action === 'crate_man' || body.action === 'missile_wedding'
            ? [body.action]
            : Array.isArray(body.orderedIds)
            ? body.orderedIds.filter((id: unknown): id is string => typeof id === 'string')
            : [];

        if (orderedIds.length === 0) {
            return NextResponse.json({ error: 'No Crate Games play submitted.' }, { status: 400 });
        }

        const result = await submitCrateCrackResult(visitorId, orderedIds);
        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Could not submit result.' }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Crate Games result error:', error);
        return NextResponse.json({ error: 'Could not submit Crate Games result.' }, { status: 500 });
    }
}
