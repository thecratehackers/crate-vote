// In-memory store for the voting session
// This resets when the server restarts - perfect for per-session hackathons
// Uses browser fingerprints for anonymous user identification

export interface Song {
    id: string;              // Spotify track ID
    spotifyUri: string;      // spotify:track:xxx
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    previewUrl: string | null;
    addedBy: string;         // Visitor ID (fingerprint)
    addedByName: string;     // Display name (Anonymous for fingerprint users)
    addedAt: number;         // timestamp
    upvotes: Set<string>;    // Set of visitor IDs who upvoted
    downvotes: Set<string>;  // Set of visitor IDs who downvoted
    // Audio features for DJs
    popularity: number;        // 0-100
    bpm: number | null;        // Tempo in beats per minute
    energy: number | null;     // 0.0 to 1.0
    valence: number | null;    // 0.0 to 1.0 (happiness/positivity)
    danceability: number | null;  // 0.0 to 1.0
}

export interface SessionState {
    songs: Record<string, Song>;
    bannedUsers: Set<string>;       // Visitor IDs
    isLocked: boolean;
    userSongCounts: Record<string, number>;      // Visitor ID -> songs added
    userDeleteCounts: Record<string, number>;    // Visitor ID -> deletions used
    // NEW: Track each user's single upvote and downvote
    userUpvote: Record<string, string>;    // Visitor ID -> song ID they upvoted
    userDownvote: Record<string, string>;  // Visitor ID -> song ID they downvoted
    // Timer state
    timerEndTime: number | null;   // Unix timestamp when session ends
    timerDuration: number;         // Duration in milliseconds (default 1 hour)
    timerRunning: boolean;
}

// ============ CONSTANTS ============
// Timer settings
export const MAX_SESSION_DURATION = 60 * 60 * 1000; // 1 hour max
export const DEFAULT_SESSION_DURATION = 60 * 60 * 1000; // 1 hour default

// User limits
export const MAX_SONGS_PER_USER = 5;
export const MAX_DELETES_PER_USER = 1;  // Each user can delete 1 of their own songs

// ============ FILE PERSISTENCE (for dev hot-reload survival) ============
import fs from 'fs';
import path from 'path';

const SESSION_FILE = path.join(process.cwd(), '.session.json');

function loadState(): SessionState {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
            // Reconstruct Sets from arrays
            const songs: Record<string, Song> = {};
            for (const [id, song] of Object.entries(data.songs || {})) {
                const s = song as any;
                songs[id] = {
                    ...s,
                    upvotes: new Set(s.upvotes || []),
                    downvotes: new Set(s.downvotes || []),
                };
            }
            return {
                songs,
                bannedUsers: new Set(data.bannedUsers || []),
                isLocked: data.isLocked || false,
                userSongCounts: data.userSongCounts || {},
                userDeleteCounts: data.userDeleteCounts || {},
                userUpvote: data.userUpvote || {},
                userDownvote: data.userDownvote || {},
                timerEndTime: data.timerEndTime || null,
                timerDuration: data.timerDuration || DEFAULT_SESSION_DURATION,
                timerRunning: data.timerRunning || false,
            };
        }
    } catch (e) {
        console.error('Failed to load session state:', e);
    }
    // Return default state
    return {
        songs: {},
        bannedUsers: new Set(),
        isLocked: false,
        userSongCounts: {},
        userDeleteCounts: {},
        userUpvote: {},
        userDownvote: {},
        timerEndTime: null,
        timerDuration: DEFAULT_SESSION_DURATION,
        timerRunning: false,
    };
}

