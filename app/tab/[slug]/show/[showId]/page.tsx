import { notFound } from 'next/navigation';
import { getTabBySlug } from '@/lib/stores/tab-store';
import {
    getShow,
    getSortedSongsForShow,
    getShowSnapshot,
} from '@/lib/stores/show-store';
import VotingDashboard, {
    type DashboardSong,
} from '@/components/voting/VotingDashboard';

// Specific show page - works for both current and archived shows.
export default async function ShowPage({
    params,
}: {
    params: Promise<{ slug: string; showId: string }>;
}) {
    const { slug, showId } = await params;

    const [tab, show] = await Promise.all([
        getTabBySlug(slug),
        getShow(showId),
    ]);

    if (!tab || !show || show.tabId !== tab.id) {
        notFound();
    }

    const [songs, snapshot] = await Promise.all([
        getSortedSongsForShow(showId),
        show.status === 'archived' ? getShowSnapshot(showId) : Promise.resolve(null),
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
                id: show.id,
                tabId: show.tabId,
                showNumber: show.showNumber,
                title: show.title,
                description: show.description,
                status: show.status,
                startedAt: show.startedAt,
                archivedAt: show.archivedAt,
                createdAt: show.createdAt,
                locked: show.locked,
            }}
            initialSongs={dashboardSongs}
            initialUserVotes={{ upvotedSongIds: [], downvotedSongIds: [] }}
            snapshot={snapshot}
            canVote={
                !show.locked &&
                show.permissions.canVote &&
                (show.status !== 'archived' || tab.settings.allowArchivedVoting)
            }
            canAddSongs={
                show.status === 'active' &&
                !show.locked &&
                show.permissions.canAddSongs
            }
        />
    );
}
