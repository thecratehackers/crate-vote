import { Redis } from '@upstash/redis';

// Initialize Redis client - uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from env
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

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
    addedAt: number;
    upvotes: string[];
    downvotes: string[];
    popularity: number;
    bpm: number | null;
    energy: number | null;
    valence: number | null;
    danceability: number | null;
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
function calculateScore(song: Song): number {
    return song.upvotes.length - song.downvotes.length;
}

// ============ SONG FUNCTIONS ============
export async function getSortedSongs(): Promise<(Song & { score: number })[]> {
    try {
        const songs = await redis.hgetall<Record<string, Song>>(SONGS_KEY) || {};

        return Object.values(songs)
            .map(song => ({
                ...song,
                score: calculateScore(song),
            }))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.addedAt - b.addedAt;
            });
    } catch (error) {
        console.error('Failed to get songs:', error);
        return [];
    }
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

export async function addSong(
    song: Omit<Song, 'upvotes' | 'downvotes' | 'addedAt'>,
    visitorId: string
): Promise<{ success: boolean; error?: string; displaced?: string }> {
    try {
        const isLocked = await redis.get<boolean>(LOCKED_KEY) || false;
        if (isLocked) {
            return { success: false, error: 'Playlist is locked' };
        }

        const banned = await redis.sismember(BANNED_KEY, visitorId);
        if (banned) {
            return { success: false, error: 'You are banned' };
        }

        // Check song count - include karma bonuses
        const counts = await redis.hget<number>(USER_SONG_COUNTS_KEY, visitorId) || 0;
        const karmaBonuses = await getKarmaBonuses(visitorId);
        const maxSongs = MAX_SONGS_PER_USER + karmaBonuses.bonusSongAdds;

        if (counts >= maxSongs) {
            return { success: false, error: `Max ${maxSongs} songs reached (${MAX_SONGS_PER_USER} base + ${karmaBonuses.bonusSongAdds} karma)` };
        }

        // Check if song already exists
        const existing = await redis.hget(SONGS_KEY, song.id);
        if (existing) {
            return { success: false, error: 'Song already in playlist' };
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
                return { success: false, error: 'Playlist is full! Vote down songs to make room.' };
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
        return { success: false, error: 'Database error' };
    }
}

// Admin add song - unlimited, bypasses lock
export async function adminAddSong(
    song: Omit<Song, 'upvotes' | 'downvotes' | 'addedAt'>
): Promise<{ success: boolean; error?: string }> {
    try {
        // Check if song already exists
        const existing = await redis.hget(SONGS_KEY, song.id);
        if (existing) {
            return { success: false, error: 'Song already in playlist' };
        }

        // Add the song
        const newSong: Song = {
            ...song,
            upvotes: [],
            downvotes: [],
            addedAt: Date.now(),
        };

        await redis.hset(SONGS_KEY, { [song.id]: newSong });

        return { success: true };
    } catch (error) {
        console.error('Failed to admin add song:', error);
        return { success: false, error: 'Database error' };
    }
}

export async function deleteSong(songId: string, visitorId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const song = await redis.hget<Song>(SONGS_KEY, songId);
        if (!song) {
            return { success: false, error: 'Song not found' };
        }

        // Only the person who added can delete, and only if they have deletes left
        if (song.addedBy !== visitorId) {
            return { success: false, error: 'You can only delete your own songs' };
        }

        const deleteCount = await redis.hget<number>(USER_DELETE_COUNTS_KEY, visitorId) || 0;
        if (deleteCount >= MAX_DELETES_PER_USER) {
            return { success: false, error: 'No deletes remaining' };
        }

        await redis.hdel(SONGS_KEY, songId);
        await redis.hincrby(USER_DELETE_COUNTS_KEY, visitorId, 1);
        await redis.hincrby(USER_SONG_COUNTS_KEY, visitorId, -1);

        return { success: true };
    } catch (error) {
        console.error('Failed to delete song:', error);
        return { success: false, error: 'Database error' };
    }
}

