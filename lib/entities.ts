// ============================================================================
// CrateVote Multi-Tab Entity Layer
// ============================================================================
// Defines the new domain entities (Tab, Show, ShowSong, ShowVote) that allow
// CrateVote to support multiple branded voting spaces and a permanent
// historical archive of past shows.
//
// The legacy single-session model in lib/redis-store.ts still powers the
// "main tab, current show" experience. The entities defined here power
// community tabs and archived shows, and serve as the target schema for
// migration when the main tab's current show is archived.
// ============================================================================

import type { Song as LegacySong, SessionPermissions, StreamConfig, ShowClock } from './redis-store';

// ----------------------------------------------------------------------------
// TAB
// ----------------------------------------------------------------------------
// A Tab is a branded voting space. The platform always has one "main" tab
// (the original CrateVote experience). Admins can create additional community
// tabs (e.g., "Reggaeton", "UK Garage").
// ----------------------------------------------------------------------------

export interface Tab {
    id: string;                    // Stable ID (e.g., "main", or UUID)
    slug: string;                  // URL-friendly identifier (e.g., "reggaeton")
    name: string;                  // Display name
    description?: string;
    themeColor?: string;           // Optional hex color for branding accent
    isMainTab: boolean;            // true only for the original CrateVote tab
    createdAt: number;             // Epoch ms
    createdBy: string;             // Admin identifier
    settings: TabSettings;
}

export interface TabSettings {
    maxSongsPerUser: number;
    maxPlaylistSize: number;
    requiresApproval: boolean;     // Future: admin must approve added songs
    allowArchivedVoting: boolean;  // Whether archived shows accept new votes
}

export const DEFAULT_TAB_SETTINGS: TabSettings = {
    maxSongsPerUser: 5,
    maxPlaylistSize: 100,
    requiresApproval: false,
    allowArchivedVoting: true,     // Default per user requirement (always votable)
};

// ----------------------------------------------------------------------------
// SHOW
// ----------------------------------------------------------------------------
// A Show is a discrete voting event within a Tab. Each tab can have many
// shows over time. Shows have a lifecycle: draft -> active -> archived.
// Archived shows remain readable and (per default settings) votable.
// ----------------------------------------------------------------------------

export type ShowStatus = 'draft' | 'active' | 'archived';

export interface Show {
    id: string;                    // Stable show ID
    tabId: string;                 // Which tab this show belongs to
    showNumber: number;            // Sequential within tab (1, 2, 3, ...)
    title: string;                 // Display title (e.g., "CrateVote #47")
    description?: string;
    status: ShowStatus;
    createdAt: number;             // When the show entity was created
    startedAt: number | null;      // When the show transitioned to active
    archivedAt: number | null;     // When the show was archived
    createdBy: string;             // Admin identifier

    // Per-show session config (mirrors legacy redis-store concepts)
    permissions: SessionPermissions;
    locked: boolean;
    streamConfig?: StreamConfig;
    showClock?: ShowClock;
}

// ----------------------------------------------------------------------------
// SHOW-SCOPED SONG
// ----------------------------------------------------------------------------
// Same shape as the legacy Song, but explicitly scoped to a show + tab.
// We denormalize tabId for cheap lookups (e.g., "all songs added by user X
// in tab Y").
// ----------------------------------------------------------------------------

export interface ShowSong extends LegacySong {
    showId: string;
    tabId: string;
}

// ----------------------------------------------------------------------------
// VOTE RECORD
// ----------------------------------------------------------------------------
// Explicit vote record for cross-show analytics and user history.
// Per-vote storage in Redis still uses sets (for atomic counting) but this
// type defines the canonical "what happened" record.
// ----------------------------------------------------------------------------

export interface ShowVote {
    visitorId: string;
    showId: string;
    songId: string;
    direction: 1 | -1;
    timestamp: number;
    isDouble?: boolean;
}

// ----------------------------------------------------------------------------
// EXPORT ELIGIBILITY (per-show)
// ----------------------------------------------------------------------------

export interface ShowExportEligibility {
    showId: string;
    eligible: boolean;
    songsAdded: number;
    upvotesGiven: number;
    downvotesGiven: number;
    reason?: string;
}

// ----------------------------------------------------------------------------
// REDIS KEY HELPERS
// ----------------------------------------------------------------------------
// All new keys live under tab:{tabId}:* and show:{showId}:* namespaces so
// they cannot collide with legacy hackathon:* keys.
// ----------------------------------------------------------------------------

export const KEYS = {
    // Platform-level
    tabsIndex: 'platform:tabs',                 // Hash: tabId -> JSON(Tab)
    tabsBySlug: 'platform:tabsBySlug',          // Hash: slug -> tabId
    showsIndex: 'platform:shows',               // Hash: showId -> JSON(Show)

    // Per-tab
    tabShowsList: (tabId: string) => `tab:${tabId}:shows`,                 // Sorted set (showId -> createdAt)
    tabCurrentShow: (tabId: string) => `tab:${tabId}:currentShow`,         // String (showId)
    tabShowCounter: (tabId: string) => `tab:${tabId}:showCounter`,         // Counter for next show number

    // Per-show
    showSongs: (showId: string) => `show:${showId}:songs`,                 // Hash: songId -> JSON(ShowSong)
    showSongUpvotes: (showId: string, songId: string) => `show:${showId}:song:${songId}:upvotes`,
    showSongDownvotes: (showId: string, songId: string) => `show:${showId}:song:${songId}:downvotes`,
    showLocked: (showId: string) => `show:${showId}:locked`,
    showPermissions: (showId: string) => `show:${showId}:permissions`,
    showActivityLog: (showId: string) => `show:${showId}:activityLog`,
    showUserSongCounts: (showId: string) => `show:${showId}:userSongCounts`,
    showUserUpvotes: (showId: string) => `show:${showId}:userUpvote`,
    showUserDownvotes: (showId: string) => `show:${showId}:userDownvote`,
    showSnapshot: (showId: string) => `show:${showId}:snapshot`,           // Frozen-at-archive ranking
} as const;

export const MAIN_TAB_ID = 'main';
export const MAIN_TAB_SLUG = 'cratevote';
