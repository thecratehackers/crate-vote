// ============================================================================
// Show Store
// ============================================================================
// CRUD for Show entities and per-show songs/votes. Each show is an isolated
// voting space with its own songs, votes, lock state, permissions, and
// activity log. Archived shows remain readable and (per tab settings) votable.
//
// All keys live under show:{showId}:* and tab:{tabId}:* namespaces and never
// conflict with the legacy hackathon:* keys used by lib/redis-store.ts.
// ============================================================================

import { Redis } from '@upstash/redis';
import {
    Show,
    ShowSong,
    ShowStatus,
    ShowExportEligibility,
    KEYS,
    isArchivePastVotingWindow,
} from '../entities';
import type { Song as LegacySong, SessionPermissions } from '../redis-store';
import { getTab, generateId } from './tab-store';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = new Redis({
    url: REDIS_URL || 'https://placeholder.upstash.io',
    token: REDIS_TOKEN || 'placeholder',
});

const DEFAULT_PERMISSIONS: SessionPermissions = {
    canVote: true,
    canAddSongs: true,
};

// ----------------------------------------------------------------------------
// Show CRUD
// ----------------------------------------------------------------------------

export async function getShow(showId: string): Promise<Show | null> {
    try {
        const data = await redis.hget<Show>(KEYS.showsIndex, showId);
        return data || null;
    } catch (error) {
        console.error('Failed to get show:', error);
        return null;
    }
}

export async function listShowsForTab(tabId: string): Promise<Show[]> {
    try {
        // Get show IDs in reverse chronological order (newest first)
        const ids = await redis.zrange<string[]>(KEYS.tabShowsList(tabId), 0, -1, { rev: true });
        if (!ids || ids.length === 0) return [];

        const shows = await Promise.all(ids.map(id => getShow(id)));
        return shows.filter((s): s is Show => s !== null);
    } catch (error) {
        console.error('Failed to list shows for tab:', error);
        return [];
    }
}

export async function getCurrentShowForTab(tabId: string): Promise<Show | null> {
    try {
        const showId = await redis.get<string>(KEYS.tabCurrentShow(tabId));
        if (!showId) return null;
        return getShow(showId);
    } catch (error) {
        console.error('Failed to get current show for tab:', error);
        return null;
    }
}

export interface CreateShowInput {
    tabId: string;
    title?: string;
    description?: string;
    createdBy: string;
    autoActivate?: boolean;     // If true, set as current show immediately
    archivePrevious?: boolean;  // If true, archive the tab's current show first
}

export async function createShow(input: CreateShowInput): Promise<{
    success: boolean;
    show?: Show;
    error?: string;
}> {
    const tab = await getTab(input.tabId);
    if (!tab) return { success: false, error: 'Tab not found.' };

    try {
        // Optionally archive the existing current show first
        if (input.archivePrevious) {
            const current = await getCurrentShowForTab(input.tabId);
            if (current && current.status === 'active') {
                await archiveShow(current.id);
            }
        }

        // Get next show number for this tab
        const showNumber = await redis.incr(KEYS.tabShowCounter(input.tabId));

        const showId = generateId();
        const now = Date.now();
        const show: Show = {
            id: showId,
            tabId: input.tabId,
            showNumber,
            title: input.title?.slice(0, 120) || `${tab.name} #${showNumber}`,
            description: input.description?.slice(0, 280),
            status: input.autoActivate ? 'active' : 'draft',
            createdAt: now,
            startedAt: input.autoActivate ? now : null,
            archivedAt: null,
            createdBy: input.createdBy,
            permissions: { ...DEFAULT_PERMISSIONS },
            locked: false,
        };

        await Promise.all([
            redis.hset(KEYS.showsIndex, { [showId]: show }),
            redis.zadd(KEYS.tabShowsList(input.tabId), { score: now, member: showId }),
        ]);

        if (input.autoActivate) {
            await redis.set(KEYS.tabCurrentShow(input.tabId), showId);
        }

        return { success: true, show };
    } catch (error) {
        console.error('Failed to create show:', error);
        return { success: false, error: 'Could not create show.' };
    }
}

export async function updateShow(
    showId: string,
    updates: Partial<Pick<Show, 'title' | 'description' | 'permissions' | 'locked' | 'streamConfig' | 'showClock'>>
): Promise<{ success: boolean; show?: Show; error?: string }> {
    const existing = await getShow(showId);
    if (!existing) return { success: false, error: 'Show not found.' };

    const updated: Show = {
        ...existing,
        ...(updates.title !== undefined && { title: updates.title.slice(0, 120) }),
        ...(updates.description !== undefined && { description: updates.description?.slice(0, 280) }),
        ...(updates.permissions !== undefined && { permissions: updates.permissions }),
        ...(updates.locked !== undefined && { locked: updates.locked }),
        ...(updates.streamConfig !== undefined && { streamConfig: updates.streamConfig }),
        ...(updates.showClock !== undefined && { showClock: updates.showClock }),
    };

    try {
        await redis.hset(KEYS.showsIndex, { [showId]: updated });
        return { success: true, show: updated };
    } catch (error) {
        console.error('Failed to update show:', error);
        return { success: false, error: 'Could not update show.' };
    }
}