export async function vote(songId: string, visitorId: string, direction: 1 | -1): Promise<{ success: boolean; error?: string }> {
    try {
        const isLocked = await redis.get<boolean>(LOCKED_KEY) || false;
        if (isLocked) {
            return { success: false, error: 'Voting is locked' };
        }

        const banned = await redis.sismember(BANNED_KEY, visitorId);
        if (banned) {
            return { success: false, error: 'You are banned' };
        }

        const song = await redis.hget<Song>(SONGS_KEY, songId);
        if (!song) {
            return { success: false, error: 'Song not found' };
        }

        // Get current votes for this user (stored as arrays now)
        const userUpvotes = await redis.hget<string[]>(USER_UPVOTE_KEY, visitorId) || [];
        const userDownvotes = await redis.hget<string[]>(USER_DOWNVOTE_KEY, visitorId) || [];

        if (direction === 1) {
            // Upvoting
            const alreadyUpvoted = userUpvotes.includes(songId);

            if (alreadyUpvoted) {
                // Toggle off - remove upvote
                song.upvotes = song.upvotes.filter(id => id !== visitorId);
                const newUserUpvotes = userUpvotes.filter(id => id !== songId);
                await redis.hset(SONGS_KEY, { [songId]: song });
                await redis.hset(USER_UPVOTE_KEY, { [visitorId]: newUserUpvotes });
            } else {
                // Check limit
                if (userUpvotes.length >= MAX_UPVOTES_PER_USER) {
                    return { success: false, error: `Maximum ${MAX_UPVOTES_PER_USER} upvotes reached` };
                }
                // Add upvote
                song.upvotes.push(visitorId);
                userUpvotes.push(songId);
                await redis.hset(SONGS_KEY, { [songId]: song });
                await redis.hset(USER_UPVOTE_KEY, { [visitorId]: userUpvotes });
            }
        } else {
            // Downvoting
            const alreadyDownvoted = userDownvotes.includes(songId);

            if (alreadyDownvoted) {
                // Toggle off - remove downvote
                song.downvotes = song.downvotes.filter(id => id !== visitorId);
                const newUserDownvotes = userDownvotes.filter(id => id !== songId);
                await redis.hset(SONGS_KEY, { [songId]: song });
                await redis.hset(USER_DOWNVOTE_KEY, { [visitorId]: newUserDownvotes });
            } else {
                // Check limit
                if (userDownvotes.length >= MAX_DOWNVOTES_PER_USER) {
                    return { success: false, error: `Maximum ${MAX_DOWNVOTES_PER_USER} downvotes reached` };
                }
                // Add downvote
                song.downvotes.push(visitorId);
                userDownvotes.push(songId);
                await redis.hset(SONGS_KEY, { [songId]: song });
                await redis.hset(USER_DOWNVOTE_KEY, { [visitorId]: userDownvotes });
            }
        }

        // Track user activity for admin panel sorting
        await updateUserActivity(visitorId);

        return { success: true };
    } catch (error) {
        console.error('Failed to vote:', error);
        return { success: false, error: 'Database error' };
    }
}