function saveState() {
    try {
        // Convert Sets to arrays for JSON serialization
        const songs: Record<string, any> = {};
        for (const [id, song] of Object.entries(state.songs)) {
            songs[id] = {
                ...song,
                upvotes: Array.from(song.upvotes),
                downvotes: Array.from(song.downvotes),
            };
        }
        const data = {
            songs,
            bannedUsers: Array.from(state.bannedUsers),
            isLocked: state.isLocked,
            userSongCounts: state.userSongCounts,
            userDeleteCounts: state.userDeleteCounts,
            userUpvote: state.userUpvote,
            userDownvote: state.userDownvote,
            timerEndTime: state.timerEndTime,
            timerDuration: state.timerDuration,
            timerRunning: state.timerRunning,
        };
        fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to save session state:', e);
    }
}

// ============ STATE ============
let state: SessionState = loadState();

// Reload state from file (for multi-instance sync)
function reloadState(): void {
    const newState = loadState();
    state.songs = newState.songs;
    state.bannedUsers = newState.bannedUsers;
    state.isLocked = newState.isLocked;
    state.userSongCounts = newState.userSongCounts;
    state.userDeleteCounts = newState.userDeleteCounts;
    state.userUpvote = newState.userUpvote;
    state.userDownvote = newState.userDownvote;
    state.timerEndTime = newState.timerEndTime;
    state.timerDuration = newState.timerDuration;
    state.timerRunning = newState.timerRunning;
}

// Helper to calculate score
export function calculateScore(song: Song): number {
    return song.upvotes.size - song.downvotes.size;
}

// Get all songs sorted by score
export function getSortedSongs(): (Song & { score: number })[] {
    // Reload from file to sync with other instances
    reloadState();

    return Object.values(state.songs)
        .map(song => ({
            ...song,
            score: calculateScore(song),
            // Convert Sets to arrays for JSON serialization
            upvotes: Array.from(song.upvotes) as any,
            downvotes: Array.from(song.downvotes) as any,
        }))
        .sort((a, b) => {
            // Sort by score descending, then by addedAt ascending (older first for ties)
            if (b.score !== a.score) return b.score - a.score;
            return a.addedAt - b.addedAt;
        });
}

// Add a song
export function addSong(
    song: Omit<Song, 'upvotes' | 'downvotes' | 'addedAt'>,
    visitorId: string
): { success: boolean; error?: string } {
    if (state.isLocked) {
        return { success: false, error: 'Playlist is locked - no new songs allowed' };
    }

    if (state.bannedUsers.has(visitorId)) {
        return { success: false, error: 'You have been banned from this session' };
    }

    // Check if song already exists
    if (state.songs[song.id]) {
        return { success: false, error: 'This song is already in the playlist' };
    }

    // Check user's song count
    const userCount = state.userSongCounts[visitorId] || 0;
    if (userCount >= MAX_SONGS_PER_USER) {
        return { success: false, error: `You can only add ${MAX_SONGS_PER_USER} songs per session` };
    }

    // Add the song (no auto-upvote - user must choose to use their upvote)
    state.songs[song.id] = {
        ...song,
        addedBy: visitorId,
        addedAt: Date.now(),
        upvotes: new Set(),
        downvotes: new Set(),
    };

    state.userSongCounts[visitorId] = userCount + 1;
    saveState();
    return { success: true };
}

