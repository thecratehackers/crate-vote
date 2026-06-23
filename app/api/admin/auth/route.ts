import { NextRequest, NextResponse } from 'next/server';

// Admin password from server-side environment variable. NO fallback — if it's
// unset we fail closed so the admin panel can never be opened with a default.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export async function POST(request: NextRequest) {
    try {
        if (!ADMIN_PASSWORD) {
            console.error('ADMIN_PASSWORD is not configured — admin login disabled.');
            return NextResponse.json({ success: false, error: 'Admin login is not configured.' }, { status: 503 });
        }

        const { password } = await request.json();

        if (!password) {
            return NextResponse.json({ success: false, error: 'Password required' }, { status: 400 });
        }

        if (password === ADMIN_PASSWORD) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
        }
    } catch (error) {
        console.error('Admin auth error:', error);
        return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 500 });
    }
}
