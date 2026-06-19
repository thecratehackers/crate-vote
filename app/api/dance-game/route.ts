import { NextResponse } from 'next/server';
import { getDanceGameStatus } from '@/lib/redis-store';

// GET - Public read-only state for the audience screen poll
export async function GET() {
    const status = await getDanceGameStatus();
    return NextResponse.json(status);
}
