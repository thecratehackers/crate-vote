/**
 * Application Configuration
 * Centralized config for branding, limits, and feature flags
 */

// ============ BRANDING ============
export const APP_CONFIG = {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Hackathon',
    tagline: 'Collaborative Playlist Voting',
    description: 'Vote on songs and build the ultimate playlist together',

    // Social/SEO
    keywords: ['playlist', 'voting', 'spotify', 'music', 'collaborative'],

    // URLs
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://cratehackathon.com',
    domain: 'cratehackathon.com',

    // Auth
    adminPassword: process.env.ADMIN_PASSWORD || 'admin',
};

// ============ BROADCAST MODE ============
export const BROADCAST = {
    tickerSpeedMs: 60000,           // Full marquee scroll cycle
    alertDurationMs: 5000,          // Song request alert display time
    hypeDecayRate: 0.92,            // Decay multiplier per second (0-1)
    idleTimeoutMs: 45000,           // Longer idle for stream (45s vs 25s)
    activityDisplayMs: 12000,       // Activity feed item lifetime (12s vs 8s)
    factIntervalMs: 8000,           // Pop-up fact rotation (8s)
    lowerThirdDurationMs: 8000,     // Lower-third display on song change
    // Show Clock (ESPN-style segment ticker)
    showClockMaxSegments: 5,
    showClockDefaultDurationMin: 60,
    segmentTransitionMs: 3000,        // Transition splash duration
    segmentWarningMs: 120000,         // 2-minute warning
    segmentUrgentMs: 30000,           // 30-second warning
    reminderDismissMs: 5000,          // Auto-dismiss reminder banners
    segmentIcons: ['🗳️', '❓', '🏆', '🎧', '🎛️', '💀', '🌧️', '⚡'],
    hypeLevels: [
        { threshold: 0, label: 'CHILL', emoji: '🔈', color: '#6b7280' },
        { threshold: 20, label: 'WARMING UP', emoji: '🔉', color: '#f59e0b' },
        { threshold: 40, label: 'ON FIRE', emoji: '🔊', color: '#3b82f6' },
        { threshold: 65, label: 'HYPE', emoji: '📡', color: '#8b5cf6' },
        { threshold: 85, label: 'INSANE', emoji: '🚨', color: '#ef4444' },
    ],
} as const;

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
    '🏆 Top 3 songs earn +5 karma!',
    '📦 Each karma = +1 song, +1 upvote, +1 downvote',
    '💀 THE PURGE lets you delete any song for 30 seconds',
    '👑 Push your song to #1 for the crown',
    '🎧 Save playlists to Crate Hackers, Spotify, or TIDAL',
    '🎚️ Upvote songs you love, downvote ones you don\'t',
    '⏯️ Stay 5 minutes to earn +1 karma',
] as const;

// Type helpers
export type AppConfig = typeof APP_CONFIG;
export type Limits = typeof LIMITS;
export type Features = typeof FEATURES;
