/**
 * Application Configuration
 * Centralized config for branding, limits, and feature flags
 */

// ============ BRANDING ============
export const APP_CONFIG = {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Crate Hackers',
    tagline: 'Collaborative Playlist Voting',
    description: 'Vote on songs and build the ultimate playlist together',

    // Social/SEO
    keywords: ['playlist', 'voting', 'spotify', 'music', 'collaborative'],

    // URLs
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://crateoftheweek.com',
};

// ============ GAME LIMITS ============
export const LIMITS = {
    // Per-user limits
    maxSongsPerUser: 5,
    maxUpvotesPerUser: 5,
    maxDownvotesPerUser: 5,
    maxDeletesPerUser: 1,

    // Playlist limits
    maxPlaylistSize: 100,
    maxSongDurationMs: 12 * 60 * 1000, // 12 minutes

    // Timing
    pollIntervalMs: 15000,      // 15 seconds
    adminPollIntervalMs: 3000,  // 3 seconds
    messageTimeoutMs: 3000,     // 3 seconds

    // Delete window
    deleteWindowDurationMs: 30000, // 30 seconds

    // Versus Battle
    battleDurationMs: 45000,        // 45 seconds
    lightningRoundDurationMs: 15000, // 15 seconds

    // Karma
    karmaPresenceCooldownMs: 15 * 60 * 1000, // 15 minutes
    karmaPresenceDelayMs: 5 * 60 * 1000,     // 5 minutes
    karmaCostPerExtraSong: 5,
} as const;

// ============ FEATURE FLAGS ============
export const FEATURES = {
    enableKarma: true,
    enableVersusBattle: true,
    enableDeleteWindow: true,
    enableAudioPreview: true,
    enableActivityFeed: true,
    enableConfetti: true,
    enableShoutouts: true,
} as const;

// ============ RESERVED USERNAMES ============
export const RESERVED_USERNAMES = [
    'admin',
    'system',
    'mod',
    'moderator',
    'host',
    'dj',
    'bot',
] as const;

// ============ BLOCKED WORDS (Profanity Filter) ============
export const BLOCKED_WORDS = new Set([
    'fuck', 'fucking', 'shit', 'ass', 'asshole', 'bitch', 'damn', 'crap',
    'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut', 'bastard', 'piss',
    'nigga', 'nigger', 'faggot', 'fag', 'retard', 'retarded'
]);

// ============ GAME TIPS ============
export const GAME_TIPS = [
    '🏆 Get your song in the Top 3 to earn +5 karma!',
    '✨ Each karma = +1 song AND +1 upvote AND +1 downvote!',
    '💀 Watch for THE PURGE — 30 seconds to eliminate songs!',
    '👑 The #1 song gets the crown — fight for it!',
    '🎧 Export to Spotify when voting ends!',
    '⬆️ Upvote songs you want played, downvote the rest!',
    '🔥 Songs with negative scores can get bumped!',
    '⏳ Stay 5 min for +1 karma (loyalty bonus)!',
] as const;

// Type helpers
export type AppConfig = typeof APP_CONFIG;
export type Limits = typeof LIMITS;
export type Features = typeof FEATURES;