export async function activateShow(showId: string): Promise<{ success: boolean; error?: string }> {
    const show = await getShow(showId);
    if (!show) return { success: false, error: 'Show not found.' };
    if (show.status === 'active') return { success: true };

    // Archive the current show in this tab if any
    const current = await getCurrentShowForTab(show.tabId);
    if (current && current.id !== showId && current.status === 'active') {
        await archiveShow(current.id);
    }

    const updated: Show = {
        ...show,
        status: 'active',
        startedAt: show.startedAt || Date.now(),
        archivedAt: null,
    };
    await Promise.all([
        redis.hset(KEYS.showsIndex, { [showId]: updated }),
        redis.set(KEYS.tabCurrentShow(show.tabId), showId),
    ]);
    return { success: true };
}

export async function archiveShow(showId: string): Promise<{ success: boolean; error?: string }> {
    const show = await getShow(showId);
    if (!show) return { success: false, error: 'Show not found.' };
    if (show.status === 'archived') return { success: true };

    // Snapshot current ranking
    const ranked = await getSortedSongsForShow(showId);
    const snapshot = {
        archivedAt: Date.now(),
        ranking: ranked.map((s, i) => ({
            rank: i + 1,
            songId: s.id,
            name: s.name,
            artist: s.artist,
            score: s.score,
        })),
    };

    const updated: Show = {
        ...show,
        status: 'archived',
        archivedAt: snapshot.archivedAt,
        // Stay unlocked: archived voting is governed by the 30-day window
        // enforced in voteOnShowSong / addShowSong. Admins can still flip
        // `locked` manually via updateShow if they want a hard freeze.
        locked: false,
    };

    const ops: Promise<unknown>[] = [
        redis.hset(KEYS.showsIndex, { [showId]: updated }),
        redis.set(KEYS.showSnapshot(showId), snapshot),
    ];

    // Clear current-show pointer if this was the active show
    const currentId = await redis.get<string>(KEYS.tabCurrentShow(show.tabId));
    if (currentId === showId) {
        ops.push(redis.del(KEYS.tabCurrentShow(show.tabId)));
    }

    await Promise.all(ops);
    return { success: true };
}

// ----------------------------------------------------------------------------
// Per-show song operations
// ----------------------------------------------------------------------------

export async function getShowSongs(showId: string): Promise<ShowSong[]> {
    try {
        const songs = await redis.hgetall<Record<string, ShowSong>>(KEYS.showSongs(showId));
        return Object.values(songs || {});
    } catch (error) {
        console.error('Failed to get show songs:', error);
        return [];
    }
}

async function getShowSongVotes(showId: string, songId: string): Promise<{
    upvotes: string[];
    downvotes: string[];
    score: number;
}> {
    try {
        const [up, down] = await Promise.all([
            redis.smembers(KEYS.showSongUpvotes(showId, songId)).catch(() => []),
            redis.smembers(KEYS.showSongDownvotes(showId, songId)).catch(() => []),
        ]);
        const upvotes = Array.isArray(up) ? up : [];
        const downvotes = Array.isArray(down) ? down : [];
        return { upvotes, downvotes, score: upvotes.length - downvotes.length };
    } catch (error) {
        console.error('Failed to get show song votes:', error);
        return { upvotes: [], downvotes: [], score: 0 };
    }
}

export async function getSortedSongsForShow(showId: string): Promise<(ShowSong & { score: number })[]> {
    const songs = await getShowSongs(showId);
    if (songs.length === 0) return [];

    const allVotes = await Promise.all(songs.map(s => getShowSongVotes(showId, s.id)));

    return songs
        .map((song, idx) => ({
            ...song,
            upvotes: allVotes[idx].upvotes,
            downvotes: allVotes[idx].downvotes,
            score: allVotes[idx].score,
        }))
        .sort((a, b) => {
            // Same sort logic as legacy: positive > unvoted > negative
            const aPos = a.score > 0;
            const bPos = b.score > 0;
            const aZero = a.score === 0;
            const bZero = b.score === 0;
            if (aPos && !bPos) return -1;
            if (!aPos && bPos) return 1;
            if (aPos && bPos) {
                if (b.score !== a.score) return b.score - a.score;
                return a.addedAt - b.addedAt;
            }
            if (aZero && !bZero) return -1;
            if (!aZero && bZero) return 1;
            if (aZero && bZero) return b.addedAt - a.addedAt;
            if (b.score !== a.score) return b.score - a.score;
            return a.addedAt - b.addedAt;
        });
}

