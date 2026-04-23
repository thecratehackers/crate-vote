import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import {
    createShow,
    archiveShow,
    activateShow,
    updateShow,
    purgeShowData,
    getShow,
    listShowsForTab,
} from '@/lib/stores/show-store';
import {
    endCurrentShowAndArchive,
    getMigrationStatus,
} from '@/lib/migration/legacy-to-multi-tab';
import { ensureMainTab } from '@/lib/stores/tab-store';
import { KEYS } from '@/lib/entities';

const redis = new Redis({
    url: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) || 'https://placeholder.upstash.io',
    token: (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN) || 'placeholder',
});

function isAdminRequest(request: Request): boolean {
    const key = request.headers.get('x-admin-key');
    return !!key && key === process.env.ADMIN_PASSWORD;
}

// GET /api/admin/shows?id=... - Get show details (admin)
// GET /api/admin/shows?status=true - Get migration status
export async function GET(request: Request) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const url = new URL(request.url);
    if (url.searchParams.get('status')) {
        const status = await getMigrationStatus();
        return NextResponse.json(status);
    }
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Show id required.' }, { status: 400 });
    const show = await getShow(id);
    if (!show) return NextResponse.json({ error: 'Show not found.' }, { status: 404 });
    return NextResponse.json({ show });
}

// POST /api/admin/shows - Create show OR perform a show action
//   action: "create"     - body: { tabId, title, description, autoActivate, archivePrevious }
//   action: "archive"    - body: { showId }
//   action: "activate"   - body: { showId }
//   action: "update"     - body: { showId, ...fields }
//   action: "purge"      - body: { showId }
//   action: "endLegacy"  - body: { title, description }  (snapshot legacy session into archived show)
export async function POST(request: Request) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const adminId = request.headers.get('x-admin-id') || 'admin';
    try {
        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'create': {
                const { tabId, title, description, autoActivate, archivePrevious } = body;
                if (!tabId) return NextResponse.json({ error: 'tabId required.' }, { status: 400 });
                const result = await createShow({
                    tabId,
                    title,
                    description,
                    autoActivate: !!autoActivate,
                    archivePrevious: !!archivePrevious,
                    createdBy: adminId,
                });
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, show: result.show });
            }
            case 'archive': {
                const { showId } = body;
                if (!showId) return NextResponse.json({ error: 'showId required.' }, { status: 400 });
                const result = await archiveShow(showId);
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true });
            }
            case 'activate': {
                const { showId } = body;
                if (!showId) return NextResponse.json({ error: 'showId required.' }, { status: 400 });
                const result = await activateShow(showId);
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true });
            }
            case 'update': {
                const { showId, ...updates } = body;
                if (!showId) return NextResponse.json({ error: 'showId required.' }, { status: 400 });
                delete updates.action;
                const result = await updateShow(showId, updates);
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, show: result.show });
            }
            case 'purge': {
                const { showId } = body;
                if (!showId) return NextResponse.json({ error: 'showId required.' }, { status: 400 });
                await purgeShowData(showId);
                return NextResponse.json({ success: true });
            }
            case 'endLegacy': {
                const { title, description } = body;
                const result = await endCurrentShowAndArchive(adminId, title, description);
                if (!result.success) {
                    return NextResponse.json({ error: result.error }, { status: 400 });
                }
                return NextResponse.json({ success: true, showId: result.showId });
            }
            case 'cleanupDuplicates': {
                // Cleanup utility: when concurrent bootstrap created multiple
                // "first shows" for the main tab, keep only the one currently
                // pointed to by tab:main:currentShow and purge the rest.
                const mainTab = await ensureMainTab();
                const allShows = await listShowsForTab(mainTab.id);
                const currentId = await redis.get<string>(KEYS.tabCurrentShow(mainTab.id));

                const duplicates = allShows.filter(
                    (s) =>
                        s.id !== currentId &&
                        s.createdBy === 'system-bootstrap' &&
                        s.status !== 'archived'
                );

                for (const dup of duplicates) {
                    await purgeShowData(dup.id);
                    await redis.zrem(KEYS.tabShowsList(mainTab.id), dup.id);
                }

                return NextResponse.json({
                    success: true,
                    purged: duplicates.length,
                    keptShowId: currentId,
                });
            }
            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (error) {
        console.error('Show action error:', error);
        return NextResponse.json({ error: 'Action failed.' }, { status: 500 });
    }
}
