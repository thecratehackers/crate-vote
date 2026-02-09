import { Redis } from '@upstash/redis';

// Validate Redis configuration
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Export a function to check if Redis is configured
export function isRedisConfigured(): boolean {
    return !!(REDIS_URL && REDIS_TOKEN);
}

if (!REDIS_URL || !REDIS_TOKEN) {
    console.error('❌ CRITICAL: Redis environment variables are missing!');
    console.error('   Required: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
    console.error('   Or: KV_REST_API_URL and KV_REST_API_TOKEN (for Vercel KV)');
    console.error('   Please set these in your Vercel project settings or .env.local');
}

// Initialize Redis client
const redis = new Redis({
    url: REDIS_URL || 'https://placeholder.upstash.io', // Fallback to prevent URL parse error
    token: REDIS_TOKEN || 'placeholder',
});

// ============ IN-MEMORY CACHE FOR HIGH VOLUME ============
// At 1000 users polling every 15s, we get ~67 requests/second
// Caching reduces Redis calls dramatically
interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function invalidateCache(key: string): void {
    cache.delete(key);
}

// Cache TTLs (in ms) - shorter = fresher data, longer = less Redis load
const CACHE_TTL = {
    SONGS: 2000,        // 2 seconds - songs update frequently but can tolerate slight delay
    TIMER: 5000,        // 5 seconds - timer is read-heavy, rarely changes mid-session
    LOCKED: 5000,       // 5 seconds - locked state rarely changes
    VIEWER_COUNT: 10000, // 10 seconds - approximate count is fine
    PLAYLIST_TITLE: 30000, // 30 seconds - rarely changes
};

// Keys for Redis
const SONGS_KEY = 'hackathon:songs';
const BANNED_KEY = 'hackathon:banned';
const LOCKED_KEY = 'hackathon:locked';
const USER_SONG_COUNTS_KEY = 'hackathon:userSongCounts';
const USER_DELETE_COUNTS_KEY = 'hackathon:userDeleteCounts';
const USER_UPVOTE_KEY = 'hackathon:userUpvote';
const USER_DOWNVOTE_KEY = 'hackathon:userDownvote';
const TIMER_KEY = 'hackathon:timer';
const ADMIN_HEARTBEAT_KEY = 'hackathon:adminHeartbeats';
const PLAYLIST_TITLE_KEY = 'hackathon:playlistTitle';
const ACTIVITY_LOG_KEY = 'hackathon:activityLog';
const USER_KARMA_KEY = 'hackathon:userKarma';
const TOP3_KARMA_GRANTED_KEY = 'hackathon:top3KarmaGranted';  // Track songs that already gave top 3 karma
const USER_LAST_ACTIVITY_KEY = 'hackathon:userLastActivity';  // Track when users were last active
const DELETE_WINDOW_KEY = 'hackathon:deleteWindow';  // { endTime: timestamp } - when delete window is active
const DELETE_WINDOW_USED_KEY = 'hackathon:deleteWindowUsed';  // Set of visitorIds who used their delete this window
const KARMA_RAIN_KEY = 'hackathon:karmaRain';  // { timestamp: number } - when last karma rain happened
const SESSION_PERMISSIONS_KEY = 'hackathon:sessionPermissions';  // { canVote: boolean, canAddSongs: boolean }
const YOUTUBE_EMBED_KEY = 'hackathon:youtubeEmbed';  // YouTube URL for live stream embed (legacy)
const STREAM_CONFIG_KEY = 'hackathon:streamConfig';  // { platform, youtubeUrl?, twitchChannel? }
const DOUBLE_POINTS_KEY = 'hackathon:doublePoints';  // { endTime: timestamp } - when double points mode is active

// VERSUS BATTLE KEYS - Head-to-head song battles
const VERSUS_BATTLE_KEY = 'hackathon:versusBattle';  // Main battle state
const VERSUS_VOTES_A_KEY = 'hackathon:versusVotesA';  // Set of visitorIds who voted for Song A
const VERSUS_VOTES_B_KEY = 'hackathon:versusVotesB';  // Set of visitorIds who voted for Song B
const ELIMINATED_SONGS_KEY = 'hackathon:eliminatedSongs';  // Set of Spotify IDs eliminated - cannot be re-added

// ATOMIC VOTE KEYS - Using Redis Sets for concurrent vote safety
// Format: hackathon:song:{songId}:upvotes and hackathon:song:{songId}:downvotes
function getSongUpvotesKey(songId: string): string {
    return `hackathon:song:${songId}:upvotes`;
}
function getSongDownvotesKey(songId: string): string {
    return `hackathon:song:${songId}:downvotes`;
}

// ============ TYPES ============
export interface Song {
    id: string;
    spotifyUri: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    previewUrl: string | null;
    addedBy: string;
    addedByName: string;
    addedByLocation?: string;  // Location display string (e.g., "Austin, TX" or "🇬🇧 London, UK")
    addedAt: number;
    upvotes: string[];
    downvotes: string[];
    popularity: number;
    bpm: number | null;
    energy: number | null;
    valence: number | null;
    danceability: number | null;
    camelotKey: string | null;  // DJ-friendly key notation (e.g., "8A", "11B")
}

interface TimerData {
    endTime: number | null;
    duration: number;
    running: boolean;
}

// Constants
const MAX_SONGS_PER_USER = 5;
const MAX_DELETES_PER_USER = 5;
const MAX_UPVOTES_PER_USER = 5;
const MAX_DOWNVOTES_PER_USER = 5;
const MAX_PLAYLIST_SIZE = 100;  // Hard cap on total songs
const AUTO_PRUNE_THRESHOLD = -2;  // Songs at this score or below get pruned

// ============ HELPER FUNCTIONS ============
// Calculate score from vote arrays (for compatibility with old Song interface)
function calculateScore(song: Song): number {
    return song.upvotes.length - song.downvotes.length;
}

// Get vote counts for a song using atomic Redis operations
async function getSongVotes(songId: string): Promise<{ upvotes: string[]; downvotes: string[]; score: number }> {
    try {
        const upvotesKey = getSongUpvotesKey(songId);
        const downvotesKey = getSongDownvotesKey(songId);

        // Fetch both vote sets in parallel
        const [upvotesResult, downvotesResult] = await Promise.all([
            redis.smembers(upvotesKey).catch(() => []),
            redis.smembers(downvotesKey).catch(() => []),
        ]);

        // Ensure we have arrays (smembers returns null for non-existent keys in some cases)
        const upvotes = Array.isArray(upvotesResult) ? upvotesResult : [];
        const downvotes = Array.isArray(downvotesResult) ? downvotesResult : [];

        return {
            upvotes,
            downvotes,
            score: upvotes.length - downvotes.length,
        };
    } catch (error) {
        console.error('Failed to get song votes for', songId, ':', error);
        return { upvotes: [], downvotes: [], score: 0 };
    }
}

// ============ SONG FUNCTIONS ============
export async function getSortedSongs(): Promise<(Song & { score: number })[]> {
    // Check cache first (2s TTL)
    const cacheKey = 'sorted_songs';
    const cached = getCached<(Song & { score: number })[]>(cacheKey);
    if (cached) return cached;

    try {
        const songs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const songList = Object.values(songs);

        // Fetch votes for all songs in parallel using atomic Redis Sets
        const votesPromises = songList.map(song => getSongVotes(song.id));
        const allVotes = await Promise.all(votesPromises);

        // Merge vote data with songs
        const result = songList
            .map((song, index) => ({
                ...song,
                upvotes: allVotes[index].upvotes,
                downvotes: allVotes[index].downvotes,
                score: allVotes[index].score,
            }))
            .sort((a, b) => {
                // Priority 1: Unvoted songs (score === 0) rise to the top
                // This ensures fresh additions get visibility before being ranked
                const aIsUnvoted = a.score === 0;
                const bIsUnvoted = b.score === 0;

                if (aIsUnvoted && !bIsUnvoted) return -1; // a (unvoted) goes first
                if (!aIsUnvoted && bIsUnvoted) return 1;  // b (unvoted) goes first

                // Within unvoted: newest first (most recently added at top)
                if (aIsUnvoted && bIsUnvoted) {
                    return b.addedAt - a.addedAt; // Newest first
                }

                // Within voted songs: sort by score descending, then oldest first for ties
                if (b.score !== a.score) return b.score - a.score;
                return a.addedAt - b.addedAt;
            })
            .slice(0, MAX_PLAYLIST_SIZE);  // Always cap at 100 songs

        setCache(cacheKey, result, CACHE_TTL.SONGS);
        return result;
    } catch (error) {
        console.error('Failed to get songs:', error);
        return [];
    }
}

// Invalidate songs cache when data changes
export function invalidateSongsCache(): void {
    invalidateCache('sorted_songs');
}

// Update audio features for an existing song
export async function updateSongAudioFeatures(
    songId: string,
    features: { bpm: number | null; energy: number | null; valence: number | null; danceability: number | null }
): Promise<boolean> {
    try {
        const song = await redis.hget<Song>(SONGS_KEY, songId);
        if (!song) return false;

        const updatedSong: Song = {
            ...song,
            bpm: features.bpm,
            energy: features.energy,
            valence: features.valence,
            danceability: features.danceability,
        };

        await redis.hset(SONGS_KEY, { [songId]: updatedSong });
        return true;
    } catch (error) {
        console.error('Failed to update song audio features:', error);
        return false;
    }
}

// Auto-prune songs with very negative scores that have been around for a while
export async function autoPruneSongs(): Promise<{ pruned: string[] }> {
    try {
        const allSongs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        const pruned: string[] = [];

        for (const [id, song] of Object.entries(allSongs)) {
            const score = calculateScore(song);
            const age = now - song.addedAt;

            // Prune if score is very negative AND song has been around for 5+ minutes
            if (score <= AUTO_PRUNE_THRESHOLD && age >= fiveMinutes) {
                await redis.hdel(SONGS_KEY, id);
                pruned.push(`${song.name} by ${song.artist}`);
                console.log(`Auto-pruned "${song.name}" (score: ${score}, age: ${Math.round(age / 60000)}min)`);
            }
        }

        return { pruned };
    } catch (error) {
        console.error('Failed to auto-prune songs:', error);
        return { pruned: [] };
    }
}

// Get playlist stats for UI
export async function getPlaylistStats(): Promise<{ current: number; max: number; canAdd: boolean }> {
    try {
        const allSongs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const songCount = Object.keys(allSongs).length;

        // Can add if under limit OR if there are songs with ≤0 score to displace
        let canAdd = songCount < MAX_PLAYLIST_SIZE;
        if (!canAdd) {
            const hasDisplaceable = Object.values(allSongs).some(s => calculateScore(s) <= 0);
            canAdd = hasDisplaceable;
        }

        return { current: songCount, max: MAX_PLAYLIST_SIZE, canAdd };
    } catch (error) {
        console.error('Failed to get playlist stats:', error);
        return { current: 0, max: MAX_PLAYLIST_SIZE, canAdd: true };
    }
}

// Shuffle playlist - randomize the order by giving each song a random addedAt timestamp
// This effectively randomizes the order when songs are sorted by addedAt (secondary sort after score)
export async function shufflePlaylist(): Promise<{ success: boolean; error?: string; shuffledCount: number }> {
    try {
        const allSongs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const songList = Object.values(allSongs);

        if (songList.length < 2) {
            return { success: false, error: 'Need at least 2 songs to shuffle', shuffledCount: 0 };
        }

        // Generate random timestamps for each song within a small window
        // This ensures the shuffle is randomized but all songs are "added" at roughly the same time
        const baseTime = Date.now();
        const shuffledSongs = songList.map(song => ({
            ...song,
            addedAt: baseTime + Math.floor(Math.random() * 10000), // Random within 10 seconds
        }));

        // Update all songs in Redis
        const updates: Record<string, Song> = {};
        for (const song of shuffledSongs) {
            updates[song.id] = song;
        }

        await redis.hset(SONGS_KEY, updates);

        // Invalidate cache
        invalidateSongsCache();

        console.log(`🔀 Shuffled ${songList.length} songs`);
        return { success: true, shuffledCount: songList.length };
    } catch (error) {
        console.error('Failed to shuffle playlist:', error);
        return { success: false, error: 'Could not shuffle playlist. Please try again.', shuffledCount: 0 };
    }
}

export async function addSong(
    song: Omit<Song, 'upvotes' | 'downvotes' | 'addedAt'>,
    visitorId: string
): Promise<{ success: boolean; error?: string; displaced?: string }> {
    try {
        const isLocked = await redis.get<boolean>(LOCKED_KEY) || false;
        if (isLocked) {
            return { success: false, error: 'The playlist is currently locked. Wait for the host to unlock it.' };
        }

        // Check session permissions - admin may have disabled song adding
        const permissions = await getSessionPermissions();
        if (!permissions.canAddSongs) {
            return { success: false, error: 'Adding songs is currently disabled by the host.' };
        }

        const banned = await redis.sismember(BANNED_KEY, visitorId);
        if (banned) {
            return { success: false, error: 'Your account has been suspended from this session.' };
        }

        // Check song count - include karma bonuses
        const counts = await redis.hget<number>(USER_SONG_COUNTS_KEY, visitorId) || 0;
        const karmaBonuses = await getKarmaBonuses(visitorId);
        const maxSongs = MAX_SONGS_PER_USER + karmaBonuses.bonusSongAdds;

        if (counts >= maxSongs) {
            return { success: false, error: `You've reached your song limit (${maxSongs}). Earn karma to add more!` };
        }

        // Check if song already exists
        const existing = await redis.hget(SONGS_KEY, song.id);
        if (existing) {
            return { success: false, error: 'This song is already in the playlist. Try adding something else!' };
        }

        // Check if song was eliminated in a Versus Battle (cannot be re-added this session)
        const isEliminated = await isSongEliminated(song.id);
        if (isEliminated) {
            return { success: false, error: 'This song was eliminated in a Versus Battle and cannot be re-added this session.' };
        }

        // Check playlist size limit
        const allSongs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const songCount = Object.keys(allSongs).length;

        let displacedSong: string | undefined;

        if (songCount >= MAX_PLAYLIST_SIZE) {
            // Find the lowest-scoring song that can be displaced (score <= 0)
            const sortedSongs = Object.values(allSongs)
                .map(s => ({ ...s, score: calculateScore(s) }))
                .filter(s => s.score <= 0)  // Only displace songs with 0 or negative score
                .sort((a, b) => a.score - b.score);  // Lowest first

            if (sortedSongs.length === 0) {
                // All songs have positive scores - can't add more
                return { success: false, error: 'Playlist is full! Downvote some songs to make room for new ones.' };
            }

            // Remove the lowest-scoring song to make room
            const toRemove = sortedSongs[0];
            await redis.hdel(SONGS_KEY, toRemove.id);
            displacedSong = `${toRemove.name} by ${toRemove.artist}`;
            console.log(`Displaced song "${toRemove.name}" (score: ${toRemove.score}) to make room`);
        }

        // Add the song
        const newSong: Song = {
            ...song,
            upvotes: [],
            downvotes: [],
            addedAt: Date.now(),
        };

        await redis.hset(SONGS_KEY, { [song.id]: newSong });
        await redis.hincrby(USER_SONG_COUNTS_KEY, visitorId, 1);

        // Invalidate cache since songs changed
        invalidateSongsCache();

        // If this add is beyond base limit, spend karma (5 karma per extra song)
        const newCount = counts + 1;
        if (newCount > MAX_SONGS_PER_USER) {
            const KARMA_COST_PER_EXTRA_SONG = 5;
            await addKarma(visitorId, -KARMA_COST_PER_EXTRA_SONG);
            console.log(`User ${visitorId} spent ${KARMA_COST_PER_EXTRA_SONG} karma on extra song add`);
        }

        // Track user activity for admin panel sorting
        await updateUserActivity(visitorId);

        return { success: true, displaced: displacedSong };
    } catch (error) {
        console.error('Failed to add song:', error);
        return { success: false, error: 'Something went wrong. Please try again in a moment.' };
    }
}

// Admin add song - bypasses lock but respects 100-song cap
export async function adminAddSong(
    song: Omit<Song, 'upvotes' | 'downvotes' | 'addedAt'>
): Promise<{ success: boolean; error?: string; displaced?: string }> {
    try {
        // Check if song already exists
        const existing = await redis.hget(SONGS_KEY, song.id);
        if (existing) {
            return { success: false, error: 'This song is already in the playlist.' };
        }

        // Check playlist size limit - displace lowest-scoring if at cap
        const allSongs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const songCount = Object.keys(allSongs).length;
        let displacedSong: string | undefined;

        if (songCount >= MAX_PLAYLIST_SIZE) {
            // Find the lowest-scoring song to displace
            const sortedSongs = Object.values(allSongs)
                .map(s => ({ ...s, score: s.upvotes.length - s.downvotes.length }))
                .sort((a, b) => a.score - b.score);  // Lowest first

            const toRemove = sortedSongs[0];
            await redis.hdel(SONGS_KEY, toRemove.id);
            displacedSong = `${toRemove.name} by ${toRemove.artist}`;
            console.log(`Admin import displaced "${toRemove.name}" (score: ${toRemove.score}) to make room`);
        }

        // Add the song
        const newSong: Song = {
            ...song,
            upvotes: [],
            downvotes: [],
            addedAt: Date.now(),
        };

        await redis.hset(SONGS_KEY, { [song.id]: newSong });
        invalidateSongsCache();

        return { success: true, displaced: displacedSong };
    } catch (error) {
        console.error('Failed to admin add song:', error);
        return { success: false, error: 'Something went wrong. Please try again.' };
    }
}

export async function deleteSong(songId: string, visitorId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const song = await redis.hget<Song>(SONGS_KEY, songId);
        if (!song) {
            return { success: false, error: 'This song is no longer in the playlist. It may have been removed.' };
        }

        // Only the person who added can delete, and only if they have deletes left
        if (song.addedBy !== visitorId) {
            return { success: false, error: 'You can only delete songs that you added.' };
        }

        const deleteCount = await redis.hget<number>(USER_DELETE_COUNTS_KEY, visitorId) || 0;
        if (deleteCount >= MAX_DELETES_PER_USER) {
            return { success: false, error: `You've used all your deletes this session.` };
        }

        await redis.hdel(SONGS_KEY, songId);
        await redis.hincrby(USER_DELETE_COUNTS_KEY, visitorId, 1);
        await redis.hincrby(USER_SONG_COUNTS_KEY, visitorId, -1);

        return { success: true };
    } catch (error) {
        console.error('Failed to delete song:', error);
        return { success: false, error: 'Could not delete song. Please try again.' };
    }
}