export interface AddShowSongInput {
    showId: string;
    visitorId: string;
    isAdmin?: boolean;
    song: Omit<LegacySong, 'upvotes' | 'downvotes' | 'addedAt'>;
}

export async function addShowSong(input: AddShowSongInput): Promise<{
    success: boolean;
    error?: string;
    song?: ShowSong;
}> {
    const show = await getShow(input.showId);
    if (!show) return { success: false, error: 'Show not found.' };

    const tab = await getTab(show.tabId);
    if (!tab) return { success: false, error: 'Tab not found.' };

    if (!input.isAdmin) {
        if (show.status === 'archived') {
            if (!tab.settings.allowArchivedVoting) {
                return { success: false, error: 'This show is archived and no longer accepts new songs.' };
            }
            if (isArchivePastVotingWindow(show)) {
                return { success: false, error: 'This archive is past its 30-day window and is permanently locked.' };
            }
        }
        if (show.locked) {
            return { success: false, error: 'This show is currently locked.' };
        }
        if (!show.permissions.canAddSongs) {
            return { success: false, error: 'Adding songs is currently disabled in this show.' };
        }

        // Per-show user song count limit
        const count = await redis.hget<number>(KEYS.showUserSongCounts(input.showId), input.visitorId) || 0;
        if (count >= tab.settings.maxSongsPerUser) {
            return {
                success: false,
                error: `You've reached the song limit (${tab.settings.maxSongsPerUser}) in this show.`,
            };
        }

        // Playlist size cap
        const total = await redis.hlen(KEYS.showSongs(input.showId));
        if (total >= tab.settings.maxPlaylistSize) {
            return {
                success: false,
                error: 'This show is full. Wait for songs to be removed before adding more.',
            };
        }
    }

    // Duplicate check
    const existing = await redis.hget(KEYS.showSongs(input.showId), input.song.id);
    if (existing) {
        return { success: false, error: 'This song is already in this show.' };
    }

    const newSong: ShowSong = {
        ...input.song,
        upvotes: [],
        downvotes: [],
        addedAt: Date.now(),
        showId: input.showId,
        tabId: show.tabId,
    };

    await redis.hset(KEYS.showSongs(input.showId), { [input.song.id]: newSong });
    if (!input.isAdmin) {
        await redis.hincrby(KEYS.showUserSongCounts(input.showId), input.visitorId, 1);
    }

    return { success: true, song: newSong };
}

export async function deleteShowSong(
    showId: string,
    songId: string,
    visitorId: string,
    isAdmin: boolean
): Promise<{ success: boolean; error?: string }> {
    const song = await redis.hget<ShowSong>(KEYS.showSongs(showId), songId);
    if (!song) return { success: false, error: 'Song not found.' };

    if (!isAdmin && song.addedBy !== visitorId) {
        return { success: false, error: 'You can only delete songs that you added.' };
    }

    await Promise.all([
        redis.hdel(KEYS.showSongs(showId), songId),
        redis.del(KEYS.showSongUpvotes(showId, songId)),
        redis.del(KEYS.showSongDownvotes(showId, songId)),
    ]);

    return { success: true };
}

// ----------------------------------------------------------------------------
// Per-show voting
// ----------------------------------------------------------------------------

