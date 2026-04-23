import { notFound, redirect } from 'next/navigation';
import { getTabBySlug } from '@/lib/stores/tab-store';
import {
    getCurrentShowForTab,
    getSortedSongsForShow,
    getShowSnapshot,
} from '@/lib/stores/show-store';
import { ensureMainTabHasShow } from '@/lib/migration/legacy-to-multi-tab';
import VotingDashboard, {
    type DashboardSong,
} from '@/components/voting/VotingDashboard';
import {
    isArchivePastVotingWindow,
    archiveVotingWindowRemainingMs,
} from '@/lib/entities';
import Link from 'next/link';

// Tab landing page: shows the tab's current active show, or invites the user
// to browse the archive if no active show is set.
export default async function TabPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    await ensureMainTabHasShow();

    const tab = await getTabBySlug(slug);
    if (!tab) notFound();

    const currentShow = await getCurrentShowForTab(tab.id);

    if (!currentShow) {
        return (
            <div className="vd-root">
                <div className="vd-empty">
                    <h1 style={{ marginBottom: 8, color: 'var(--text-primary)' }}>{tab.name}</h1>
                    {tab.description && <p>{tab.description}</p>}
                    <p style={{ marginTop: 24 }}>No active show right now.</p>
                    <Link href={`/tab/${slug}/archive`} className="vd-link">
                        Browse the archive →
                    </Link>
                </div>
            </div>
        );
    }

    const [songs, snapshot] = await Promise.all([
        getSortedSongsForShow(currentShow.id),
        currentShow.status === 'archived' ? getShowSnapshot(currentShow.id) : Promise.resolve(null),
    ]);

    const dashboardSongs: DashboardSong[] = songs.map((s) => ({
        id: s.id,
        spotifyUri: s.spotifyUri,
        name: s.name,
        artist: s.artist,
        album: s.album,
        albumArt: s.albumArt,
        addedBy: s.addedBy,
        addedByName: s.addedByName,
        addedByLocation: s.addedByLocation,
        remixTag: s.remixTag,
        addedAt: s.addedAt,
        upvotes: s.upvotes,
        downvotes: s.downvotes,
        score: s.score,
        showId: s.showId,
        tabId: s.tabId,
    }));

    const archiveExpired = isArchivePastVotingWindow(currentShow);
    const archiveAllowsVoting =
        currentShow.status !== 'archived' ||
        (tab.settings.allowArchivedVoting && !archiveExpired);

    return (
        <VotingDashboard
            tab={{
                id: tab.id,
                slug: tab.slug,
                name: tab.name,
                description: tab.description,
                themeColor: tab.themeColor,
                isMainTab: tab.isMainTab,
            }}
            show={{
                id: currentShow.id,
                tabId: currentShow.tabId,
                showNumber: currentShow.showNumber,
                title: currentShow.title,
                description: currentShow.description,
                status: currentShow.status,
                startedAt: currentShow.startedAt,
                archivedAt: currentShow.archivedAt,
                createdAt: currentShow.createdAt,
                locked: currentShow.locked,
            }}
            initialSongs={dashboardSongs}
            initialUserVotes={{ upvotedSongIds: [], downvotedSongIds: [] }}
            snapshot={snapshot}
            archiveWindow={
                currentShow.status === 'archived'
                    ? {
                          expired: archiveExpired,
                          remainingMs: archiveVotingWindowRemainingMs(currentShow),
                          windowDays: 30,
                      }
                    : null
            }
            canVote={
                archiveAllowsVoting &&
                !currentShow.locked &&
                currentShow.permissions.canVote
            }
            canAddSongs={
                currentShow.status === 'active' &&
                !currentShow.locked &&
                currentShow.permissions.canAddSongs
            }
        />
    );
}
