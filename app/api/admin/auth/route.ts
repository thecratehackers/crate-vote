import { NextRequest, NextResponse } from 'next/server';

// Admin password from server-side environment variable
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

export async function POST(request: NextRequest) {
    try {
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
