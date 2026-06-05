import { NextResponse } from 'next/server';
import { getPrizeDropEligibilitySummary, getPrizeDropHistory, triggerPrizeDrop } from '@/lib/redis-store';
import { PRIZE_REVEAL_MODES, PRIZE_TEMPLATES, isPrizeRevealMode } from '@/lib/prize-templates';

function getAdminParticipant(request: Request) {
    return {
        visitorId: request.headers.get('x-admin-id') || 'admin-prize-host',
        name: 'Admin Host',
    };
}

export async function GET(request: Request) {
    const adminKey = request.headers.get('x-admin-key');

    // Verify admin
    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [history, eligibility] = await Promise.all([
            getPrizeDropHistory(20),
            getPrizeDropEligibilitySummary(getAdminParticipant(request)),
        ]);
        return NextResponse.json({
            history,
            eligibility,
            templates: PRIZE_TEMPLATES,
            revealModes: PRIZE_REVEAL_MODES,
        });
    } catch (error) {
        console.error('Prize drop history error:', error);
        return NextResponse.json({ error: 'Failed to load prize drop history' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');

    // Verify admin
    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const allowedKeys = new Set(['prizeTemplateId', 'revealMode']);
        const unsafeKeys = Object.keys(body).filter(key => !allowedKeys.has(key));

        if (unsafeKeys.length > 0) {
            return NextResponse.json(
                { error: 'Host safe mode only allows selecting an approved prize and reveal mode.' },
                { status: 400 }
            );
        }

        const templateExists = PRIZE_TEMPLATES.some(template => template.id === body.prizeTemplateId);
        if (body.prizeTemplateId && !templateExists) {
            return NextResponse.json({ error: 'Unknown prize template.' }, { status: 400 });
        }

        if (body.revealMode && !isPrizeRevealMode(body.revealMode)) {
            return NextResponse.json({ error: 'Unknown prize reveal mode.' }, { status: 400 });
        }

        const result = await triggerPrizeDrop({
            prizeTemplateId: body.prizeTemplateId,
            revealMode: body.revealMode,
            adminParticipant: getAdminParticipant(request),
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            winner: result.winner,
            blockedRecentWinners: result.blockedRecentWinners || 0,
            event: result.event,
            message: `🎰 ${result.event?.template.title || 'Prize Drop'}! ${result.winner?.name} won a prize!`
        });
    } catch (error) {
        console.error('Prize drop error:', error);
        return NextResponse.json({ error: 'Failed to trigger prize drop' }, { status: 500 });
    }
}
