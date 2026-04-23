// ============================================================================
// Legacy → Multi-Tab Migration
// ============================================================================
// The legacy hackathon:* keys in lib/redis-store.ts represent the current
// "main tab, current show". This module provides utilities to snapshot that
// session into a new Show entity under the main tab, enabling:
//
// 1. One-time bootstrap: capture the live session as Show #1 of the main tab
//    so the historical archive starts with a real show.
// 2. Recurring "End Show" admin action: archive the current legacy session
//    into a new historical Show, then optionally reset the legacy session to
//    start a fresh round.
//
// IMPORTANT: This script does NOT delete legacy keys. The reset of the
// legacy session is a separate explicit step (resetSession() in redis-store).
// This keeps the migration non-destructive and reversible.
// ============================================================================

import { Redis } from '@upstash/redis';
import {
    getSortedSongs,
    isPlaylistLocked,
    getSessionPermissions,
    getStreamConfig,
    getShowClock,
    getPlaylistTitle,
} from '../redis-store';
import { ensureMainTab } from '../stores/tab-store';
import {
    createShow,
    archiveShow,
    getCurrentShowForTab,
    getShow,
} from '../stores/show-store';
import { KEYS, MAIN_TAB_ID } from '../entities';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = new Redis({
    url: REDIS_URL || 'https://placeholder.upstash.io',
    token: REDIS_TOKEN || 'placeholder',
});

// ----------------------------------------------------------------------------
// Snapshot the current legacy session into a new Show
// ----------------------------------------------------------------------------

export interface SnapshotLegacyOptions {
    title?: string;
    description?: string;
    createdBy: string;
    archiveImmediately?: boolean;
}

export async function snapshotLegacySessionAsShow(
    options: SnapshotLegacyOptions
): Promise<{
    success: boolean;
    showId?: string;
    songsCopied?: number;
    error?: string;
}> {
    try {
        // 1. Ensure main tab exists
        const mainTab = await ensureMainTab();

        // 2. Read current session state from legacy keys
        const [songs, locked, permissions, streamConfig, showClock, title] = await Promise.all([
            getSortedSongs(),
            isPlaylistLocked(),
            getSessionPermissions(),
            getStreamConfig(),
            getShowClock(),
            getPlaylistTitle(),
        ]);

        // 3. Create new show under main tab
        const showResult = await createShow({
            tabId: mainTab.id,
            title: options.title || title || `${mainTab.name} Snapshot`,
            description: options.description,
            createdBy: options.createdBy,
            autoActivate: false,
        });

        if (!showResult.success || !showResult.show) {
            return { success: false, error: showResult.error || 'Failed to create show entity.' };
        }

        const showId = showResult.show.id;

        // 4. Copy songs into per-show hash, with showId/tabId stamped on each
        if (songs.length > 0) {
            const songMap: Record<string, unknown> = {};
            for (const song of songs) {
                songMap[song.id] = {
                    ...song,
                    showId,
                    tabId: mainTab.id,
                };
            }
            await redis.hset(KEYS.showSongs(showId), songMap);

            // 5. Copy per-song vote sets
            for (const song of songs) {
                const ops: Promise<unknown>[] = [];
                if (song.upvotes && song.upvotes.length > 0) {
                    ops.push(
                        redis.sadd(
                            KEYS.showSongUpvotes(showId, song.id),
                            song.upvotes[0],
                            ...song.upvotes.slice(1)
                        )
                    );
                }
                if (song.downvotes && song.downvotes.length > 0) {
                    ops.push(
                        redis.sadd(
                            KEYS.showSongDownvotes(showId, song.id),
                            song.downvotes[0],
                            ...song.downvotes.slice(1)
                        )
                    );
                }
                if (ops.length > 0) await Promise.all(ops);
            }
        }

        // 6. Persist show config (permissions, lock, stream, clock)
        const updatedShow = {
            ...showResult.show,
            permissions,
            locked,
            streamConfig: streamConfig.platform ? streamConfig : undefined,
            showClock: showClock || undefined,
        };
        await redis.hset(KEYS.showsIndex, { [showId]: updatedShow });

        // 7. Optionally archive immediately (creates snapshot of ranking)
        if (options.archiveImmediately) {
            await archiveShow(showId);
        }

        return { success: true, showId, songsCopied: songs.length };
    } catch (error) {
        console.error('Failed to snapshot legacy session:', error);
        return { success: false, error: 'Migration failed. Check server logs.' };
    }
}

// ----------------------------------------------------------------------------
// Bootstrap: ensure the main tab has at least one show
// ----------------------------------------------------------------------------
// Idempotent. Safe to call from any route. If the main tab already has any
// shows (current or archived), this is a no-op. Otherwise it snapshots the
// current legacy session as the main tab's first show.
// ----------------------------------------------------------------------------

// Per-process memo to short-circuit repeated calls within one request worker.
let bootstrapAttempted = false;
let bootstrapPromise: Promise<void> | null = null;