// Vote on a song - NEW LOGIC: user gets 1 upvote and 1 downvote total
export function voteSong(songId: string, visitorId: string, vote: 1 | -1): { success: boolean; error?: string } {
    if (state.bannedUsers.has(visitorId)) {
        return { success: false, error: 'You have been banned from this session' };
    }

    const song = state.songs[songId];
    if (!song) {
        return { success: false, error: 'Song not found' };
    }

    if (vote === 1) {
        // UPVOTE LOGIC
        const currentUpvotedSong = state.userUpvote[visitorId];

        if (currentUpvotedSong === songId) {
            // Clicking same song again - remove upvote
            song.upvotes.delete(visitorId);
            delete state.userUpvote[visitorId];
        } else {
            // Remove upvote from previous song (if any)
            if (currentUpvotedSong && state.songs[currentUpvotedSong]) {
                state.songs[currentUpvotedSong].upvotes.delete(visitorId);
            }
            // Also remove any downvote from this song (can't up and down same song)
            if (state.userDownvote[visitorId] === songId) {
                song.downvotes.delete(visitorId);
                delete state.userDownvote[visitorId];
            }
            // Add upvote to new song
            song.upvotes.add(visitorId);
            state.userUpvote[visitorId] = songId;
        }
    } else {
        // DOWNVOTE LOGIC
        const currentDownvotedSong = state.userDownvote[visitorId];

        if (currentDownvotedSong === songId) {
            // Clicking same song again - remove downvote
            song.downvotes.delete(visitorId);
            delete state.userDownvote[visitorId];
        } else {
            // Remove downvote from previous song (if any)
            if (currentDownvotedSong && state.songs[currentDownvotedSong]) {
                state.songs[currentDownvotedSong].downvotes.delete(visitorId);
            }
            // Also remove any upvote from this song (can't up and down same song)
            if (state.userUpvote[visitorId] === songId) {
                song.upvotes.delete(visitorId);
                delete state.userUpvote[visitorId];
            }
            // Add downvote to new song
            song.downvotes.add(visitorId);
            state.userDownvote[visitorId] = songId;
        }
    }

    saveState();
    return { success: true };
}

// Remove a song (admin only)
export function removeSong(songId: string): { success: boolean; error?: string } {
    if (!state.songs[songId]) {
        return { success: false, error: 'Song not found' };
    }

    delete state.songs[songId];
    saveState();
    return { success: true };
}

// Remove a song by the user who added it
export function removeSongByUser(songId: string, visitorId: string): { success: boolean; error?: string } {
    const song = state.songs[songId];
    if (!song) {
        return { success: false, error: 'Song not found' };
    }

    if (song.addedBy !== visitorId) {
        return { success: false, error: 'You can only remove songs you added' };
    }

    // Check delete limit
    const deleteCount = state.userDeleteCounts[visitorId] || 0;
    if (deleteCount >= MAX_DELETES_PER_USER) {
        return { success: false, error: `You can only delete ${MAX_DELETES_PER_USER} song per session` };
    }

    delete state.songs[songId];

    // Track the deletion (don't give back the add credit)
    state.userDeleteCounts[visitorId] = deleteCount + 1;

    return { success: true };
}

// Ban a user (admin only)
export function banUser(visitorId: string): void {
    state.bannedUsers.add(visitorId);
    saveState();
}

// Unban a user (admin only)
export function unbanUser(visitorId: string): void {
    state.bannedUsers.delete(visitorId);
}

// Lock/unlock playlist (admin only)
export function setPlaylistLocked(locked: boolean): void {
    state.isLocked = locked;
    saveState();
}

// Get lock status
export function isPlaylistLocked(): boolean {
    reloadState();
    return state.isLocked;
}

// Get user's remaining adds and deletes
export function getUserStatus(visitorId: string): {
    songsRemaining: number;
    songsAdded: number;
    deletesRemaining: number;
} {
    const count = state.userSongCounts[visitorId] || 0;
    const deleteCount = state.userDeleteCounts[visitorId] || 0;

    return {
        songsRemaining: Math.max(0, MAX_SONGS_PER_USER - count),
        songsAdded: count,
        deletesRemaining: Math.max(0, MAX_DELETES_PER_USER - deleteCount),
    };
}

// Get user's votes for display - returns their single upvote and downvote
export function getUserVotes(visitorId: string): { upvotedSongId: string | null; downvotedSongId: string | null } {
    return {
        upvotedSongId: state.userUpvote[visitorId] || null,
        downvotedSongId: state.userDownvote[visitorId] || null,
    };
}