// Admin delete song - no ownership check, no limits
// Also cleans up the vote sets for the song
export async function adminDeleteSong(songId: string): Promise<void> {
    try {
        await Promise.all([
            redis.hdel(SONGS_KEY, songId),
            redis.del(getSongUpvotesKey(songId)),
            redis.del(getSongDownvotesKey(songId)),
        ]);
    } catch (error) {
        console.error('Failed to admin delete song:', error);
    }
}

export async function vote(songId: string, visitorId: string, direction: 1 | -1): Promise<{ success: boolean; error?: string }> {
    try {
        const isLocked = await redis.get<boolean>(LOCKED_KEY) || false;
        if (isLocked) {
            return { success: false, error: 'Voting is currently paused. Wait for the host to unlock the playlist.' };
        }

        // Check session permissions - admin may have disabled voting
        const permissions = await getSessionPermissions();
        if (!permissions.canVote) {
            return { success: false, error: 'Voting is currently disabled by the host.' };
        }

        const banned = await redis.sismember(BANNED_KEY, visitorId);
        if (banned) {
            return { success: false, error: 'Your account has been suspended from this session.' };
        }

        // Check song exists
        const song = await redis.hget<Song>(SONGS_KEY, songId);
        if (!song) {
            return { success: false, error: 'This song was removed from the playlist.' };
        }

        // Get user's current vote lists (for limit tracking)
        const userUpvotes = await redis.hget<string[]>(USER_UPVOTE_KEY, visitorId) || [];
        const userDownvotes = await redis.hget<string[]>(USER_DOWNVOTE_KEY, visitorId) || [];

        // Get song's vote keys for atomic operations
        const upvotesKey = getSongUpvotesKey(songId);
        const downvotesKey = getSongDownvotesKey(songId);

        if (direction === 1) {
            // UPVOTING
            // Check if already upvoted using atomic SISMEMBER
            const alreadyUpvoted = await redis.sismember(upvotesKey, visitorId);

            if (alreadyUpvoted) {
                // Toggle off - remove upvote using atomic SREM
                await redis.srem(upvotesKey, visitorId);
                const newUserUpvotes = userUpvotes.filter(id => id !== songId);
                await redis.hset(USER_UPVOTE_KEY, { [visitorId]: newUserUpvotes });
            } else {
                // Check limit - include karma bonuses (God Mode bypasses limits)
                const godMode = await isGodMode(visitorId);
                if (!godMode) {
                    const karmaBonuses = await getKarmaBonuses(visitorId);
                    const maxUpvotes = MAX_UPVOTES_PER_USER + karmaBonuses.bonusVotes;
                    if (userUpvotes.length >= maxUpvotes) {
                        return { success: false, error: `You've used all ${maxUpvotes} upvotes. Earn karma for more!` };
                    }
                }

                // Remove any existing downvote on this song first (atomic SREM)
                const hadDownvote = await redis.sismember(downvotesKey, visitorId);
                if (hadDownvote) {
                    await redis.srem(downvotesKey, visitorId);
                    await redis.srem(downvotesKey, `${visitorId}_double`); // Remove bonus too
                    const newUserDownvotes = userDownvotes.filter(id => id !== songId);
                    await redis.hset(USER_DOWNVOTE_KEY, { [visitorId]: newUserDownvotes });
                }

                // Add upvote using atomic SADD
                await redis.sadd(upvotesKey, visitorId);
                await redis.hset(USER_UPVOTE_KEY, { [visitorId]: [...userUpvotes, songId] });

                // ⚡ DOUBLE POINTS - Add bonus vote if active
                const doublePointsActive = await isDoublePointsActive();
                if (doublePointsActive) {
                    await redis.sadd(upvotesKey, `${visitorId}_double`);
                }
            }
        } else {
            // DOWNVOTING
            // Check if already downvoted using atomic SISMEMBER
            const alreadyDownvoted = await redis.sismember(downvotesKey, visitorId);

            if (alreadyDownvoted) {
                // Toggle off - remove downvote using atomic SREM
                await redis.srem(downvotesKey, visitorId);
                const newUserDownvotes = userDownvotes.filter(id => id !== songId);
                await redis.hset(USER_DOWNVOTE_KEY, { [visitorId]: newUserDownvotes });
            } else {
                // Check limit - include karma bonuses (God Mode bypasses limits)
                const godMode = await isGodMode(visitorId);
                if (!godMode) {
                    const karmaBonuses = await getKarmaBonuses(visitorId);
                    const maxDownvotes = MAX_DOWNVOTES_PER_USER + karmaBonuses.bonusVotes;
                    if (userDownvotes.length >= maxDownvotes) {
                        return { success: false, error: `You've used all ${maxDownvotes} downvotes. Earn karma for more!` };
                    }
                }

                // Remove any existing upvote on this song first (atomic SREM)
                const hadUpvote = await redis.sismember(upvotesKey, visitorId);
                if (hadUpvote) {
                    await redis.srem(upvotesKey, visitorId);
                    await redis.srem(upvotesKey, `${visitorId}_double`); // Remove bonus too
                    const newUserUpvotes = userUpvotes.filter(id => id !== songId);
                    await redis.hset(USER_UPVOTE_KEY, { [visitorId]: newUserUpvotes });
                }

                // Add downvote using atomic SADD
                await redis.sadd(downvotesKey, visitorId);
                await redis.hset(USER_DOWNVOTE_KEY, { [visitorId]: [...userDownvotes, songId] });

                // ⚡ DOUBLE POINTS - Add bonus vote if active
                const doublePointsActive = await isDoublePointsActive();
                if (doublePointsActive) {
                    await redis.sadd(downvotesKey, `${visitorId}_double`);
                }
            }
        }

        // Invalidate cache since vote scores changed
        invalidateSongsCache();

        // Track user activity for admin panel sorting
        await updateUserActivity(visitorId);

        return { success: true };
    } catch (error) {
        console.error('Failed to vote:', error);
        return { success: false, error: 'Could not record your vote. Please try again.' };
    }
}

