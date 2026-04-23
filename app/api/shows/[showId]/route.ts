import { NextResponse } from 'next/server';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';
import {
    getShow,
    getSortedSongsForShow,
    getUserVotesForShow,
    getShowSnapshot,
} from '@/lib/stores/show-store';
import { getTab } from '@/lib/stores/tab-store';
import { censorProfanity } from '@/lib/redis-store';

// GET /api/shows/[showId] - Show details + songs + user votes
export async function GET(
    request: Request,
    { params }: { params: Promise<{ showId: string }> }
) {
    const { showId } = await params;
    const visitorId = getVisitorIdFromRequest(request);

    const show = await getShow(showId);
    if (!show) {
        return NextResponse.json({ error: 'Show not found.' }, { status: 404 });
    }

    const [tab, songs, userVotes, snapshot] = await Promise.all([
        getTab(show.tabId),
        getSortedSongsForShow(showId),
        visitorId
            ? getUserVotesForShow(showId, visitorId)
            : Promise.resolve({ upvotedSongIds: [], downvotedSongIds: [] }),
        show.status === 'archived' ? getShowSnapshot(showId) : Promise.resolve(null),
    ]);

    const censoredSongs = songs.map((s) => ({
        ...s,
        name: censorProfanity(s.name),
        artist: censorProfanity(s.artist),
    }));

    return NextResponse.json({
        show,
        tab,
        songs: censoredSongs,
        userVotes,
        snapshot,                  // Frozen ranking at archive time (null if not archived)
        canVote:
            (show.status !== 'archived' || (tab?.settings.allowArchivedVoting ?? true)) &&
            !show.locked &&
            show.permissions.canVote,
        canAddSongs:
            show.status === 'active' &&
            !show.locked &&
            show.permissions.canAddSongs,
    });
}
