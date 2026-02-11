import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// GET /api/tidal/status — Check if user has active TIDAL session
export async function GET() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('tidal_access_token')?.value;

    return NextResponse.json({
        connected: !!accessToken,
    });
}

// DELETE /api/tidal/status — Disconnect TIDAL
export async function DELETE() {
    const cookieStore = await cookies();
    cookieStore.delete('tidal_access_token');
    cookieStore.delete('tidal_refresh_token');

    return NextResponse.json({ disconnected: true });
}