// Admin vote - unlimited voting, can vote on multiple songs
export async function adminVote(songId: string, visitorId: string, direction: 1 | -1): Promise<{ success: boolean; error?: string }> {
    try {
        const song = await redis.hget<Song>(SONGS_KEY, songId);
        if (!song) {
            return { success: false, error: 'This song was removed from the playlist.' };
        }

        const upvotesKey = getSongUpvotesKey(songId);
        const downvotesKey = getSongDownvotesKey(songId);

        if (direction === 1) {
            // Toggle upvote using atomic operations
            const hasUpvoted = await redis.sismember(upvotesKey, visitorId);
            if (hasUpvoted) {
                await redis.srem(upvotesKey, visitorId);
            } else {
                // Remove from downvotes if present, add to upvotes
                await redis.srem(downvotesKey, visitorId);
                await redis.sadd(upvotesKey, visitorId);
            }
        } else {
            // Toggle downvote using atomic operations
            const hasDownvoted = await redis.sismember(downvotesKey, visitorId);
            if (hasDownvoted) {
                await redis.srem(downvotesKey, visitorId);
            } else {
                // Remove from upvotes if present, add to downvotes
                await redis.srem(upvotesKey, visitorId);
                await redis.sadd(downvotesKey, visitorId);
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Failed to admin vote:', error);
        return { success: false, error: 'Could not record vote. Please try again.' };
    }
}

export async function getUserVotes(visitorId: string): Promise<{ upvotedSongIds: string[]; downvotedSongIds: string[] }> {
    try {
        const upvotedSongIds = await redis.hget<string[]>(USER_UPVOTE_KEY, visitorId) || [];
        const downvotedSongIds = await redis.hget<string[]>(USER_DOWNVOTE_KEY, visitorId) || [];
        return { upvotedSongIds, downvotedSongIds };
    } catch (error) {
        console.error('Failed to get user votes:', error);
        return { upvotedSongIds: [], downvotedSongIds: [] };
    }
}

// ============ USER STATUS ============
export async function getUserStatus(visitorId: string): Promise<{
    songsRemaining: number;
    songsAdded: number;
    deletesRemaining: number;
    deletesUsed: number;
    upvotesRemaining: number;
    upvotesUsed: number;
    downvotesRemaining: number;
    downvotesUsed: number;
    isGodMode: boolean;
}> {
    try {
        const songsAdded = await redis.hget<number>(USER_SONG_COUNTS_KEY, visitorId) || 0;
        const deleteCount = await redis.hget<number>(USER_DELETE_COUNTS_KEY, visitorId) || 0;
        const upvotes = await redis.hget<string[]>(USER_UPVOTE_KEY, visitorId) || [];
        const downvotes = await redis.hget<string[]>(USER_DOWNVOTE_KEY, visitorId) || [];

        // Include karma bonuses in the maximum song calculation
        const karmaBonuses = await getKarmaBonuses(visitorId);
        const maxSongs = MAX_SONGS_PER_USER + karmaBonuses.bonusSongAdds;
        const maxUpvotes = MAX_UPVOTES_PER_USER + karmaBonuses.bonusVotes;
        const maxDownvotes = MAX_DOWNVOTES_PER_USER + karmaBonuses.bonusVotes;

        // Check God Mode status
        const godMode = await isGodMode(visitorId);

        return {
            songsRemaining: Math.max(0, maxSongs - songsAdded),
            songsAdded,
            deletesRemaining: Math.max(0, MAX_DELETES_PER_USER - deleteCount),
            deletesUsed: deleteCount,
            upvotesRemaining: godMode ? 999 : Math.max(0, maxUpvotes - upvotes.length),
            upvotesUsed: upvotes.length,
            downvotesRemaining: godMode ? 999 : Math.max(0, maxDownvotes - downvotes.length),
            downvotesUsed: downvotes.length,
            isGodMode: godMode,
        };
    } catch (error) {
        console.error('Failed to get user status:', error);
        return {
            songsRemaining: MAX_SONGS_PER_USER,
            songsAdded: 0,
            deletesRemaining: MAX_DELETES_PER_USER,
            deletesUsed: 0,
            upvotesRemaining: MAX_UPVOTES_PER_USER,
            upvotesUsed: 0,
            downvotesRemaining: MAX_DOWNVOTES_PER_USER,
            downvotesUsed: 0,
            isGodMode: false,
        };
    }
}

// ============ LOCK/UNLOCK ============
export async function setPlaylistLocked(locked: boolean): Promise<void> {
    await redis.set(LOCKED_KEY, locked);
}

export async function isPlaylistLocked(): Promise<boolean> {
    // Check cache first (5s TTL)
    const cacheKey = 'playlist_locked';
    const cached = getCached<boolean>(cacheKey);
    if (cached !== null) return cached;

    const result = await redis.get<boolean>(LOCKED_KEY) || false;
    setCache(cacheKey, result, CACHE_TTL.LOCKED);
    return result;
}

// ============ SESSION PERMISSIONS ============
// Admin can toggle whether users can vote and/or add songs
export interface SessionPermissions {
    canVote: boolean;
    canAddSongs: boolean;
}

const DEFAULT_PERMISSIONS: SessionPermissions = {
    canVote: true,
    canAddSongs: true,
};

export async function getSessionPermissions(): Promise<SessionPermissions> {
    try {
        const permissions = await redis.get<SessionPermissions>(SESSION_PERMISSIONS_KEY);
        return permissions || DEFAULT_PERMISSIONS;
    } catch (error) {
        console.error('Failed to get session permissions:', error);
        return DEFAULT_PERMISSIONS;
    }
}

export async function setSessionPermissions(permissions: Partial<SessionPermissions>): Promise<SessionPermissions> {
    try {
        const current = await getSessionPermissions();
        const updated: SessionPermissions = {
            ...current,
            ...permissions,
        };
        await redis.set(SESSION_PERMISSIONS_KEY, updated);
        return updated;
    } catch (error) {
        console.error('Failed to set session permissions:', error);
        return DEFAULT_PERMISSIONS;
    }
}

// ============ STREAM CONFIG (YouTube + Twitch) ============
export interface StreamConfig {
    platform: 'youtube' | 'twitch' | null;
    youtubeUrl?: string;
    twitchChannel?: string;
}

export async function getStreamConfig(): Promise<StreamConfig> {
    try {
        const config = await redis.get<StreamConfig>(STREAM_CONFIG_KEY);
        if (config) return config;
        // Backward compat: check legacy YouTube key
        const legacyYt = await redis.get<string>(YOUTUBE_EMBED_KEY);
        if (legacyYt) return { platform: 'youtube', youtubeUrl: legacyYt };
        return { platform: null };
    } catch (error) {
        console.error('Failed to get stream config:', error);
        return { platform: null };
    }
}

export async function setStreamConfig(config: StreamConfig): Promise<void> {
    try {
        if (config.platform) {
            await redis.set(STREAM_CONFIG_KEY, config);
        } else {
            await redis.del(STREAM_CONFIG_KEY);
        }
        // Clear legacy key when using new config
        await redis.del(YOUTUBE_EMBED_KEY);
    } catch (error) {
        console.error('Failed to set stream config:', error);
    }
}

// Legacy compat wrappers
export async function getYouTubeEmbed(): Promise<string | null> {
    const config = await getStreamConfig();
    return config.platform === 'youtube' ? (config.youtubeUrl || null) : null;
}

export async function setYouTubeEmbed(url: string | null): Promise<void> {
    if (url) {
        await setStreamConfig({ platform: 'youtube', youtubeUrl: url });
    } else {
        await setStreamConfig({ platform: null });
    }
}

// ============ BAN FUNCTIONS ============
export async function banUser(visitorId: string): Promise<void> {
    await redis.sadd(BANNED_KEY, visitorId);
}

export async function unbanUser(visitorId: string): Promise<void> {
    await redis.srem(BANNED_KEY, visitorId);
}

export async function isUserBanned(visitorId: string): Promise<boolean> {
    const result = await redis.sismember(BANNED_KEY, visitorId);
    return result === 1;
}

// ============ TIMER FUNCTIONS ============
const DEFAULT_SESSION_DURATION = 60 * 60 * 1000; // 1 hour

export async function startTimer(durationMs?: number): Promise<void> {
    const duration = durationMs || DEFAULT_SESSION_DURATION;
    const timer: TimerData = {
        endTime: Date.now() + duration,
        duration,
        running: true,
    };
    await redis.set(TIMER_KEY, timer);
    // Auto-unlock playlist when timer starts - users can participate
    await setPlaylistLocked(false);
}

export async function stopTimer(): Promise<void> {
    const timer = await redis.get<TimerData>(TIMER_KEY);
    if (timer) {
        timer.running = false;
        timer.endTime = null;
        await redis.set(TIMER_KEY, timer);
    }
    // Auto-lock playlist when timer stops - only admin can modify
    await setPlaylistLocked(true);
}

export async function resetTimer(): Promise<void> {
    const timer = await redis.get<TimerData>(TIMER_KEY);
    const duration = timer?.duration || DEFAULT_SESSION_DURATION;

    const newTimer: TimerData = {
        endTime: Date.now() + duration,
        duration,
        running: true,
    };
    await redis.set(TIMER_KEY, newTimer);
    // Auto-unlock playlist when timer resets - users can participate
    await setPlaylistLocked(false);
}

export async function getTimerStatus(): Promise<{ endTime: number | null; running: boolean; remaining: number }> {
    // Check cache first (5s TTL) - but skip if timer might have just expired
    const cacheKey = 'timer_status';
    const cached = getCached<{ endTime: number | null; running: boolean; remaining: number }>(cacheKey);

    // Use cache if timer is stopped, or if remaining time is still valid
    if (cached && (!cached.running || (cached.endTime && cached.endTime > Date.now()))) {
        // Recalculate remaining from cached endTime
        const remaining = cached.endTime && cached.running
            ? Math.max(0, cached.endTime - Date.now())
            : 0;
        return { ...cached, remaining };
    }

    const timer = await redis.get<TimerData>(TIMER_KEY);
    if (!timer) {
        const result = { endTime: null, running: false, remaining: 0 };
        setCache(cacheKey, result, CACHE_TTL.TIMER);
        return result;
    }

    const remaining = timer.endTime && timer.running
        ? Math.max(0, timer.endTime - Date.now())
        : 0;

    // Auto-stop if time ran out
    if (timer.running && timer.endTime && Date.now() >= timer.endTime) {
        await stopTimer();
        invalidateCache(cacheKey);
        return { endTime: null, running: false, remaining: 0 };
    }

    const result = {
        endTime: timer.endTime,
        running: timer.running,
        remaining,
    };
    setCache(cacheKey, result, CACHE_TTL.TIMER);
    return result;
}

// ============ DELETE WINDOW (Chaos Mode) ============
// Admin can grant everyone ONE delete for 30 seconds

interface DeleteWindowData {
    endTime: number;
    startedBy: string;
}

// Start a new delete window (admin only)
export async function startDeleteWindow(durationSeconds: number = 30): Promise<{ success: boolean; endTime: number }> {
    const endTime = Date.now() + (durationSeconds * 1000);

    // Clear previous window's used list and set new window
    await redis.del(DELETE_WINDOW_USED_KEY);
    await redis.set(DELETE_WINDOW_KEY, { endTime, startedBy: 'admin' } as DeleteWindowData);

    console.log(`🗑️ DELETE WINDOW: Started ${durationSeconds}s window, ends at ${new Date(endTime).toISOString()}`);

    return { success: true, endTime };
}

// Get delete window status
export async function getDeleteWindowStatus(): Promise<{ active: boolean; endTime: number | null; remaining: number }> {
    const window = await redis.get<DeleteWindowData>(DELETE_WINDOW_KEY);

    if (!window) {
        return { active: false, endTime: null, remaining: 0 };
    }

    const now = Date.now();
    if (now >= window.endTime) {
        // Window expired
        return { active: false, endTime: null, remaining: 0 };
    }

    return {
        active: true,
        endTime: window.endTime,
        remaining: window.endTime - now,
    };
}

// Check if user can delete during window
export async function canUserDeleteInWindow(visitorId: string): Promise<{ canDelete: boolean; reason?: string }> {
    const windowStatus = await getDeleteWindowStatus();

    if (!windowStatus.active) {
        return { canDelete: false, reason: 'Chaos Mode is not currently active.' };
    }

    // Check if user already used their delete this window
    // God Mode users can delete multiple times!
    const godMode = await isGodMode(visitorId);
    if (!godMode) {
        const hasUsed = await redis.sismember(DELETE_WINDOW_USED_KEY, visitorId);
        if (hasUsed) {
            return { canDelete: false, reason: 'You already used your Chaos Mode delete!' };
        }
    }

    // Check if user is "active" - has added at least one song to the playlist
    const allSongs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
    const userHasSongs = Object.values(allSongs).some(song => song.addedBy === visitorId);
    if (!userHasSongs) {
        return { canDelete: false, reason: 'Add a song to participate! Only active DJs can Purge.' };
    }

    return { canDelete: true };
}

// User uses their delete during window
export async function useWindowDelete(visitorId: string, songId: string): Promise<{ success: boolean; error?: string }> {
    // Verify window is still active and user hasn't used their delete
    const canDelete = await canUserDeleteInWindow(visitorId);
    if (!canDelete.canDelete) {
        return { success: false, error: canDelete.reason };
    }

    // Check if song is in an active Versus Battle - cannot delete battling songs!
    const battleStatus = await getVersusBattleStatus();
    if (battleStatus.active && battleStatus.songA && battleStatus.songB) {
        if (songId === battleStatus.songA.id || songId === battleStatus.songB.id) {
            return { success: false, error: 'This song is in an active Versus Battle! Wait for the battle to end.' };
        }
    }

    // Mark user as having used their delete
    await redis.sadd(DELETE_WINDOW_USED_KEY, visitorId);

    // Delete the song
    const song = await redis.hget<Song>(SONGS_KEY, songId);
    if (!song) {
        return { success: false, error: 'This song was already removed from the playlist.' };
    }

    await redis.hdel(SONGS_KEY, songId);
    invalidateSongsCache();

    console.log(`🗑️ WINDOW DELETE: User ${visitorId} deleted "${song.name}"`);

    return { success: true };
}

// ============ DOUBLE POINTS ROUND ============
// Admin can trigger a 2-minute window where all votes count 2x

interface DoublePointsData {
    endTime: number;
}

// Start Double Points Round (admin only)
export async function startDoublePoints(durationSeconds: number = 120): Promise<{ success: boolean; endTime: number }> {
    const endTime = Date.now() + (durationSeconds * 1000);
    await redis.set(DOUBLE_POINTS_KEY, { endTime } as DoublePointsData);
    console.log(`⚡ DOUBLE POINTS: Started ${durationSeconds}s round, ends at ${new Date(endTime).toISOString()}`);
    return { success: true, endTime };
}

// Get Double Points status
export async function getDoublePointsStatus(): Promise<{ active: boolean; endTime: number | null; remaining: number }> {
    const data = await redis.get<DoublePointsData>(DOUBLE_POINTS_KEY);

    if (!data) {
        return { active: false, endTime: null, remaining: 0 };
    }

    const now = Date.now();
    if (now >= data.endTime) {
        return { active: false, endTime: null, remaining: 0 };
    }

    return {
        active: true,
        endTime: data.endTime,
        remaining: data.endTime - now,
    };
}

// Check if double points is currently active (for vote multiplier)
export async function isDoublePointsActive(): Promise<boolean> {
    const status = await getDoublePointsStatus();
    return status.active;
}

// ============ RESET SESSION ============
export async function resetSession(): Promise<void> {
    console.log('🗑️ WIPE SESSION: Clearing all data from Redis...');

    // First, scan and delete ALL per-song vote sets
    // These use the format: hackathon:song:{songId}:upvotes / hackathon:song:{songId}:downvotes
    // If not cleaned up, votes will persist when the same songs are reimported!
    console.log('🗑️ WIPE SESSION: Scanning for per-song vote sets...');

    let deletedVoteSets = 0;

    // Scan for UPVOTES keys
    let cursor = 0;
    do {
        const result = await redis.scan(cursor, { match: 'hackathon:song:*:upvotes', count: 100 });
        cursor = Number(result[0]);
        const keys = result[1] as string[];

        if (keys.length > 0) {
            await Promise.all(keys.map(key => redis.del(key)));
            deletedVoteSets += keys.length;
            console.log(`🗑️ WIPE SESSION: Deleted ${keys.length} upvote sets...`);
        }
    } while (cursor !== 0);

    // Scan for DOWNVOTES keys
    cursor = 0;
    do {
        const result = await redis.scan(cursor, { match: 'hackathon:song:*:downvotes', count: 100 });
        cursor = Number(result[0]);
        const keys = result[1] as string[];

        if (keys.length > 0) {
            await Promise.all(keys.map(key => redis.del(key)));
            deletedVoteSets += keys.length;
            console.log(`🗑️ WIPE SESSION: Deleted ${keys.length} downvote sets...`);
        }
    } while (cursor !== 0);

    console.log(`🗑️ WIPE SESSION: Deleted ${deletedVoteSets} total vote sets`);

    // Now delete all the standard session keys
    await Promise.all([
        // Songs & Playlist
        redis.del(SONGS_KEY),
        redis.del(PLAYLIST_TITLE_KEY),

        // User data
        redis.del(BANNED_KEY),
        redis.del(USER_SONG_COUNTS_KEY),
        redis.del(USER_DELETE_COUNTS_KEY),
        redis.del(USER_UPVOTE_KEY),
        redis.del(USER_DOWNVOTE_KEY),
        redis.del(USER_KARMA_KEY),
        redis.del(USER_LAST_ACTIVITY_KEY),
        redis.del(TOP3_KARMA_GRANTED_KEY),

        // Session state
        redis.del(LOCKED_KEY),
        redis.del(TIMER_KEY),
        redis.del(SESSION_PERMISSIONS_KEY),
        redis.del(ACTIVITY_LOG_KEY),

        // Special modes
        redis.del(DELETE_WINDOW_KEY),
        redis.del(DELETE_WINDOW_USED_KEY),
        redis.del(KARMA_RAIN_KEY),
        redis.del(DOUBLE_POINTS_KEY),

        // Versus Battle
        redis.del(VERSUS_BATTLE_KEY),
        redis.del(VERSUS_VOTES_A_KEY),
        redis.del(VERSUS_VOTES_B_KEY),
        redis.del(ELIMINATED_SONGS_KEY),

        // Admin heartbeats (reset admin presence tracking)
        redis.del(ADMIN_HEARTBEAT_KEY),

        // NOTE: We intentionally DO NOT delete VIEWER_HEARTBEAT_KEY
        // Active viewers should remain visible after a wipe - they're still on the site!
        // They just get a fresh slate for votes, songs, karma, etc.
    ]);

    // Clear in-memory cache as well
    cache.clear();

    console.log('🗑️ WIPE SESSION: Complete! All votes, users, and session data cleared.');
}

// ============ DEEP CLEANUP (for storage optimization) ============
// This cleans up orphaned vote sets and other accumulated data
export async function deepCleanup(): Promise<{ deletedKeys: number; freedBytes: string }> {
    console.log('🧹 DEEP CLEANUP: Starting comprehensive cleanup...');

    let deletedKeys = 0;

    try {
        // Get all current songs so we know which vote sets are valid
        const songs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const validSongIds = new Set(Object.keys(songs));

        // Scan for all vote set keys (hackathon:song:*:upvotes and hackathon:song:*:downvotes)
        // Note: Upstash scan uses cursor-based pagination
        let cursor = 0;
        const orphanedKeys: string[] = [];

        do {
            const result = await redis.scan(cursor, { match: 'hackathon:song:*:*votes', count: 100 });
            cursor = Number(result[0]);
            const keys = result[1] as string[];

            for (const key of keys) {
                // Extract songId from key like "hackathon:song:abc123:upvotes"
                const match = key.match(/hackathon:song:(.+):(up|down)votes/);
                if (match) {
                    const songId = match[1];
                    if (!validSongIds.has(songId)) {
                        orphanedKeys.push(key);
                    }
                }
            }
        } while (cursor !== 0);

        // Delete orphaned keys in batches
        if (orphanedKeys.length > 0) {
            console.log(`🧹 Found ${orphanedKeys.length} orphaned vote sets to clean up`);
            for (const key of orphanedKeys) {
                await redis.del(key);
                deletedKeys++;
            }
        }

        // Clean up old activity log entries (keep last 10)
        const activities = await redis.lrange(ACTIVITY_LOG_KEY, 0, -1);
        if (activities && activities.length > 10) {
            await redis.ltrim(ACTIVITY_LOG_KEY, 0, 9);
            console.log(`🧹 Trimmed activity log from ${activities.length} to 10 entries`);
        }

        // Estimate freed space (rough estimate: ~100 bytes per key)
        const freedBytes = deletedKeys > 0 ? `~${(deletedKeys * 100 / 1024).toFixed(1)} KB` : '0 KB';

        console.log(`🧹 DEEP CLEANUP: Complete! Deleted ${deletedKeys} orphaned keys`);

        return { deletedKeys, freedBytes };
    } catch (error) {
        console.error('Failed to run deep cleanup:', error);
        return { deletedKeys: 0, freedBytes: '0 KB' };
    }
}

// ============ VIEWER COUNT (heartbeat-based) ============
const VIEWER_HEARTBEAT_KEY = 'hackathon:viewerHeartbeats';
const VIEWER_TTL_SECONDS = 30; // Consider viewer active if heartbeat within 30s

export async function updateViewerHeartbeat(visitorId: string): Promise<void> {
    try {
        await redis.hset(VIEWER_HEARTBEAT_KEY, { [visitorId]: Date.now() });
    } catch (error) {
        console.error('Failed to update viewer heartbeat:', error);
    }
}

export async function getActiveViewerCount(): Promise<number> {
    // Check cache first (10s TTL - viewer count doesn't need to be super precise)
    const cacheKey = 'viewer_count';
    const cached = getCached<number>(cacheKey);
    if (cached !== null) return cached;

    try {
        const heartbeats = await redis.hgetall<Record<string, number>>(VIEWER_HEARTBEAT_KEY) || {};
        const now = Date.now();
        const activeThreshold = now - (VIEWER_TTL_SECONDS * 1000);

        let activeCount = 0;
        const staleViewers: string[] = [];

        for (const [visitorId, lastSeen] of Object.entries(heartbeats)) {
            if (lastSeen >= activeThreshold) {
                activeCount++;
            } else {
                staleViewers.push(visitorId);
            }
        }

        // Clean up stale heartbeats lazily (only if there are many)
        // This prevents cleanup from running on every request
        if (staleViewers.length > 50) {
            // Background cleanup - don't await
            Promise.all(staleViewers.slice(0, 20).map(id => redis.hdel(VIEWER_HEARTBEAT_KEY, id)))
                .catch(console.error);
        }

        setCache(cacheKey, activeCount, CACHE_TTL.VIEWER_COUNT);
        return activeCount;
    } catch (error) {
        console.error('Failed to get viewer count:', error);
        return 0;
    }
}

// ============ ACTIVE USERS ============
// Track when user was last active
export async function updateUserActivity(visitorId: string): Promise<void> {
    try {
        await redis.hset(USER_LAST_ACTIVITY_KEY, { [visitorId]: Date.now() });
    } catch (error) {
        console.error('Failed to update user activity:', error);
    }
}

export async function getActiveUsers(): Promise<{ visitorId: string; username: string; songCount: number; lastActivity: number }[]> {
    try {
        const [counts, songs, lastActivityMap] = await Promise.all([
            redis.hgetall<Record<string, number>>(USER_SONG_COUNTS_KEY) || {},
            redis.hgetall<Record<string, Song>>(SONGS_KEY) || {},
            redis.hgetall<Record<string, number>>(USER_LAST_ACTIVITY_KEY) || {},
        ]);

        // Build a map of visitorId -> username from their songs
        const usernameMap: Record<string, string> = {};
        for (const song of Object.values(songs || {})) {
            if (song.addedBy && song.addedByName) {
                usernameMap[song.addedBy] = song.addedByName;
            }
        }

        return Object.entries(counts || {})
            .filter(([_, count]) => count > 0)
            .map(([visitorId, songCount]) => ({
                visitorId,
                username: usernameMap[visitorId] || 'Anonymous',
                songCount,
                lastActivity: (lastActivityMap as Record<string, number>)?.[visitorId] || 0,
            }))
            // Sort by most recent activity first
            .sort((a, b) => b.lastActivity - a.lastActivity);
    } catch (error) {
        console.error('Failed to get active users:', error);
        return [];
    }
}


// ============ BAN USER AND DELETE THEIR SONGS ============
export async function banUserAndDeleteSongs(visitorId: string): Promise<{ deletedSongCount: number }> {
    try {
        // Ban the user
        await redis.sadd(BANNED_KEY, visitorId);

        // Find and delete all their songs
        const songs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const songsToDelete = Object.entries(songs)
            .filter(([_, song]) => song.addedBy === visitorId)
            .map(([id]) => id);

        if (songsToDelete.length > 0) {
            await redis.hdel(SONGS_KEY, ...songsToDelete);
        }

        // Reset their song count
        await redis.hdel(USER_SONG_COUNTS_KEY, visitorId);
        await redis.hdel(USER_DELETE_COUNTS_KEY, visitorId);
        await redis.hdel(USER_UPVOTE_KEY, visitorId);
        await redis.hdel(USER_DOWNVOTE_KEY, visitorId);

        return { deletedSongCount: songsToDelete.length };
    } catch (error) {
        console.error('Failed to ban user:', error);
        return { deletedSongCount: 0 };
    }
}

// ============ PROFANITY FILTER ============
const EXPLICIT_WORDS = new Set([
    // Common profanity - add more as needed
    'fuck', 'fucking', 'fucked', 'fucker', 'fucks',
    'shit', 'shitting', 'shitty',
    'bitch', 'bitches',
    'ass', 'asshole', 'asses',
    'damn', 'damned',
    'cunt', 'cunts',
    'dick', 'dicks',
    'cock', 'cocks',
    'pussy', 'pussies',
    'whore', 'whores',
    'slut', 'sluts',
    'nigga', 'nigger', 'niggas',
    'faggot', 'fag', 'fags',
    'retard', 'retarded',
    'bastard', 'bastards',
]);

export function containsProfanity(text: string): boolean {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
    for (const word of words) {
        if (EXPLICIT_WORDS.has(word)) {
            return true;
        }
    }
    return false;
}

// Censor profanity in text for display (keeps first letter, replaces rest with ***)
export function censorProfanity(text: string): string {
    let result = text;
    for (const word of Array.from(EXPLICIT_WORDS)) {
        // Create regex that matches the word case-insensitively as a whole word
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        result = result.replace(regex, (match) => {
            if (match.length <= 1) return '*';
            return match[0] + '*'.repeat(match.length - 1);
        });
    }
    return result;
}

// ============ STATS ============
export async function getStats(): Promise<{ totalSongs: number; totalVotes: number; uniqueVoters: number }> {
    try {
        const songs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};
        const songsList = Object.values(songs);

        // Fetch votes for all songs using atomic Redis Sets
        const votePromises = songsList.map(song => getSongVotes(song.id));
        const allVotes = await Promise.all(votePromises);

        const voters = new Set<string>();
        let totalVotes = 0;

        for (const votes of allVotes) {
            totalVotes += votes.upvotes.length + votes.downvotes.length;
            votes.upvotes.forEach(v => voters.add(v));
            votes.downvotes.forEach(v => voters.add(v));
        }

        return {
            totalSongs: songsList.length,
            totalVotes,
            uniqueVoters: voters.size,
        };
    } catch (error) {
        console.error('Failed to get stats:', error);
        return { totalSongs: 0, totalVotes: 0, uniqueVoters: 0 };
    }
}

// ============ ADMIN HEARTBEAT ============
const ADMIN_HEARTBEAT_TTL = 15000; // 15 seconds - admin is considered offline after this

export async function adminHeartbeat(adminId: string): Promise<void> {
    try {
        await redis.hset(ADMIN_HEARTBEAT_KEY, { [adminId]: Date.now() });
    } catch (error) {
        console.error('Failed to update admin heartbeat:', error);
    }
}

export async function getActiveAdminCount(): Promise<number> {
    try {
        const heartbeats = await redis.hgetall<Record<string, number>>(ADMIN_HEARTBEAT_KEY) || {};
        const now = Date.now();
        let activeCount = 0;
        const expiredAdmins: string[] = [];

        for (const [adminId, timestamp] of Object.entries(heartbeats)) {
            if (now - timestamp < ADMIN_HEARTBEAT_TTL) {
                activeCount++;
            } else {
                expiredAdmins.push(adminId);
            }
        }

        // Clean up expired admins
        if (expiredAdmins.length > 0) {
            await redis.hdel(ADMIN_HEARTBEAT_KEY, ...expiredAdmins);
        }

        return activeCount;
    } catch (error) {
        console.error('Failed to get active admin count:', error);
        return 0;
    }
}

// ============ PLAYLIST TITLE ============
export async function getPlaylistTitle(): Promise<string> {
    try {
        const title = await redis.get<string>(PLAYLIST_TITLE_KEY);
        return title || 'Hackathon Playlist';
    } catch (error) {
        console.error('Failed to get playlist title:', error);
        return 'Hackathon Playlist';
    }
}

export async function setPlaylistTitle(title: string): Promise<void> {
    try {
        await redis.set(PLAYLIST_TITLE_KEY, title);
    } catch (error) {
        console.error('Failed to set playlist title:', error);
    }
}

// ============ LIVE ACTIVITY LOG ============
export interface ActivityItem {
    id: string;
    type: 'add' | 'upvote' | 'downvote';
    userName: string;
    visitorId: string;  // Added for admin quick-ban feature
    songName: string;
    userLocation?: string;  // Location display string (e.g., "Austin, TX")
    timestamp: number;
}

const MAX_ACTIVITY_ITEMS = 100; // Keep 100 items for full session history
const ACTIVITY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - keep activities for full session

export async function addActivity(activity: Omit<ActivityItem, 'id' | 'timestamp'>): Promise<void> {
    try {
        const item: ActivityItem = {
            ...activity,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            timestamp: Date.now(),
        };

        // Push to list (newest first)
        await redis.lpush(ACTIVITY_LOG_KEY, JSON.stringify(item));
        // Trim to max items
        await redis.ltrim(ACTIVITY_LOG_KEY, 0, MAX_ACTIVITY_ITEMS - 1);
    } catch (error) {
        console.error('Failed to add activity:', error);
    }
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
    try {
        const items = await redis.lrange(ACTIVITY_LOG_KEY, 0, MAX_ACTIVITY_ITEMS - 1);
        const now = Date.now();

        return items
            .map(item => typeof item === 'string' ? JSON.parse(item) : item)
            .filter(item => now - item.timestamp < ACTIVITY_TTL_MS);
    } catch (error) {
        console.error('Failed to get activity:', error);
        return [];
    }
}

// Remove a specific activity by ID and optionally delete associated data
export async function removeActivity(activityId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const items = await redis.lrange(ACTIVITY_LOG_KEY, 0, MAX_ACTIVITY_ITEMS - 1);

        // Find and remove the activity
        let foundActivity: ActivityItem | null = null;
        const updatedItems: string[] = [];

        for (const item of items) {
            const parsed: ActivityItem = typeof item === 'string' ? JSON.parse(item) : item;
            if (parsed.id === activityId) {
                foundActivity = parsed;
            } else {
                updatedItems.push(typeof item === 'string' ? item : JSON.stringify(item));
            }
        }

        if (!foundActivity) {
            return { success: false, error: 'This activity has already been removed.' };
        }

        // Clear the list and repopulate without the deleted activity
        await redis.del(ACTIVITY_LOG_KEY);
        if (updatedItems.length > 0) {
            await redis.rpush(ACTIVITY_LOG_KEY, ...updatedItems);
        }

        return { success: true };
    } catch (error) {
        console.error('Failed to remove activity:', error);
        return { success: false, error: 'Could not remove activity. Please try again.' };
    }
}

