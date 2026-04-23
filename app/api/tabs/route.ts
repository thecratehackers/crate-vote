import { NextResponse } from 'next/server';
import { listTabs } from '@/lib/stores/tab-store';
import { ensureMainTabHasShow } from '@/lib/migration/legacy-to-multi-tab';
import { getCurrentShowForTab } from '@/lib/stores/show-store';

// GET /api/tabs - List all tabs (with their current show, if any)
export async function GET() {
    // Ensure the main tab exists and has at least one show before listing
    await ensureMainTabHasShow();

    const tabs = await listTabs();

    // Attach current show info per tab (lightweight)
    const enriched = await Promise.all(
        tabs.map(async (tab) => {
            const currentShow = await getCurrentShowForTab(tab.id);
            return {
                ...tab,
                currentShow: currentShow
                    ? {
                          id: currentShow.id,
                          title: currentShow.title,
                          showNumber: currentShow.showNumber,
                          startedAt: currentShow.startedAt,
                          status: currentShow.status,
                      }
                    : null,
            };
        })
    );

    return NextResponse.json({ tabs: enriched });
}