// Admin vote - unlimited voting, can vote on multiple songs
export async function adminVote(songId: string, visitorId: string, direction: 1 | -1): Promise<{ success: boolean; error?: string }> {
    try {
        const song = await redis.hget<Song>(SONGS_KEY, songId);
        if (!song) {
            return { success: false, error: 'Song not found' };
        }

        if (direction === 1) {
            // Toggle upvote
            const hasUpvoted = song.upvotes.includes(visitorId);
            if (hasUpvoted) {
                song.upvotes = song.upvotes.filter(id => id !== visitorId);
            } else {
                // Remove from downvotes if present, add to upvotes
                song.downvotes = song.downvotes.filter(id => id !== visitorId);
                song.upvotes.push(visitorId);
            }
        } else {
            // Toggle downvote
            const hasDownvoted = song.downvotes.includes(visitorId);
            if (hasDownvoted) {
                song.downvotes = song.downvotes.filter(id => id !== visitorId);
            } else {
                // Remove from upvotes if present, add to downvotes
                song.upvotes = song.upvotes.filter(id => id !== visitorId);
                song.downvotes.push(visitorId);
            }
        }

        await redis.hset(SONGS_KEY, { [songId]: song });
        return { success: true };
    } catch (error) {
        console.error('Failed to admin vote:', error);
        return { success: false, error: 'Database error' };
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
}> {
    try {
        const songsAdded = await redis.hget<number>(USER_SONG_COUNTS_KEY, visitorId) || 0;
        const deleteCount = await redis.hget<number>(USER_DELETE_COUNTS_KEY, visitorId) || 0;
        const upvotes = await redis.hget<string[]>(USER_UPVOTE_KEY, visitorId) || [];
        const downvotes = await redis.hget<string[]>(USER_DOWNVOTE_KEY, visitorId) || [];

        return {
            songsRemaining: Math.max(0, MAX_SONGS_PER_USER - songsAdded),
            songsAdded,
            deletesRemaining: Math.max(0, MAX_DELETES_PER_USER - deleteCount),
            deletesUsed: deleteCount,
            upvotesRemaining: Math.max(0, MAX_UPVOTES_PER_USER - upvotes.length),
            upvotesUsed: upvotes.length,
            downvotesRemaining: Math.max(0, MAX_DOWNVOTES_PER_USER - downvotes.length),
            downvotesUsed: downvotes.length,
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
        };
    }
}

// ============ LOCK/UNLOCK ============
export async function setPlaylistLocked(locked: boolean): Promise<void> {
    await redis.set(LOCKED_KEY, locked);
}

export async function isPlaylistLocked(): Promise<boolean> {
    return await redis.get<boolean>(LOCKED_KEY) || false;
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
}

export async function stopTimer(): Promise<void> {
    const timer = await redis.get<TimerData>(TIMER_KEY);
    if (timer) {
        timer.running = false;
        timer.endTime = null;
        await redis.set(TIMER_KEY, timer);
    }
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
}

export async function getTimerStatus(): Promise<{ endTime: number | null; running: boolean; remaining: number }> {
    const timer = await redis.get<TimerData>(TIMER_KEY);
    if (!timer) {
        return { endTime: null, running: false, remaining: 0 };
    }

    const remaining = timer.endTime && timer.running
        ? Math.max(0, timer.endTime - Date.now())
        : 0;

    // Auto-stop if time ran out
    if (timer.running && timer.endTime && Date.now() >= timer.endTime) {
        await stopTimer();
        return { endTime: null, running: false, remaining: 0 };
    }

    return {
        endTime: timer.endTime,
        running: timer.running,
        remaining,
    };
}

// ============ RESET SESSION ============
export async function resetSession(): Promise<void> {
    console.log('🗑️ WIPE SESSION: Clearing all data from Redis...');

    await Promise.all([
        redis.del(SONGS_KEY),
        redis.del(BANNED_KEY),
        redis.del(LOCKED_KEY),
        redis.del(USER_SONG_COUNTS_KEY),
        redis.del(USER_DELETE_COUNTS_KEY),
        redis.del(USER_UPVOTE_KEY),
        redis.del(USER_DOWNVOTE_KEY),
        redis.del(TIMER_KEY),
    ]);

    console.log('🗑️ WIPE SESSION: Complete!');
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

        const voters = new Set<string>();
        let totalVotes = 0;

        for (const song of songsList) {
            totalVotes += song.upvotes.length + song.downvotes.length;
            song.upvotes.forEach(v => voters.add(v));
            song.downvotes.forEach(v => voters.add(v));
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
    songName: string;
    timestamp: number;
}

const MAX_ACTIVITY_ITEMS = 10;
const ACTIVITY_TTL_MS = 60000; // 60 seconds - activities older than this are hidden

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

export async function addKarma(visitorId: string, points: number = 1): Promise<number> {
    try {
        const newKarma = await redis.hincrby(USER_KARMA_KEY, visitorId, points);
        return newKarma;
    } catch (error) {
        console.error('Failed to add karma:', error);
        return 0;
    }
}

export interface KarmaBonuses {
    karma: number;
    bonusVotes: number;      // Extra upvotes OR downvotes available
    bonusSongAdds: number;   // Extra songs can add
}

export function calculateKarmaBonuses(karma: number): KarmaBonuses {
    return {
        karma,
        bonusVotes: karma,  // 1 karma = 1 extra vote
        bonusSongAdds: Math.floor(karma / 5),  // Every 5 karma = 1 extra song add
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
            return { success: false, karma: await getUserKarma(visitorId), error: 'Too soon' };
        }

        // Grant 1 karma
        const newKarma = await addKarma(visitorId, 1);
        await redis.hset(USER_LAST_PRESENCE_GRANT_KEY, { [visitorId]: now });

        console.log(`Granted +1 presence karma to ${visitorId}`);
        return { success: true, karma: newKarma };
    } catch (error) {
        console.error('Failed to grant presence karma:', error);
        return { success: false, karma: 0, error: 'Database error' };
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