// Clear all activities from a specific user (used when banning)
export async function removeUserActivities(visitorId: string): Promise<void> {
    try {
        const items = await redis.lrange(ACTIVITY_LOG_KEY, 0, MAX_ACTIVITY_ITEMS - 1);

        const filteredItems = items.filter(item => {
            const parsed: ActivityItem = typeof item === 'string' ? JSON.parse(item) : item;
            return parsed.visitorId !== visitorId;
        });

        await redis.del(ACTIVITY_LOG_KEY);
        if (filteredItems.length > 0) {
            const serialized = filteredItems.map(i => typeof i === 'string' ? i : JSON.stringify(i));
            await redis.rpush(ACTIVITY_LOG_KEY, ...serialized);
        }
    } catch (error) {
        console.error('Failed to remove user activities:', error);
    }
}

// ============ KARMA SYSTEM ============
// Karma bonuses:
// - Each karma point = +1 extra vote (can upvote OR downvote additional songs)
// - 3+ karma = +1 extra song add
// - 5+ karma = +2 extra song adds

export async function getUserKarma(visitorId: string): Promise<number> {
    try {
        const karma = await redis.hget<number>(USER_KARMA_KEY, visitorId);
        return karma || 0;
    } catch (error) {
        console.error('Failed to get karma:', error);
        return 0;
    }
}