export async function voteOnShowSong(
    showId: string,
    songId: string,
    visitorId: string,
    direction: 1 | -1,
    isAdmin: boolean
): Promise<{ success: boolean; error?: string }> {
    const show = await getShow(showId);
    if (!show) return { success: false, error: 'Show not found.' };

    const tab = await getTab(show.tabId);
    if (!tab) return { success: false, error: 'Tab not found.' };

    if (!isAdmin) {
        if (show.status === 'archived') {
            if (!tab.settings.allowArchivedVoting) {
                return { success: false, error: 'Voting on archived shows is disabled.' };
            }
            if (isArchivePastVotingWindow(show)) {
                return { success: false, error: 'This archive is past its 30-day window and is permanently locked.' };
            }
        }
        if (show.locked) {
            return { success: false, error: 'This show is currently locked.' };
        }
        if (!show.permissions.canVote) {
            return { success: false, error: 'Voting is currently disabled in this show.' };
        }
    }

    const song = await redis.hget<ShowSong>(KEYS.showSongs(showId), songId);
    if (!song) return { success: false, error: 'Song not found.' };

    const upKey = KEYS.showSongUpvotes(showId, songId);
    const downKey = KEYS.showSongDownvotes(showId, songId);
    const userUpKey = KEYS.showUserUpvotes(showId);
    const userDownKey = KEYS.showUserDownvotes(showId);

    const userUp = (await redis.hget<string[]>(userUpKey, visitorId)) || [];
    const userDown = (await redis.hget<string[]>(userDownKey, visitorId)) || [];

    if (direction === 1) {
        const already = await redis.sismember(upKey, visitorId);
        if (already) {
            await redis.srem(upKey, visitorId);
            await redis.hset(userUpKey, { [visitorId]: userUp.filter(s => s !== songId) });
        } else {
            // Switch off any existing downvote first
            const hadDown = await redis.sismember(downKey, visitorId);
            if (hadDown) {
                await redis.srem(downKey, visitorId);
                await redis.hset(userDownKey, { [visitorId]: userDown.filter(s => s !== songId) });
            }
            await redis.sadd(upKey, visitorId);
            await redis.hset(userUpKey, { [visitorId]: [...userUp, songId] });
        }
    } else {
        const already = await redis.sismember(downKey, visitorId);
        if (already) {
            await redis.srem(downKey, visitorId);
            await redis.hset(userDownKey, { [visitorId]: userDown.filter(s => s !== songId) });
        } else {
            const hadUp = await redis.sismember(upKey, visitorId);
            if (hadUp) {
                await redis.srem(upKey, visitorId);
                await redis.hset(userUpKey, { [visitorId]: userUp.filter(s => s !== songId) });
            }
            await redis.sadd(downKey, visitorId);
            await redis.hset(userDownKey, { [visitorId]: [...userDown, songId] });
        }
    }

    return { success: true };
}

export async function getUserVotesForShow(
    showId: string,
    visitorId: string
): Promise<{ upvotedSongIds: string[]; downvotedSongIds: string[] }> {
    try {
        const [up, down] = await Promise.all([
            redis.hget<string[]>(KEYS.showUserUpvotes(showId), visitorId),
            redis.hget<string[]>(KEYS.showUserDownvotes(showId), visitorId),
        ]);
        return { upvotedSongIds: up || [], downvotedSongIds: down || [] };
    } catch (error) {
        console.error('Failed to get user votes for show:', error);
        return { upvotedSongIds: [], downvotedSongIds: [] };
    }
}

// ----------------------------------------------------------------------------
// Snapshot (frozen-at-archive ranking)
// ----------------------------------------------------------------------------

export async function getShowSnapshot(showId: string): Promise<{
    archivedAt: number;
    ranking: Array<{ rank: number; songId: string; name: string; artist: string; score: number }>;
} | null> {
    try {
        return await redis.get(KEYS.showSnapshot(showId));
    } catch {
        return null;
    }
}

// ----------------------------------------------------------------------------
// Export eligibility (per-show)
// ----------------------------------------------------------------------------

export async function getShowExportEligibility(
    showId: string,
    visitorId: string
): Promise<ShowExportEligibility> {
    const songsAddedRaw = await redis.hget<number>(KEYS.showUserSongCounts(showId), visitorId) || 0;
    const upvoted = (await redis.hget<string[]>(KEYS.showUserUpvotes(showId), visitorId)) || [];
    const downvoted = (await redis.hget<string[]>(KEYS.showUserDownvotes(showId), visitorId)) || [];

    const totalActions = songsAddedRaw + upvoted.length + downvoted.length;
    const eligible = totalActions >= 3;     // Same threshold spirit as legacy

    return {
        showId,
        eligible,
        songsAdded: songsAddedRaw,
        upvotesGiven: upvoted.length,
        downvotesGiven: downvoted.length,
        reason: eligible ? undefined : 'Add at least 3 songs or votes to unlock export.',
    };
}

// ----------------------------------------------------------------------------
// Show purge (admin-only, deletes all per-show data)
// ----------------------------------------------------------------------------

export async function purgeShowData(showId: string): Promise<void> {
    const songs = await getShowSongs(showId);
    const ops: Promise<unknown>[] = [
        redis.del(KEYS.showSongs(showId)),
        redis.del(KEYS.showLocked(showId)),
        redis.del(KEYS.showPermissions(showId)),
        redis.del(KEYS.showActivityLog(showId)),
        redis.del(KEYS.showUserSongCounts(showId)),
        redis.del(KEYS.showUserUpvotes(showId)),
        redis.del(KEYS.showUserDownvotes(showId)),
        redis.del(KEYS.showSnapshot(showId)),
        redis.hdel(KEYS.showsIndex, showId),
    ];
    for (const song of songs) {
        ops.push(redis.del(KEYS.showSongUpvotes(showId, song.id)));
        ops.push(redis.del(KEYS.showSongDownvotes(showId, song.id)));
    }
    await Promise.all(ops);
}

export type { Show, ShowSong, ShowStatus, ShowExportEligibility };
