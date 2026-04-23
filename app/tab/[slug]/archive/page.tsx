import { notFound } from 'next/navigation';
import { getTabBySlug } from '@/lib/stores/tab-store';
import { listShowsForTab } from '@/lib/stores/show-store';
import { ensureMainTabHasShow } from '@/lib/migration/legacy-to-multi-tab';
import ShowArchiveList from '@/components/navigation/ShowArchiveList';

export default async function TabArchivePage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    await ensureMainTabHasShow();

    const tab = await getTabBySlug(slug);
    if (!tab) notFound();

    const shows = await listShowsForTab(tab.id);

    return <ShowArchiveList tabSlug={slug} tabName={tab.name} shows={shows} />;
}