// Maximum karma a user can have - hard cap
const MAX_KARMA = 10;

export async function addKarma(visitorId: string, points: number = 1): Promise<number> {
    try {
        // Get current karma first to enforce cap
        const currentKarma = await getUserKarma(visitorId);

        // If already at max, don't add more
        if (currentKarma >= MAX_KARMA) {
            console.log(`User ${visitorId} already at max karma (${MAX_KARMA}), skipping add`);
            return currentKarma;
        }

        // Calculate how much we can actually add without exceeding cap
        const pointsToAdd = Math.min(points, MAX_KARMA - currentKarma);

        if (pointsToAdd <= 0) {
            return currentKarma;
        }

        const newKarma = await redis.hincrby(USER_KARMA_KEY, visitorId, pointsToAdd);

        // Safety check - if somehow over cap, reset to cap
        if (newKarma > MAX_KARMA) {
            await redis.hset(USER_KARMA_KEY, { [visitorId]: MAX_KARMA });
            return MAX_KARMA;
        }

        return newKarma;
    } catch (error) {
        console.error('Failed to add karma:', error);
        return 0;
    }
}

export interface KarmaBonuses {
    karma: number;
    bonusVotes: number;      // Extra upvotes AND downvotes (same value for both)
    bonusSongAdds: number;   // Extra songs can add
}