// Redis-level lock guards against duplicate bootstrap when multiple parallel
// processes (build workers, edge regions, race conditions) all see an empty
// main tab simultaneously. Without this, each would create its own "first show"
// using the same legacy session data, producing duplicates.
const BOOTSTRAP_LOCK_KEY = 'platform:bootstrapLock';
const BOOTSTRAP_DONE_KEY = 'platform:bootstrapDone';
const BOOTSTRAP_LOCK_TTL_SECONDS = 30;

export async function ensureMainTabHasShow(): Promise<void> {
    if (bootstrapAttempted) return;
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
        try {
            // Fast path: a previous run already completed bootstrap permanently.
            const done = await redis.get<string>(BOOTSTRAP_DONE_KEY);
            if (done) {
                bootstrapAttempted = true;
                return;
            }

            const mainTab = await ensureMainTab();

            // Idempotency check #1: tab already has a current show.
            const current = await getCurrentShowForTab(mainTab.id);
            if (current) {
                await redis.set(BOOTSTRAP_DONE_KEY, '1');
                bootstrapAttempted = true;
                return;
            }

            // Idempotency check #2: tab has any shows at all (admin may have
            // archived but not started a new one).
            const allShowIds = await redis.zrange<string[]>(
                KEYS.tabShowsList(mainTab.id),
                0,
                -1
            );
            if (allShowIds && allShowIds.length > 0) {
                await redis.set(BOOTSTRAP_DONE_KEY, '1');
                bootstrapAttempted = true;
                return;
            }

            // Acquire the bootstrap lock (NX = only set if not exists).
            // If another process holds the lock, skip and let them complete.
            const acquired = await redis.set(BOOTSTRAP_LOCK_KEY, '1', {
                nx: true,
                ex: BOOTSTRAP_LOCK_TTL_SECONDS,
            });

            if (!acquired) {
                // Another process is bootstrapping - bail out without creating
                // a duplicate. Do NOT memoize so a future request can retry
                // if the lock holder fails.
                console.log('[migration] Bootstrap lock held by another process - skipping');
                return;
            }

            try {
                // Re-check inside the lock in case the lock holder finished
                // between our check above and acquiring it.
                const recheckIds = await redis.zrange<string[]>(
                    KEYS.tabShowsList(mainTab.id),
                    0,
                    -1
                );
                if (recheckIds && recheckIds.length > 0) {
                    await redis.set(BOOTSTRAP_DONE_KEY, '1');
                    bootstrapAttempted = true;
                    return;
                }

                // No shows yet - snapshot the legacy session as Show #1
                const result = await snapshotLegacySessionAsShow({
                    createdBy: 'system-bootstrap',
                    title: 'CrateVote #1',
                    description: 'Imported from the original CrateVote session.',
                });

                if (result.success && result.showId) {
                    await redis.set(KEYS.tabCurrentShow(mainTab.id), result.showId);
                    const show = await getShow(result.showId);
                    if (show) {
                        await redis.hset(KEYS.showsIndex, {
                            [result.showId]: { ...show, status: 'active', startedAt: Date.now() },
                        });
                    }
                    await redis.set(BOOTSTRAP_DONE_KEY, '1');
                    console.log(
                        `[migration] Bootstrapped main tab with show ${result.showId} (${result.songsCopied} songs)`
                    );
                }

                bootstrapAttempted = true;
            } finally {
                await redis.del(BOOTSTRAP_LOCK_KEY);
            }
        } catch (error) {
            console.error('[migration] Bootstrap failed:', error);
            bootstrapAttempted = false;
        } finally {
            bootstrapPromise = null;
        }
    })();

    return bootstrapPromise;
}

// ----------------------------------------------------------------------------
// "End current show" admin flow
// ----------------------------------------------------------------------------
// Captures the current legacy session as a new historical Show under the
// main tab and archives it. Does NOT reset the legacy session - that's a
// separate explicit admin action so admins can review the archive first.
// ----------------------------------------------------------------------------

export async function endCurrentShowAndArchive(
    adminId: string,
    title?: string,
    description?: string
): Promise<{ success: boolean; showId?: string; error?: string }> {
    return snapshotLegacySessionAsShow({
        title,
        description,
        createdBy: adminId,
        archiveImmediately: true,
    });
}

// ----------------------------------------------------------------------------
// Diagnostic helpers
// ----------------------------------------------------------------------------

export async function getMigrationStatus(): Promise<{
    mainTabExists: boolean;
    mainTabHasCurrentShow: boolean;
    mainTabShowCount: number;
}> {
    const mainTab = await ensureMainTab().catch(() => null);
    if (!mainTab) {
        return { mainTabExists: false, mainTabHasCurrentShow: false, mainTabShowCount: 0 };
    }
    const [currentId, allIds] = await Promise.all([
        redis.get<string>(KEYS.tabCurrentShow(mainTab.id)),
        redis.zrange<string[]>(KEYS.tabShowsList(mainTab.id), 0, -1),
    ]);
    return {
        mainTabExists: true,
        mainTabHasCurrentShow: !!currentId,
        mainTabShowCount: Array.isArray(allIds) ? allIds.length : 0,
    };
}