// Reset everything (admin only)
export function resetSession(): void {
    console.log('🗑️ WIPE SESSION: Clearing all data...');

    // Clear all in-memory state
    state.songs = {};
    state.bannedUsers.clear();
    state.isLocked = false;
    state.userSongCounts = {};
    state.userDeleteCounts = {};
    state.userUpvote = {};     // Clear all upvotes
    state.userDownvote = {};   // Clear all downvotes
    state.timerEndTime = null;
    state.timerRunning = false;

    // Delete the session file and save fresh state
    try {
        if (fs.existsSync(SESSION_FILE)) {
            fs.unlinkSync(SESSION_FILE);
            console.log('🗑️ WIPE SESSION: Deleted session file');
        }
    } catch (e) {
        console.error('Failed to delete session file:', e);
    }

    // Save the clean state
    saveState();
    console.log('🗑️ WIPE SESSION: Complete! Songs count:', Object.keys(state.songs).length);
}

// Timer functions
export function startTimer(durationMs?: number): { endTime: number } {
    const duration = Math.min(durationMs || state.timerDuration, MAX_SESSION_DURATION);
    state.timerDuration = duration;
    state.timerEndTime = Date.now() + duration;
    state.timerRunning = true;
    state.isLocked = false; // Unlock when starting
    saveState();
    return { endTime: state.timerEndTime };
}

export function stopTimer(): void {
    state.timerRunning = false;
    state.isLocked = true; // Lock playlist when timer stops
    saveState();
}

export function resetTimer(): void {
    state.timerEndTime = null;
    state.timerRunning = false;
    saveState();
}

export function getTimerStatus(): { endTime: number | null; running: boolean; remaining: number } {
    // Reload from file to sync with other instances
    reloadState();

    const remaining = state.timerEndTime && state.timerRunning
        ? Math.max(0, state.timerEndTime - Date.now())
        : 0;

    // Auto-stop if time ran out
    if (state.timerRunning && state.timerEndTime && Date.now() >= state.timerEndTime) {
        stopTimer();
    }

    return {
        endTime: state.timerEndTime,
        running: state.timerRunning,
        remaining,
    };
}

export function setTimerDuration(durationMs: number): void {
    state.timerDuration = Math.min(durationMs, MAX_SESSION_DURATION);
}

// Check if user is banned
export function isUserBanned(visitorId: string): boolean {
    return state.bannedUsers.has(visitorId);
}

// Get list of banned users
export function getBannedUsers(): string[] {
    return Array.from(state.bannedUsers);
}

// Get session stats
export function getSessionStats(): { totalSongs: number; totalVotes: number; uniqueVoters: number } {
    const allVoters = new Set<string>();
    let totalVotes = 0;

    for (const song of Object.values(state.songs)) {
        totalVotes += song.upvotes.size + song.downvotes.size;
        Array.from(song.upvotes).forEach(visitorId => allVoters.add(visitorId));
        Array.from(song.downvotes).forEach(visitorId => allVoters.add(visitorId));
    }

    return {
        totalSongs: Object.keys(state.songs).length,
        totalVotes,
        uniqueVoters: allVoters.size,
    };
}

// Get songs for export - ONLY songs with positive votes
export function getExportData(): { name: string; artist: string; spotifyUri: string; score: number; addedBy: string }[] {
    return getSortedSongs()
        .filter(s => s.score > 0)  // Only songs that were voted up
        .map(s => ({
            name: s.name,
            artist: s.artist,
            spotifyUri: s.spotifyUri,
            score: s.score,
            addedBy: s.addedByName,
        }));
}

// Get list of active users (people who have added songs)
export function getActiveUsers(): { visitorId: string; name: string; songsAdded: number; isBanned: boolean }[] {
    const userMap = new Map<string, { name: string; songsAdded: number }>();

    // Collect users from songs they've added
    for (const song of Object.values(state.songs)) {
        const existing = userMap.get(song.addedBy);
        if (existing) {
            existing.songsAdded++;
        } else {
            userMap.set(song.addedBy, { name: song.addedByName, songsAdded: 1 });
        }
    }

    // Convert to array
    return Array.from(userMap.entries()).map(([visitorId, data]) => ({
        visitorId,
        name: data.name,
        songsAdded: data.songsAdded,
        isBanned: state.bannedUsers.has(visitorId),
    }));
}