// SIMPLIFIED KARMA SYSTEM:
// Base: 5 songs, 5 upvotes, 5 downvotes
// Karma bonus: Each 1 karma = +1 song, +1 upvote, +1 downvote
// CAPPED at 5 bonus (max 10 total) to prevent excessive accumulation
const MAX_KARMA_BONUS = 5; // Base 5 + 5 bonus = 10 max

export function calculateKarmaBonuses(karma: number): KarmaBonuses {
    const cappedBonus = Math.min(karma, MAX_KARMA_BONUS);
    return {
        karma,                    // Show actual karma for display
        bonusVotes: cappedBonus,  // 1 karma = +1 upvote AND +1 downvote (capped)
        bonusSongAdds: cappedBonus, // 1 karma = +1 song add (capped)
    };
}

const USER_LAST_PRESENCE_GRANT_KEY = 'hackathon:userLastPresenceGrant';

export async function getKarmaBonuses(visitorId: string): Promise<KarmaBonuses> {
    const karma = await getUserKarma(visitorId);
    return calculateKarmaBonuses(karma);
}

// Grant karma for staying on page > 5 mins (rate limited to once per 15 mins)
export async function grantPresenceKarma(visitorId: string): Promise<{ success: boolean; karma: number; error?: string }> {
    try {
        const lastGrant = await redis.hget<number>(USER_LAST_PRESENCE_GRANT_KEY, visitorId);
        const now = Date.now();
        const cooldown = 15 * 60 * 1000; // 15 minutes

        if (lastGrant && now - lastGrant < cooldown) {
            return { success: false, karma: await getUserKarma(visitorId), error: 'Karma cooldown active. Wait a bit longer!' };
        }

        // Grant 1 karma
        const newKarma = await addKarma(visitorId, 1);
        await redis.hset(USER_LAST_PRESENCE_GRANT_KEY, { [visitorId]: now });

        console.log(`Granted +1 presence karma to ${visitorId}`);
        return { success: true, karma: newKarma };
    } catch (error) {
        console.error('Failed to grant presence karma:', error);
        return { success: false, karma: 0, error: 'Could not grant karma. Please try again later.' };
    }
}

// Check top 3 songs and grant karma to their owners (called periodically)
const TOP3_KARMA_REWARD = 5;

export async function checkAndGrantTop3Karma(): Promise<{ rewarded: string[] }> {
    try {
        const songs = await getSortedSongs();
        const top3 = songs.slice(0, 3);
        const rewarded: string[] = [];

        // Get set of songs that already granted karma
        const alreadyGranted = await redis.smembers(TOP3_KARMA_GRANTED_KEY) || [];
        const grantedSet = new Set(alreadyGranted);

        for (const song of top3) {
            // Skip if this song already gave karma
            if (grantedSet.has(song.id)) continue;

            // Skip if no addedBy (shouldn't happen)
            if (!song.addedBy) continue;

            // Grant karma to the song owner
            await addKarma(song.addedBy, TOP3_KARMA_REWARD);

            // Mark as granted
            await redis.sadd(TOP3_KARMA_GRANTED_KEY, song.id);

            rewarded.push(`${song.name} by ${song.addedByName || 'Anonymous'} → +${TOP3_KARMA_REWARD} karma!`);
            console.log(`Granted ${TOP3_KARMA_REWARD} karma to ${song.addedBy} for top 3 song: ${song.name}`);
        }

        return { rewarded };
    } catch (error) {
        console.error('Failed to check top 3 karma:', error);
        return { rewarded: [] };
    }
}

// ============ VERSUS BATTLE (1s and 0s) ============
// Head-to-head song battles - one song stays, one gets eliminated

interface VersusBattleSong {
    id: string;
    name: string;
    artist: string;
    albumArt: string;
}

interface VersusBattleData {
    endTime: number;
    songA: VersusBattleSong;
    songB: VersusBattleSong;
    phase: 'voting' | 'lightning' | 'resolved';
    isLightningRound: boolean;
    winner?: 'A' | 'B' | null;
    startedBy: string;
}

export interface VersusBattleStatus {
    active: boolean;
    songA?: VersusBattleSong;
    songB?: VersusBattleSong;
    endTime?: number;
    remaining?: number;
    phase?: 'voting' | 'lightning' | 'resolved';
    isLightningRound?: boolean;
    votesA?: number;  // Only included for admin or after battle ends
    votesB?: number;
    winner?: 'A' | 'B' | null;
    userVote?: 'A' | 'B' | null;  // Which song the current user voted for
}

// Check if a song has been eliminated (can't be re-added)
export async function isSongEliminated(spotifyId: string): Promise<boolean> {
    try {
        const result = await redis.sismember(ELIMINATED_SONGS_KEY, spotifyId);
        return result === 1;
    } catch (error) {
        console.error('Failed to check eliminated song:', error);
        return false;
    }
}

// Get eligible songs for battle: score > 0, NOT in top 3
async function getEligibleBattleSongs(): Promise<(Song & { score: number })[]> {
    const songs = await getSortedSongs();  // Already sorted by score desc

    // Skip top 3, then filter for score > 0
    return songs.slice(3).filter(s => s.score > 0);
}

// Start a new versus battle
export async function startVersusBattle(): Promise<{
    success: boolean;
    error?: string;
    songA?: VersusBattleSong;
    songB?: VersusBattleSong;
    endTime?: number;
}> {
    try {
        // Check if battle already active
        const existingBattle = await redis.get<VersusBattleData>(VERSUS_BATTLE_KEY);
        if (existingBattle && existingBattle.phase !== 'resolved' && Date.now() < existingBattle.endTime) {
            return { success: false, error: 'A battle is already running! Wait for it to finish first.' };
        }

        // Get eligible songs
        const eligible = await getEligibleBattleSongs();

        if (eligible.length < 2) {
            return {
                success: false,
                error: `Need at least 2 eligible songs with positive scores (not in top 3). Currently only ${eligible.length} available.`
            };
        }

        // Randomly select 2 different songs
        const shuffled = [...eligible].sort(() => Math.random() - 0.5);
        const songA = shuffled[0];
        const songB = shuffled[1];

        const endTime = Date.now() + 30000; // 30 seconds

        const battleData: VersusBattleData = {
            endTime,
            songA: { id: songA.id, name: songA.name, artist: songA.artist, albumArt: songA.albumArt },
            songB: { id: songB.id, name: songB.name, artist: songB.artist, albumArt: songB.albumArt },
            phase: 'voting',
            isLightningRound: false,
            startedBy: 'admin',
        };

        // Clear previous votes and set new battle
        await Promise.all([
            redis.del(VERSUS_VOTES_A_KEY),
            redis.del(VERSUS_VOTES_B_KEY),
            redis.set(VERSUS_BATTLE_KEY, battleData),
        ]);

        console.log(`⚔️ VERSUS BATTLE: Started! "${songA.name}" vs "${songB.name}" - 30 seconds`);

        return {
            success: true,
            songA: battleData.songA,
            songB: battleData.songB,
            endTime,
        };
    } catch (error) {
        console.error('Failed to start versus battle:', error);
        return { success: false, error: 'Could not start battle. Please try again.' };
    }
}

