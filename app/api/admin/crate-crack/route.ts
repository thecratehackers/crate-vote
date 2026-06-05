import { NextResponse } from 'next/server';
import {
    getCrateCrackAdminStatus,
    startCrateCrackRound,
    stopCrateCrackRound,
} from '@/lib/redis-store';
import type { CrateCrackGameType, CrateCrackReward } from '@/lib/redis-store';

function isAdmin(request: Request): boolean {
    return request.headers.get('x-admin-key') === process.env.ADMIN_PASSWORD;
}

function cleanReward(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function cleanGameType(value: unknown): CrateCrackGameType {
    return value === 'bpm_sort' || value === 'crate_man' || value === 'missile_wedding' || value === 'request_evader'
        ? value
        : 'request_evader';
}

export async function GET(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    try {
        return NextResponse.json(await getCrateCrackAdminStatus());
    } catch (error) {
        console.error('Get Crate Games admin status error:', error);
        return NextResponse.json({ error: 'Could not load Crate Games.' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));

        if (body.action === 'stop') {
            return NextResponse.json({ success: true, ...(await stopCrateCrackRound()) });
        }

        const rareRewards: CrateCrackReward[] = [];
        if (body.armCrateAnnual) {
            rareRewards.push({
                type: 'crate_annual',
                label: 'Annual Crate Hackers',
                code: cleanReward(body.crateAnnualCode, 'CRATEYEAR'),
                claimUrl: cleanReward(body.crateAnnualUrl, 'https://www.cratehackers.com/'),
            });
        }
        if (body.armBangerAnnual) {
            rareRewards.push({
                type: 'banger_annual',
                label: 'Annual Banger Button',
                code: cleanReward(body.bangerAnnualCode, 'BANGERYEAR'),
                claimUrl: cleanReward(body.bangerAnnualUrl, 'https://www.bangerbutton.com/'),
            });
        }
        if (body.armLifetime) {
            rareRewards.push({
                type: 'lifetime',
                label: 'Lifetime Offer',
                code: cleanReward(body.lifetimeCode, 'LIFETIMECRATE'),
                claimUrl: cleanReward(body.lifetimeUrl, 'https://www.cratehackers.com/'),
            });
        }

        const status = await startCrateCrackRound({
            durationSeconds: Number(body.durationSeconds) || 60,
            gameType: cleanGameType(body.gameType),
            defaultReward: {
                label: cleanReward(body.defaultRewardLabel, '14 Free Days'),
                code: '',
                claimUrl: cleanReward(body.defaultRewardUrl, 'https://www.cratehackers.com/14daytrial'),
            },
            rareRewards,
        });

        return NextResponse.json({ success: true, ...status });
    } catch (error) {
        console.error('Start Crate Games error:', error);
        return NextResponse.json({ error: 'Could not start Crate Games.' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    }

    try {
        return NextResponse.json({ success: true, ...(await stopCrateCrackRound()) });
    } catch (error) {
        console.error('Stop Crate Games error:', error);
        return NextResponse.json({ error: 'Could not stop Crate Games.' }, { status: 500 });
    }
}
