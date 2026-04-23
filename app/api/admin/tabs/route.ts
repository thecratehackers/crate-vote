import { NextResponse } from 'next/server';
import {
    createTab,
    listTabs,
    updateTab,
    deleteTab,
} from '@/lib/stores/tab-store';

function isAdminRequest(request: Request): boolean {
    const key = request.headers.get('x-admin-key');
    return !!key && key === process.env.ADMIN_PASSWORD;
}

// GET /api/admin/tabs - List all tabs (admin view)
export async function GET(request: Request) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const tabs = await listTabs();
    return NextResponse.json({ tabs });
}

// POST /api/admin/tabs - Create a new tab
export async function POST(request: Request) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    try {
        const body = await request.json();
        const { slug, name, description, themeColor, settings } = body;
        if (!slug || !name) {
            return NextResponse.json({ error: 'Slug and name are required.' }, { status: 400 });
        }
        const result = await createTab({
            slug,
            name,
            description,
            themeColor,
            settings,
            createdBy: request.headers.get('x-admin-id') || 'admin',
        });
        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ success: true, tab: result.tab });
    } catch (error) {
        console.error('Create tab error:', error);
        return NextResponse.json({ error: 'Could not create tab.' }, { status: 500 });
    }
}

// PATCH /api/admin/tabs?id=... - Update a tab
export async function PATCH(request: Request) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Tab id required.' }, { status: 400 });

        const body = await request.json();
        const result = await updateTab(id, body);
        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ success: true, tab: result.tab });
    } catch (error) {
        console.error('Update tab error:', error);
        return NextResponse.json({ error: 'Could not update tab.' }, { status: 500 });
    }
}

// DELETE /api/admin/tabs?id=...
export async function DELETE(request: Request) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Tab id required.' }, { status: 400 });

    const result = await deleteTab(id);
    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
}