// Get current battle status
export async function getVersusBattleStatus(
    visitorId?: string,
    includeVoteCounts: boolean = false
): Promise<VersusBattleStatus> {
    try {
        const battle = await redis.get<VersusBattleData>(VERSUS_BATTLE_KEY);

        if (!battle) {
            return { active: false };
        }

        const now = Date.now();
        const remaining = Math.max(0, battle.endTime - now);
        const isExpired = now >= battle.endTime;

        // If expired and not resolved, it's inactive
        if (isExpired && battle.phase !== 'resolved') {
            return { active: false };
        }

        // Check if user has voted
        let userVote: 'A' | 'B' | null = null;
        if (visitorId) {
            const [votedA, votedB] = await Promise.all([
                redis.sismember(VERSUS_VOTES_A_KEY, visitorId),
                redis.sismember(VERSUS_VOTES_B_KEY, visitorId),
            ]);
            if (votedA) userVote = 'A';
            else if (votedB) userVote = 'B';
        }

        const status: VersusBattleStatus = {
            active: !isExpired || battle.phase === 'resolved',
            songA: battle.songA,
            songB: battle.songB,
            endTime: battle.endTime,
            remaining,
            phase: battle.phase,
            isLightningRound: battle.isLightningRound,
            winner: battle.winner,
            userVote,
        };

        // Include vote counts for admin or after battle ends
        if (includeVoteCounts || battle.phase === 'resolved') {
            const [votesA, votesB] = await Promise.all([
                redis.scard(VERSUS_VOTES_A_KEY),
                redis.scard(VERSUS_VOTES_B_KEY),
            ]);
            status.votesA = votesA;
            status.votesB = votesB;
        }

        return status;
    } catch (error) {
        console.error('Failed to get versus battle status:', error);
        return { active: false };
    }
}

// User votes in the battle (one and done)
export async function voteInVersusBattle(
    visitorId: string,
    choice: 'A' | 'B'
): Promise<{ success: boolean; error?: string }> {
    try {
        const battle = await redis.get<VersusBattleData>(VERSUS_BATTLE_KEY);

        if (!battle) {
            return { success: false, error: 'No battle is currently running.' };
        }

        if (Date.now() >= battle.endTime) {
            return { success: false, error: 'This battle has ended. Wait for the results!' };
        }

        if (battle.phase === 'resolved') {
            return { success: false, error: 'This battle is over. Wait for the next one!' };
        }

        // Check if user already voted (one and done - cannot change)
        const [alreadyVotedA, alreadyVotedB] = await Promise.all([
            redis.sismember(VERSUS_VOTES_A_KEY, visitorId),
            redis.sismember(VERSUS_VOTES_B_KEY, visitorId),
        ]);

        if (alreadyVotedA || alreadyVotedB) {
            return { success: false, error: 'You already voted in this battle! One vote per battle.' };
        }

        // Cast vote
        if (choice === 'A') {
            await redis.sadd(VERSUS_VOTES_A_KEY, visitorId);
        } else {
            await redis.sadd(VERSUS_VOTES_B_KEY, visitorId);
        }

        console.log(`⚔️ VERSUS VOTE: User ${visitorId.slice(0, 8)}... voted for Song ${choice}`);

        return { success: true };
    } catch (error) {
        console.error('Failed to vote in versus battle:', error);
        return { success: false, error: 'Could not record your vote. Please try again quickly!' };
    }
}

// Resolve the battle (called when timer ends or admin overrides)
export async function resolveVersusBattle(
    adminOverride?: 'A' | 'B'
): Promise<{
    success: boolean;
    error?: string;
    winner?: 'A' | 'B';
    loser?: 'A' | 'B';
    deletedSongId?: string;
    deletedSongName?: string;
    isTie?: boolean;
    votesA?: number;
    votesB?: number;
}> {
    try {
        const battle = await redis.get<VersusBattleData>(VERSUS_BATTLE_KEY);

        if (!battle) {
            return { success: false, error: 'No battle to resolve. Start a new one first.' };
        }

        if (battle.phase === 'resolved') {
            return { success: false, error: 'This battle was already resolved.' };
        }

        // Get vote counts
        const [votesA, votesB] = await Promise.all([
            redis.scard(VERSUS_VOTES_A_KEY),
            redis.scard(VERSUS_VOTES_B_KEY),
        ]);

        let winner: 'A' | 'B';

        if (adminOverride) {
            // Admin override - their choice wins
            winner = adminOverride;
            console.log(`⚔️ VERSUS BATTLE: Admin override! Song ${winner} wins by decree.`);
        } else if (votesA === votesB) {
            // TIE! Trigger lightning round if not already in one
            if (!battle.isLightningRound) {
                console.log(`⚔️ VERSUS BATTLE: TIE! ${votesA} vs ${votesB} - Starting lightning round!`);
                return {
                    success: true,
                    isTie: true,
                    votesA,
                    votesB
                };
            }
            // Already in lightning round and still tied - admin must decide
            // For now, song A wins by default (first position advantage)
            winner = 'A';
            console.log(`⚔️ VERSUS BATTLE: Lightning round tie! Song A wins by position.`);
        } else {
            winner = votesA > votesB ? 'A' : 'B';
        }

        const loser: 'A' | 'B' = winner === 'A' ? 'B' : 'A';
        const loserSong = winner === 'A' ? battle.songB : battle.songA;
        const winnerSong = winner === 'A' ? battle.songA : battle.songB;

        // Delete the losing song
        await adminDeleteSong(loserSong.id);

        // Add to eliminated songs list (prevents re-adding)
        await redis.sadd(ELIMINATED_SONGS_KEY, loserSong.id);

        // Mark battle as resolved
        battle.phase = 'resolved';
        battle.winner = winner;
        await redis.set(VERSUS_BATTLE_KEY, battle);

        // Invalidate songs cache
        invalidateSongsCache();

        console.log(`⚔️ VERSUS BATTLE RESOLVED: "${winnerSong.name}" WINS! "${loserSong.name}" ELIMINATED!`);
        console.log(`   Final votes: A=${votesA}, B=${votesB}`);

        return {
            success: true,
            winner,
            loser,
            deletedSongId: loserSong.id,
            deletedSongName: loserSong.name,
            votesA,
            votesB,
        };
    } catch (error) {
        console.error('Failed to resolve versus battle:', error);
        return { success: false, error: 'Could not resolve battle. Please try again.' };
    }
}

// Start lightning round (15 seconds, fresh votes)
export async function startLightningRound(): Promise<{
    success: boolean;
    error?: string;
    endTime?: number;
}> {
    try {
        const battle = await redis.get<VersusBattleData>(VERSUS_BATTLE_KEY);

        if (!battle) {
            return { success: false, error: 'No active battle to continue.' };
        }

        if (battle.phase === 'resolved') {
            return { success: false, error: 'This battle is already over. Start a new one!' };
        }

        // Clear previous votes for fresh lightning round
        await Promise.all([
            redis.del(VERSUS_VOTES_A_KEY),
            redis.del(VERSUS_VOTES_B_KEY),
        ]);

        // Update battle state
        const endTime = Date.now() + 15000; // 15 seconds
        battle.endTime = endTime;
        battle.phase = 'lightning';
        battle.isLightningRound = true;
        await redis.set(VERSUS_BATTLE_KEY, battle);

        console.log(`⚡ LIGHTNING ROUND: 15 seconds! "${battle.songA.name}" vs "${battle.songB.name}"`);

        return { success: true, endTime };
    } catch (error) {
        console.error('Failed to start lightning round:', error);
        return { success: false, error: 'Could not start lightning round. Please try again.' };
    }
}

// Cancel an active battle (admin only)
export async function cancelVersusBattle(): Promise<{ success: boolean }> {
    try {
        await Promise.all([
            redis.del(VERSUS_BATTLE_KEY),
            redis.del(VERSUS_VOTES_A_KEY),
            redis.del(VERSUS_VOTES_B_KEY),
        ]);
        console.log('⚔️ VERSUS BATTLE: Cancelled by admin');
        return { success: true };
    } catch (error) {
        console.error('Failed to cancel versus battle:', error);
        return { success: false };
    }
}

// Clear eliminated songs list (part of session reset)
export async function clearEliminatedSongs(): Promise<void> {
    await redis.del(ELIMINATED_SONGS_KEY);
}

// ============ KARMA RAIN - Give all active users +1 karma ============
export async function karmaRain(): Promise<{ count: number; timestamp: number }> {
    try {
        const timestamp = Date.now();

        // Get all users who have karma (meaning they've been active)
        const karmaMap = await redis.hgetall<Record<string, number>>(USER_KARMA_KEY) || {};
        const userIds = Object.keys(karmaMap);

        if (userIds.length === 0) {
            // If no one has karma yet, check song counts to find active users
            const songCounts = await redis.hgetall<Record<string, number>>(USER_SONG_COUNTS_KEY) || {};
            const songUserIds = Object.keys(songCounts).filter(id => (songCounts[id] || 0) > 0);

            // Give each active user +1 karma
            for (const userId of songUserIds) {
                await addKarma(userId, 1);
            }

            // Store when rain happened (expires in 30 seconds)
            await redis.set(KARMA_RAIN_KEY, { timestamp, count: songUserIds.length }, { ex: 30 });

            console.log(`🌧️ KARMA RAIN: Gave +1 karma to ${songUserIds.length} users (from song counts)`);
            return { count: songUserIds.length, timestamp };
        }

        // Give everyone in the karma map +1 karma
        for (const userId of userIds) {
            await addKarma(userId, 1);
        }

        // Store when rain happened (expires in 30 seconds)
        await redis.set(KARMA_RAIN_KEY, { timestamp, count: userIds.length }, { ex: 30 });

        console.log(`🌧️ KARMA RAIN: Gave +1 karma to ${userIds.length} users!`);
        return { count: userIds.length, timestamp };
    } catch (error) {
        console.error('Failed to rain karma:', error);
        return { count: 0, timestamp: 0 };
    }
}

// Get karma rain status (for client to detect if rain happened recently)
export async function getKarmaRainStatus(): Promise<{ active: boolean; timestamp: number; count: number }> {
    try {
        const data = await redis.get<{ timestamp: number; count: number }>(KARMA_RAIN_KEY);
        if (!data) return { active: false, timestamp: 0, count: 0 };
        return { active: true, timestamp: data.timestamp, count: data.count };
    } catch (error) {
        console.error('Failed to get karma rain status:', error);
        return { active: false, timestamp: 0, count: 0 };
    }
}

// ============ QUICK REACTIONS ============
// Allow users to react to songs with emojis (🔥 💀 😂 ❤️) - doesn't affect score

const REACTION_TYPES = ['fire', 'skull', 'laugh', 'heart'] as const;
type ReactionType = typeof REACTION_TYPES[number];

function getSongReactionsKey(songId: string, reactionType: ReactionType): string {
    return `hackathon:song:${songId}:reactions:${reactionType}`;
}

