import { NextResponse } from 'next/server';
import { getArtistVersusStatus } from '@/lib/redis-store';

// GET - Public read-only state for the audience screen poll
export async function GET() {
    const status = await getArtistVersusStatus();
    return NextResponse.json(status);
}
