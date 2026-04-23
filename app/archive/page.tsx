import { redirect } from 'next/navigation';
import { ensureMainTabHasShow } from '@/lib/migration/legacy-to-multi-tab';
import { ensureMainTab } from '@/lib/stores/tab-store';

// /archive redirects to the main tab's archive page
export default async function ArchiveRoot() {
    await ensureMainTabHasShow();
    const mainTab = await ensureMainTab();
    redirect(`/tab/${mainTab.slug}/archive`);
}