// Add a reaction to a song (user can only have one reaction per song)
export async function addReaction(
    songId: string,
    visitorId: string,
    reactionType: ReactionType
): Promise<{ success: boolean; counts: Record<ReactionType, number> }> {
    try {
        // Remove any existing reaction from this user on this song
        for (const type of REACTION_TYPES) {
            await redis.srem(getSongReactionsKey(songId, type), visitorId);
        }

        // Add the new reaction
        await redis.sadd(getSongReactionsKey(songId, reactionType), visitorId);

        // Get updated counts
        const counts = await getReactionCounts(songId);
        return { success: true, counts };
    } catch (error) {
        console.error('Failed to add reaction:', error);
        return { success: false, counts: { fire: 0, skull: 0, laugh: 0, heart: 0 } };
    }
}

// Remove a reaction
export async function removeReaction(
    songId: string,
    visitorId: string,
    reactionType: ReactionType
): Promise<{ success: boolean; counts: Record<ReactionType, number> }> {
    try {
        await redis.srem(getSongReactionsKey(songId, reactionType), visitorId);
        const counts = await getReactionCounts(songId);
        return { success: true, counts };
    } catch (error) {
        console.error('Failed to remove reaction:', error);
        return { success: false, counts: { fire: 0, skull: 0, laugh: 0, heart: 0 } };
    }
}

// Get reaction counts for a song
export async function getReactionCounts(songId: string): Promise<Record<ReactionType, number>> {
    try {
        const counts = await Promise.all(
            REACTION_TYPES.map(async (type) => {
                const count = await redis.scard(getSongReactionsKey(songId, type));
                return [type, count] as [ReactionType, number];
            })
        );
        return Object.fromEntries(counts) as Record<ReactionType, number>;
    } catch (error) {
        console.error('Failed to get reaction counts:', error);
        return { fire: 0, skull: 0, laugh: 0, heart: 0 };
    }
}

// Get user's reaction on a song
export async function getUserReaction(songId: string, visitorId: string): Promise<ReactionType | null> {
    try {
        for (const type of REACTION_TYPES) {
            const hasReaction = await redis.sismember(getSongReactionsKey(songId, type), visitorId);
            if (hasReaction) return type;
        }
        return null;
    } catch (error) {
        console.error('Failed to get user reaction:', error);
        return null;
    }
}

// Get all reactions for multiple songs (batch for efficiency)
export async function getBatchReactionCounts(songIds: string[]): Promise<Record<string, Record<ReactionType, number>>> {
    try {
        const results: Record<string, Record<ReactionType, number>> = {};

        await Promise.all(songIds.map(async (songId) => {
            results[songId] = await getReactionCounts(songId);
        }));

        return results;
    } catch (error) {
        console.error('Failed to get batch reaction counts:', error);
        return {};
    }
}

// ============ PREDICTIONS GAME ============
// Users can predict which song will be #1 at the end

const PREDICTIONS_KEY = 'hackathon:predictions';  // Hash: visitorId -> songId
const PREDICTIONS_LOCKED_KEY = 'hackathon:predictionsLocked';

// Make a prediction
export async function makePrediction(visitorId: string, songId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const isLocked = await redis.get<boolean>(PREDICTIONS_LOCKED_KEY);
        if (isLocked) {
            return { success: false, error: 'Predictions are locked! The reveal is coming soon.' };
        }

        await redis.hset(PREDICTIONS_KEY, { [visitorId]: songId });
        return { success: true };
    } catch (error) {
        console.error('Failed to make prediction:', error);
        return { success: false, error: 'Could not save prediction. Please try again.' };
    }
}

// Get user's prediction
export async function getUserPrediction(visitorId: string): Promise<string | null> {
    try {
        return await redis.hget<string>(PREDICTIONS_KEY, visitorId);
    } catch (error) {
        console.error('Failed to get user prediction:', error);
        return null;
    }
}

// Lock predictions (admin action before reveal)
export async function lockPredictions(): Promise<void> {
    await redis.set(PREDICTIONS_LOCKED_KEY, true);
}

// Unlock predictions
export async function unlockPredictions(): Promise<void> {
    await redis.del(PREDICTIONS_LOCKED_KEY);
}

// Check if predictions are locked
export async function arePredictionsLocked(): Promise<boolean> {
    return await redis.get<boolean>(PREDICTIONS_LOCKED_KEY) || false;
}

// Get prediction stats
export async function getPredictionStats(): Promise<{ total: number; bySong: Record<string, number> }> {
    try {
        const predictions = await redis.hgetall<Record<string, string>>(PREDICTIONS_KEY) || {};
        const bySong: Record<string, number> = {};

        for (const songId of Object.values(predictions)) {
            bySong[songId] = (bySong[songId] || 0) + 1;
        }

        return { total: Object.keys(predictions).length, bySong };
    } catch (error) {
        console.error('Failed to get prediction stats:', error);
        return { total: 0, bySong: {} };
    }
}

// Reveal predictions and award karma to winners
export async function revealPredictions(winningSongId: string): Promise<{ winners: number; losers: number }> {
    try {
        const predictions = await redis.hgetall<Record<string, string>>(PREDICTIONS_KEY) || {};
        let winners = 0;
        let losers = 0;

        for (const [visitorId, songId] of Object.entries(predictions)) {
            if (songId === winningSongId) {
                // Winner! Award bonus karma
                await addKarma(visitorId, 3);
                winners++;
            } else {
                losers++;
            }
        }

        return { winners, losers };
    } catch (error) {
        console.error('Failed to reveal predictions:', error);
        return { winners: 0, losers: 0 };
    }
}

// Clear predictions for new session
export async function clearPredictions(): Promise<void> {
    await redis.del(PREDICTIONS_KEY);
    await redis.del(PREDICTIONS_LOCKED_KEY);
}

// ============ LEADERBOARD ============
// Track and display top contributors

export interface LeaderboardEntry {
    visitorId: string;
    username: string;
    score: number;  // Sum of upvotes received on their songs
    songsInTop10: number;
    hasTopSong: boolean;  // Currently has the #1 song
}

// Calculate leaderboard from current songs
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
        const songs = await getSortedSongs();
        const userScores: Record<string, { score: number; songsInTop10: number; hasTopSong: boolean; username: string }> = {};

        songs.forEach((song, index) => {
            const rank = index + 1;
            const userId = song.addedBy;

            if (!userScores[userId]) {
                userScores[userId] = {
                    score: 0,
                    songsInTop10: 0,
                    hasTopSong: false,
                    username: song.addedByName || 'Anonymous',
                };
            }

            // Add song score to user's total
            userScores[userId].score += Math.max(0, song.score);

            // Track top 10 songs
            if (rank <= 10) {
                userScores[userId].songsInTop10++;
            }

            // Track #1 song
            if (rank === 1) {
                userScores[userId].hasTopSong = true;
            }
        });

        // Convert to array and sort by score
        return Object.entries(userScores)
            .map(([visitorId, data]) => ({
                visitorId,
                username: data.username,
                score: data.score,
                songsInTop10: data.songsInTop10,
                hasTopSong: data.hasTopSong,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);  // Top 10 only
    } catch (error) {
        console.error('Failed to get leaderboard:', error);
        return [];
    }
}

// ============ GOD MODE ============
// User with #1 ranked song gets special powers:
// - Unlimited votes
// - Extra deletes during Purge
// - Visual crown distinction

export async function isGodMode(visitorId: string): Promise<boolean> {
    try {
        const songs = await getSortedSongs();
        if (songs.length === 0) return false;

        // Check if this user owns the #1 song
        return songs[0].addedBy === visitorId;
    } catch (error) {
        console.error('Failed to check God Mode:', error);
        return false;
    }
}

// ============ MYSTERY SONG MODE ============
// Admin can mark songs as "mystery" - title/artist hidden until reveal

const MYSTERY_SONGS_KEY = 'hackathon:mysterySongs';  // Set of song IDs that are mystery

// Toggle mystery mode for a song
export async function toggleMysteryMode(songId: string): Promise<boolean> {
    try {
        const isMystery = await redis.sismember(MYSTERY_SONGS_KEY, songId);
        if (isMystery) {
            await redis.srem(MYSTERY_SONGS_KEY, songId);
            return false;
        } else {
            await redis.sadd(MYSTERY_SONGS_KEY, songId);
            return true;
        }
    } catch (error) {
        console.error('Failed to toggle mystery mode:', error);
        return false;
    }
}

// Check if a song is in mystery mode
export async function isMysteryMode(songId: string): Promise<boolean> {
    try {
        return await redis.sismember(MYSTERY_SONGS_KEY, songId) === 1;
    } catch (error) {
        return false;
    }
}

// Get all mystery song IDs
export async function getMysterysongsIds(): Promise<string[]> {
    try {
        return await redis.smembers(MYSTERY_SONGS_KEY) || [];
    } catch (error) {
        return [];
    }
}

// Reveal all mystery songs
export async function revealAllMysterySongs(): Promise<number> {
    try {
        const count = await redis.scard(MYSTERY_SONGS_KEY);
        await redis.del(MYSTERY_SONGS_KEY);
        return count || 0;
    } catch (error) {
        console.error('Failed to reveal mystery songs:', error);
        return 0;
    }
}

// ============ RATE LIMITING ============
// Server-side rate limiting that can't be bypassed

const RATE_LIMIT_PREFIX = 'ratelimit:';

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number; // seconds until reset
}

/**
 * Check if an action is rate limited
 * @param key - Unique identifier (e.g., "vote:visitorId:songId")
 * @param limit - Max actions allowed in the window
 * @param windowSeconds - Time window in seconds
 */
export async function checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
): Promise<RateLimitResult> {
    const redisKey = `${RATE_LIMIT_PREFIX}${key}`;

    try {
        // Use Redis INCR with EXPIRE for atomic rate limiting
        const current = await redis.incr(redisKey);

        // First request in window - set expiry
        if (current === 1) {
            await redis.expire(redisKey, windowSeconds);
        }

        // Get TTL for reset time
        const ttl = await redis.ttl(redisKey);

        return {
            allowed: current <= limit,
            remaining: Math.max(0, limit - current),
            resetIn: ttl > 0 ? ttl : windowSeconds,
        };
    } catch (error) {
        console.error('Rate limit check failed:', error);
        // Fail open (allow) on Redis errors to not break the app
        return { allowed: true, remaining: limit, resetIn: 0 };
    }
}

/**
 * Rate limit for votes: 1 vote per song per 3 seconds per user
 */
export async function checkVoteRateLimit(visitorId: string, songId: string): Promise<RateLimitResult> {
    return checkRateLimit(`vote:${visitorId}:${songId}`, 1, 3);
}

/**
 * Rate limit for global actions: 30 votes per minute per user
 */
export async function checkGlobalVoteLimit(visitorId: string): Promise<RateLimitResult> {
    return checkRateLimit(`votes:${visitorId}`, 30, 60);
}

/**
 * Rate limit for song additions: 3 per minute per user
 */
export async function checkAddSongLimit(visitorId: string): Promise<RateLimitResult> {
    return checkRateLimit(`add:${visitorId}`, 3, 60);
}

/**
 * Rate limit for search: 10 per minute per user
 */
export async function checkSearchLimit(visitorId: string): Promise<RateLimitResult> {
    return checkRateLimit(`search:${visitorId}`, 10, 60);
}
