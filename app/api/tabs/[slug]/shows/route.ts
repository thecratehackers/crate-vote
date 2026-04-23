import { NextResponse } from 'next/server';
import { getTabBySlug } from '@/lib/stores/tab-store';
import { listShowsForTab } from '@/lib/stores/show-store';

// GET /api/tabs/[slug]/shows - All shows (current + archive) for a tab
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const tab = await getTabBySlug(slug);
    if (!tab) {
        return NextResponse.json({ error: 'Tab not found.' }, { status: 404 });
    }

    const shows = await listShowsForTab(tab.id);
    return NextResponse.json({ tab, shows });
}
