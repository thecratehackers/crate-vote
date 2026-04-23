import { NextResponse } from 'next/server';
import { getTabBySlug } from '@/lib/stores/tab-store';
import {
    getCurrentShowForTab,
    listShowsForTab,
} from '@/lib/stores/show-store';
import { ensureMainTabHasShow } from '@/lib/migration/legacy-to-multi-tab';

// GET /api/tabs/[slug] - Tab detail with current show + recent archive list
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    await ensureMainTabHasShow();

    const tab = await getTabBySlug(slug);
    if (!tab) {
        return NextResponse.json({ error: 'Tab not found.' }, { status: 404 });
    }

    const [currentShow, allShows] = await Promise.all([
        getCurrentShowForTab(tab.id),
        listShowsForTab(tab.id),
    ]);

    return NextResponse.json({
        tab,
        currentShow,
        archive: allShows.filter((s) => s.status === 'archived').slice(0, 20),
        showCount: allShows.length,
    });
}
