import { NextResponse } from 'next/server';

// ⏱️ Shared clock source. Every phone/browser pings this to learn the server's
// "now" and compute its own clock offset, so a scheduled dance-clip start time
// means the same instant on every device (Sonos-style sync).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    return NextResponse.json(
        { now: Date.now() },
        {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            },
        },
    );
}
