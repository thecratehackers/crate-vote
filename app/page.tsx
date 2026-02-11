'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { APP_CONFIG, BLOCKED_WORDS, GAME_TIPS, LIMITS, BROADCAST } from '@/lib/config';
import { PlaylistSkeleton } from '@/components/Skeleton';
import VersusBattle from '@/components/VersusBattle';
import VideoPreview from '@/components/VideoPreview';
import JukeboxPlayer from '@/components/JukeboxPlayer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastContainer, useToast } from '@/components/Toast';
import { SoundEffects } from '@/lib/sounds';
import { persistGet, persistSet, persistHydrate, persistSyncToCookie } from '@/lib/persist';

// Network resilience - fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Connection timed out — check your internet');
        }
        throw error;
    }
};

// Retry logic for failed requests
const fetchWithRetry = async (
    url: string,
    options: RequestInit = {},
    maxRetries = 2,
    timeoutMs = 10000
): Promise<Response> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchWithTimeout(url, options, timeoutMs);
        } catch (error: any) {
            lastError = error;
            // Don't retry on abort or if it's not a network error
            if (error.name === 'AbortError' || attempt === maxRetries) {
                throw error;
            }
            // Wait before retry (exponential backoff: 500ms, 1000ms)
            await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        }
    }

    throw lastError || new Error('Request failed after retries');
};

// Extract YouTube video ID from various URL formats
const extractYouTubeId = (input: string): string | null => {
    if (!input) return null;

    // Check if it's an iframe embed code
    const iframeMatch = input.match(/src=["']([^"']+)["']/);
    if (iframeMatch) {
        const srcUrl = iframeMatch[1];
        const embedMatch = srcUrl.match(/youtube\.com\/embed\/([^?&"']+)/);
        if (embedMatch) return embedMatch[1];
        // Playlist embed: videoseries?list=PLAYLIST_ID
        const playlistEmbedMatch = srcUrl.match(/youtube\.com\/embed\/videoseries\?list=([^&"']+)/);
        if (playlistEmbedMatch) return `playlist:${playlistEmbedMatch[1]}`;
    }

    // Check if it's a playlist URL (must check before video patterns)
    const playlistMatch = input.match(/youtube\.com\/playlist\?list=([^&?/\s]+)/);
    if (playlistMatch) return `playlist:${playlistMatch[1]}`;

    // Check if it's a regular YouTube URL (video or live)
    const urlPatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/\s]+)/,
        /youtube\.com\/embed\/([^?&/\s]+)/,
        /youtube\.com\/v\/([^?&/\s]+)/,
        /youtube\.com\/live\/([^?&/\s]+)/
    ];

    for (const pattern of urlPatterns) {
        const match = input.match(pattern);
        if (match) return match[1];
    }

    return null;
};

// Build the correct YouTube embed src for videos vs playlists
const getYouTubeEmbedSrc = (embedId: string): string => {
    if (embedId.startsWith('playlist:')) {
        const listId = embedId.replace('playlist:', '');
        return `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=1&mute=1&enablejsapi=1`;
    }
    return `https://www.youtube.com/embed/${embedId}?autoplay=1&mute=1&enablejsapi=1`;
};


interface Song {
    id: string;
    spotifyUri: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    previewUrl: string | null;
    addedBy: string;
    addedByName: string;
    addedByAvatar?: string;
    addedByColor?: string;
    addedByLocation?: string;  // Location annotation (e.g., "Austin, TX" or "🇬🇧 London, UK")
    addedAt: number;
    score: number;
    // Audio features for DJs
    popularity: number;
    bpm: number | null;
    energy: number | null;
    valence: number | null;
    danceability: number | null;
    camelotKey: string | null;
}

interface SearchResult {
    id: string;
    spotifyUri: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    previewUrl: string | null;
    popularity: number;
    bpm: number | null;
    energy: number | null;
    valence: number | null;
    danceability: number | null;
    camelotKey: string | null;
    explicit: boolean;
    durationMs: number;
}

interface UserStatus {
    songsRemaining: number;
    songsAdded: number;
    deletesRemaining: number;
    deletesUsed: number;
    upvotesRemaining: number;
    upvotesUsed: number;
    downvotesRemaining: number;
    downvotesUsed: number;
    isGodMode: boolean;
}

interface TimerStatus {
    endTime: number | null;
    running: boolean;
    remaining: number;
    isBanned: boolean;
}

// NEW: User gets ONE upvote and ONE downvote total
interface UserVotes {
    upvotedSongIds: string[];
    downvotedSongIds: string[];
}

export default function HomePage() {
    const [songs, setSongs] = useState<Song[]>([]);
    const [userVotes, setUserVotes] = useState<UserVotes>({ upvotedSongIds: [], downvotedSongIds: [] });
    const [userStatus, setUserStatus] = useState<UserStatus>({ songsRemaining: 5, songsAdded: 0, deletesRemaining: 5, deletesUsed: 0, upvotesRemaining: 5, upvotesUsed: 0, downvotesRemaining: 5, downvotesUsed: 0, isGodMode: false });
    const [isLocked, setIsLocked] = useState(false);
    const [visitorId, setVisitorId] = useState<string | null>(null);
    const [isBanned, setIsBanned] = useState(false);

    // 🔑 ADMIN MODE - Bypass participation gates when admin is on front page
    const [isAdminOnFrontPage, setIsAdminOnFrontPage] = useState(false);
    const [adminKey, setAdminKey] = useState<string>('');

    // 🍞 TOAST NOTIFICATIONS
    const toast = useToast();

    // ⏱️ RATE LIMITING - Prevent vote spam (1 vote per song per 3 seconds)
    const voteTimestamps = useRef<Map<string, number>>(new Map());
    const VOTE_COOLDOWN_MS = 3000;

    // Timer state
    const [timerRemaining, setTimerRemaining] = useState<number>(0);
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerEndTime, setTimerEndTime] = useState<number | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);

    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [playlistTitle, setPlaylistTitle] = useState(`${APP_CONFIG.name} Playlist`);
    const [playlistStats, setPlaylistStats] = useState<{ current: number; max: number; canAdd: boolean }>({ current: 0, max: 100, canAdd: true });
    const [viewerCount, setViewerCount] = useState<number>(0);

    // 🔄 LOADING STATES - Explicit feedback for all actions
    const [isSavingUsername, setIsSavingUsername] = useState(false);
    const [isAddingSong, setIsAddingSong] = useState<string | null>(null); // Track which song is being added
    const [votingInProgress, setVotingInProgress] = useState<Set<string>>(new Set()); // Track songs being voted on
    const [isExporting, setIsExporting] = useState(false);
    const [noSearchResults, setNoSearchResults] = useState(false);

    // Delete window (chaos mode) state
    const [deleteWindow, setDeleteWindow] = useState<{ active: boolean; endTime: number | null; remaining: number; canDelete: boolean; reason?: string }>({
        active: false, endTime: null, remaining: 0, canDelete: false
    });
    const [deleteWindowRemaining, setDeleteWindowRemaining] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [purgeArmedSongId, setPurgeArmedSongId] = useState<string | null>(null);
    const purgeArmTimeout = useRef<NodeJS.Timeout | null>(null);

    // 🎚️ SESSION PERMISSIONS - Admin can toggle voting/adding
    const [permissions, setPermissions] = useState<{ canVote: boolean; canAddSongs: boolean }>({
        canVote: true,
        canAddSongs: true,
    });

    // 🎰 MEGA-ANNOUNCEMENT STATE - Vegas-style full-screen overlays
    const [showPurgeSplash, setShowPurgeSplash] = useState(false);
    const [showKarmaRainSplash, setShowKarmaRainSplash] = useState(false);
    const [showWipeSplash, setShowWipeSplash] = useState(false);
    const [previousPurgeActive, setPreviousPurgeActive] = useState(false);
    const [previousSongCount, setPreviousSongCount] = useState<number | null>(null);

    // 🏆 WINNER ANNOUNCEMENT - When user's song is #1 at round end
    const [showWinnerSplash, setShowWinnerSplash] = useState(false);
    const [winnerSongName, setWinnerSongName] = useState<string>('');
    const previousTimerRunning = useRef<boolean>(false);

    // 🎰 GOLDEN HOUR PRIZE DROP - Random active user wins a prize
    const [showPrizeDrop, setShowPrizeDrop] = useState(false);
    const [prizeDropIsWinner, setPrizeDropIsWinner] = useState(false);
    const [prizeDropWinnerName, setPrizeDropWinnerName] = useState<string>('');
    const [lastPrizeDropTimestamp, setLastPrizeDropTimestamp] = useState(0);

    // 👑 LEADERBOARD KING - MVP at session end
    const [showLeaderboardKing, setShowLeaderboardKing] = useState(false);
    const [leaderboardKingIsMe, setLeaderboardKingIsMe] = useState(false);
    const [leaderboardKingName, setLeaderboardKingName] = useState<string>('');
    const [leaderboardKingScore, setLeaderboardKingScore] = useState(0);
    const [lastLeaderboardKingTimestamp, setLastLeaderboardKingTimestamp] = useState(0);

    // 📺 STREAM EMBED - Admin-controlled live stream (YouTube or Twitch)
    const [streamPlatform, setStreamPlatform] = useState<'youtube' | 'twitch' | null>(null);
    const [youtubeEmbed, setYoutubeEmbed] = useState<string | null>(null);
    const [twitchChannel, setTwitchChannel] = useState<string | null>(null);
    const [streamMinimized, setStreamMinimized] = useState(true); // Start as PiP
    const [twitchParent, setTwitchParent] = useState('localhost');
    const [hideStreamLocally, setHideStreamLocally] = useState(false); // Admin screen-share mirror prevention
    const youtubePlayerRef = useRef<HTMLIFrameElement | null>(null);
    const youtubeWasUnmuted = useRef<boolean>(false);  // Track if user had audio on
    const [twitchMuted, setTwitchMuted] = useState(true); // Twitch starts muted

    // 📜 SCROLL-TRIGGERED EXPAND - expands PiP when user scrolls into playlist
    const [scrollExpandedMuted, setScrollExpandedMuted] = useState(false); // true = expanded by scroll (still muted)
    const hasAutoExpanded = useRef(false);   // prevent re-triggering after manual minimize
    const userManuallyMinimized = useRef(false); // respect user's choice to minimize
    const [chatDocked, setChatDocked] = useState(false); // Twitch chat docked as persistent bottom panel

    // 🔊 Expand stream + auto-unmute — users tapping expand clearly want audio
    const handleExpandStream = useCallback(() => {
        setStreamMinimized(false);
        // Unmute YouTube via iframe API
        if (streamPlatform === 'youtube' && youtubePlayerRef.current) {
            try {
                youtubePlayerRef.current.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*'
                );
            } catch (e) { /* cross-origin may fail silently */ }
        }
        // Unmute Twitch by toggling the muted param (causes iframe src reload)
        if (streamPlatform === 'twitch') {
            setTwitchMuted(false);
        }
        setScrollExpandedMuted(false); // Manual expand = user wants sound
    }, [streamPlatform]);

    // 🔇 Minimize stream + re-mute so PiP doesn't blast audio
    const handleMinimizeStream = useCallback(() => {
        setStreamMinimized(true);
        setScrollExpandedMuted(false);
        userManuallyMinimized.current = true; // Don't auto-expand again
        // Mute YouTube via iframe API
        if (streamPlatform === 'youtube' && youtubePlayerRef.current) {
            try {
                youtubePlayerRef.current.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'mute', args: [] }), '*'
                );
            } catch (e) { /* cross-origin may fail silently */ }
        }
        // Re-mute Twitch
        if (streamPlatform === 'twitch') {
            setTwitchMuted(true);
        }
    }, [streamPlatform]);

    // 🔊 Unmute after scroll-expand — user taps "Tap for sound" on expanded player
    const handleUnmuteExpanded = useCallback(() => {
        setScrollExpandedMuted(false);
        if (streamPlatform === 'youtube' && youtubePlayerRef.current) {
            try {
                youtubePlayerRef.current.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*'
                );
            } catch (e) { /* cross-origin may fail silently */ }
        }
        if (streamPlatform === 'twitch') {
            setTwitchMuted(false);
        }
    }, [streamPlatform]);

    // 📜 Scroll listener — auto-expand PiP when user scrolls into playlist
    useEffect(() => {
        const hasStream = (streamPlatform === 'youtube' && youtubeEmbed) || (streamPlatform === 'twitch' && twitchChannel);
        if (!hasStream || hideStreamLocally) return;

        const onScroll = () => {
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            // Trigger when user scrolls ~350px (roughly past the header + search bar)
            if (scrollY > 350 && streamMinimized && !hasAutoExpanded.current && !userManuallyMinimized.current) {
                hasAutoExpanded.current = true;
                setStreamMinimized(false);
                setScrollExpandedMuted(true); // Stay muted — don't scare them
            }
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [streamPlatform, youtubeEmbed, twitchChannel, hideStreamLocally, streamMinimized]);

    // ⚔️ Versus Battle state
    interface VersusBattleSong {
        id: string;
        name: string;
        artist: string;
        albumArt: string;
    }
    interface VersusBattleState {
        active: boolean;
        songA?: VersusBattleSong;
        songB?: VersusBattleSong;
        endTime?: number;
        remaining?: number;
        phase?: 'voting' | 'lightning' | 'resolved';
        isLightningRound?: boolean;
        winner?: 'A' | 'B' | null;
        userVote?: 'A' | 'B' | null;
        votesA?: number;
        votesB?: number;
    }
    const [versusBattle, setVersusBattle] = useState<VersusBattleState>({ active: false });
    const [battleCountdown, setBattleCountdown] = useState(0);
    const [isVotingInBattle, setIsVotingInBattle] = useState(false);

    // 🎬 Video Preview state
    interface VideoPreviewState {
        songId: string;
        songName: string;
        artistName: string;
        videoId: string;
        anchorRect: DOMRect;
    }
    const [videoPreview, setVideoPreview] = useState<VideoPreviewState | null>(null);
    const [isLoadingVideo, setIsLoadingVideo] = useState<string | null>(null); // Track which song is loading

    // 🎵 JUKEBOX MODE - User-controlled auto-advancing music video player
    interface JukeboxState {
        songId: string;
        videoId: string;
        song: Song;
    }
    const [jukeboxState, setJukeboxState] = useState<JukeboxState | null>(null);

    // 💣 BOMB FEATURE - Track now-playing song and bomb count from server
    interface NowPlayingState {
        songId: string;
        songName: string;
        artistName: string;
        albumArt: string;
        bombCount: number;
        bombThreshold: number;
    }
    const [nowPlaying, setNowPlaying] = useState<NowPlayingState | null>(null);
    const [hasBombedCurrentSong, setHasBombedCurrentSong] = useState(false);
    const [bombAnimating, setBombAnimating] = useState(false);

    // 🔒 UI STABILITY - Prevent song re-ordering during active interaction
    const [isUserInteracting, setIsUserInteracting] = useState(false);
    const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSortedRef = useRef<Song[]>([]);

    // Mark user as interacting (prevents re-sorting for 2 seconds after interaction)
    const markInteraction = useCallback(() => {
        setIsUserInteracting(true);
        if (interactionTimeoutRef.current) {
            clearTimeout(interactionTimeoutRef.current);
        }
        interactionTimeoutRef.current = setTimeout(() => {
            setIsUserInteracting(false);
        }, 2000); // Wait 2 seconds after last interaction before allowing re-sort
    }, []);

    // Sort songs by score - BUT respect interaction lock to prevent jumping
    const sortedSongs = useMemo(() => {
        const sorted = [...songs].sort((a, b) => {
            // Sort order: positive-score > unvoted (0) > negative-score
            // New songs enter BELOW voted songs — no leapfrogging to #1
            const aIsPositive = a.score > 0;
            const bIsPositive = b.score > 0;
            const aIsUnvoted = a.score === 0;
            const bIsUnvoted = b.score === 0;

            if (aIsPositive && !bIsPositive) return -1;
            if (!aIsPositive && bIsPositive) return 1;

            if (aIsPositive && bIsPositive) {
                if (b.score !== a.score) return b.score - a.score;
                return a.addedAt - b.addedAt;
            }

            if (aIsUnvoted && !bIsUnvoted) return -1;
            if (!aIsUnvoted && bIsUnvoted) return 1;

            if (aIsUnvoted && bIsUnvoted) {
                return b.addedAt - a.addedAt;
            }

            if (b.score !== a.score) return b.score - a.score;
            return a.addedAt - b.addedAt;
        });

        // If user is actively interacting, keep the previous order to prevent jumping
        // Only update if order actually changed meaningfully (more than position swap)
        if (isUserInteracting && lastSortedRef.current.length > 0) {
            // Check if the song IDs at top 10 positions changed
            const currentTopIds = sorted.slice(0, 10).map(s => s.id).join(',');
            const previousTopIds = lastSortedRef.current.slice(0, 10).map(s => s.id).join(',');

            if (currentTopIds !== previousTopIds) {
                // Order changed during interaction - keep previous order but update scores
                const scoreMap = new Map(sorted.map(s => [s.id, s]));
                return lastSortedRef.current
                    .filter(s => scoreMap.has(s.id)) // Remove deleted songs
                    .map(s => scoreMap.get(s.id)!) // Update with new scores
                    .concat(sorted.filter(s => !lastSortedRef.current.find(prev => prev.id === s.id))); // Add new songs
            }
        }

        // Update reference for next comparison
        lastSortedRef.current = sorted;
        return sorted;
    }, [songs, isUserInteracting]);

    // Pre-selected avatar emojis - music/DJ themed, clean and minimal
    const AVATAR_OPTIONS = ['🎧', '🎤', '🎵', '💿', '🎹', '🎸', '🎺', '🔊', '🎙️', '📻'];

    // Username and avatar state - profile entry
    const [username, setUsername] = useState<string | null>(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [userAvatar, setUserAvatar] = useState<string>('🎧'); // Default avatar
    const [avatarInput, setAvatarInput] = useState<string>('🎧');
    const [userColor, setUserColor] = useState<string>('#ffffff');
    const [colorInput, setColorInput] = useState<string>(() => {
        const colors = ['#ffffff', '#ef4444', '#f97316', '#22c55e', '#3b82f6', '#a855f7'];
        return colors[Math.floor(Math.random() * colors.length)];
    });
    const [showRulesPopover, setShowRulesPopover] = useState(false);
    const [userLocation, setUserLocation] = useState<string | null>(null);  // User's location for tracking

    // 🎯 Multi-step onboarding state (2 steps: Name → Email)
    const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
    const [emailInput, setEmailInput] = useState('');
    const [phoneInput, setPhoneInput] = useState('');
    const [isSubmittingKartra, setIsSubmittingKartra] = useState(false);
    const [kartraError, setKartraError] = useState<string | null>(null);

    // 📊 SESSION RECAP - End-of-session summary + returning user memory
    interface SessionRecap {
        date: string;
        topSongName: string | null;
        topSongRank: number | null;
        totalSongsAdded: number;
        totalVotesCast: number;
        karmaEarned: number;
        participantCount: number;
        playlistSize: number;
    }
    const [showSessionRecap, setShowSessionRecap] = useState(false);
    const [sessionRecap, setSessionRecap] = useState<SessionRecap | null>(null);
    const [lastSession, setLastSession] = useState<SessionRecap | null>(null);

    // Color options for user name
    // Color options for user name - limited to readable colors on dark background
    const COLOR_OPTIONS = [
        '#ffffff', // White
        '#ef4444', // Red
        '#f97316', // Orange (Crate Hackers brand)
        '#22c55e', // Green
        '#3b82f6', // Blue
        '#a855f7', // Purple
    ];

    // Audio preview state


    // 🎉 DOPAMINE FEATURES - Engagement state
    const [previousRanks, setPreviousRanks] = useState<Record<string, number>>({});
    const [showConfetti, setShowConfetti] = useState(false);
    const [confettiMessage, setConfettiMessage] = useState('');
    const [voteAnimation, setVoteAnimation] = useState<{ songId: string; type: 'up' | 'down' } | null>(null);
    const [recentlyMoved, setRecentlyMoved] = useState<Record<string, 'up' | 'down' | 'new'>>({});
    const [showKarmaTooltip, setShowKarmaTooltip] = useState(false);
    const [showKarmaRain, setShowKarmaRain] = useState(false);
    const [lastKarmaRainTimestamp, setLastKarmaRainTimestamp] = useState(0);

    // 📢 LIVE ACTIVITY FEED - Show what everyone is doing
    interface ActivityItem {
        id: string;
        type: 'add' | 'upvote' | 'downvote';
        userName: string;
        songName: string;
        timestamp: number;
    }
    const [liveActivity, setLiveActivity] = useState<ActivityItem[]>([]);
    const [seenActivityIds, setSeenActivityIds] = useState<Set<string>>(new Set());
    const [toastQueue, setToastQueue] = useState<ActivityItem[]>([]);

    // ⭐ KARMA SYSTEM
    interface KarmaBonuses {
        karma: number;
        bonusVotes: number;
        bonusSongAdds: number;
    }
    const [karmaBonuses, setKarmaBonuses] = useState<KarmaBonuses>({ karma: 0, bonusVotes: 0, bonusSongAdds: 0 });
    const [hasShared, setHasShared] = useState(false); // Track if user has shared this session

    // 📢 AUTO SHOUT-OUTS - Rotating encouragement messages
    const [currentShoutout, setCurrentShoutout] = useState<string | null>(null);

    // 📡 BROADCAST COUNTDOWN - Next Tuesday 8 PM ET
    const [broadcastCountdown, setBroadcastCountdown] = useState<string>('');
    const [isBroadcastLive, setIsBroadcastLive] = useState(false);

    // 📅 ADD TO CALENDAR helper - generates Google Calendar URL for Tuesday 8 PM ET
    const generateCalendarUrl = useCallback(() => {
        // Find next Tuesday 8 PM ET
        const now = new Date();
        const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        let daysUntilTuesday = (2 - etNow.getDay() + 7) % 7;
        if (daysUntilTuesday === 0 && etNow.getHours() >= 22) daysUntilTuesday = 7;

        // Build the target date in ET values
        const targetET = new Date(etNow);
        targetET.setDate(targetET.getDate() + daysUntilTuesday);
        targetET.setHours(20, 0, 0, 0); // 8 PM ET

        const endET = new Date(targetET);
        endET.setMinutes(endET.getMinutes() + 90); // 9:30 PM ET

        // Format as local time string (YYYYMMDDTHHMMSS) — NO 'Z' suffix.
        // Google Calendar interprets these as local times in the ctz timezone.
        const fmtLocal = (d: Date) => {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${yyyy}${mm}${dd}T${hh}${mi}${ss}`;
        };

        const title = encodeURIComponent('Crate Hackers Live — Vote Night 🎧');
        const details = encodeURIComponent('Add songs, vote, and build the playlist together!\n\nJoin at: https://cratehackathon.com');
        const recur = encodeURIComponent('RRULE:FREQ=WEEKLY;BYDAY=TU');

        return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmtLocal(targetET)}/${fmtLocal(endET)}&details=${details}&recur=${recur}&ctz=America/New_York`;
    }, []);

    // 📬 WAITING SCREEN RSVP - Mailing list signup for idle visitors
    const [waitingEmail, setWaitingEmail] = useState('');
    const [waitingRsvpStatus, setWaitingRsvpStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [waitingRsvpError, setWaitingRsvpError] = useState<string | null>(null);
    const [waitingRsvpAlreadyDone, setWaitingRsvpAlreadyDone] = useState(false);

    // 🎓 FIRST-TIME COACH MARKS - Guide new users
    const [showCoachMark, setShowCoachMark] = useState<'search' | 'vote' | null>(null);

    // 📡 STALE DATA INDICATOR - Show when offline
    const [consecutiveFailures, setConsecutiveFailures] = useState(0);
    const [isStale, setIsStale] = useState(false);

    useEffect(() => {
        const calcCountdown = () => {
            const now = new Date();
            // Convert to ET (America/New_York)
            const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const etDay = etNow.getDay(); // 0=Sun, 2=Tue
            const etHour = etNow.getHours();
            const etMinute = etNow.getMinutes();

            // Broadcast window: Tuesday 8 PM - 9:30 PM ET
            if (etDay === 2 && (etHour === 20 || (etHour === 21 && etMinute < 30))) {
                setIsBroadcastLive(true);
                setBroadcastCountdown('');
                return;
            }
            setIsBroadcastLive(false);

            // Calculate next Tuesday 8 PM ET
            // Build target date in ET
            const target = new Date(etNow);
            target.setHours(20, 0, 0, 0);
            let daysUntilTuesday = (2 - etDay + 7) % 7;
            // If it's Tuesday but past broadcast window, next week
            if (daysUntilTuesday === 0 && (etHour >= 22 || (etHour === 21 && etMinute >= 30))) daysUntilTuesday = 7;
            target.setDate(target.getDate() + daysUntilTuesday);

            const diff = target.getTime() - etNow.getTime();
            if (diff <= 0) {
                setBroadcastCountdown('Soon!');
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

            if (days > 0) {
                setBroadcastCountdown(`${days}d ${hours}h ${mins}m`);
            } else if (hours > 0) {
                setBroadcastCountdown(`${hours}h ${mins}m`);
            } else {
                setBroadcastCountdown(`${mins}m`);
            }
        };

        calcCountdown();
        const interval = setInterval(calcCountdown, 60_000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    // 🔄 Debounce for refresh button
    const [isRefreshCooldown, setIsRefreshCooldown] = useState(false);

    // 🎮 NEW ENGAGEMENT FEATURES
    // Quick Reactions - emoji reactions on songs
    type ReactionType = 'fire' | 'skull' | 'laugh' | 'heart';
    const [songReactions, setSongReactions] = useState<Record<string, Record<ReactionType, number>>>({});
    const [userReactions, setUserReactions] = useState<Record<string, ReactionType>>({});
    const [reactingTo, setReactingTo] = useState<string | null>(null);

    // Leaderboard - top contributors
    interface LeaderboardEntry {
        visitorId: string;
        username: string;
        score: number;
        songsInTop10: number;
        hasTopSong: boolean;
    }
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    // Predictions - guess the winner
    const [userPrediction, setUserPrediction] = useState<string | null>(null);
    const [predictionsLocked, setPredictionsLocked] = useState(false);
    const [showPredictionModal, setShowPredictionModal] = useState(false);

    // Sound effects enabled
    const [soundsEnabled, setSoundsEnabled] = useState(true);

    // 📺 SHOW CLOCK - ESPN-style segment ticker (client side)
    interface ShowClockClient {
        segments: { id: string; name: string; durationMs: number; icon: string; order: number }[];
        activeSegmentIndex: number;
        startedAt: number | null;
        segmentStartedAt: number | null;
        isRunning: boolean;
    }
    const [showClock, setShowClock] = useState<ShowClockClient | null>(null);
    const [showClockRemaining, setShowClockRemaining] = useState(0); // ms remaining in current segment
    const [showClockWarningLevel, setShowClockWarningLevel] = useState<'none' | 'amber' | 'red'>('none');
    const [showClockTransition, setShowClockTransition] = useState<string | null>(null);
    const showClockPrevIndex = useRef(-1);
    const showClockWarningFired = useRef<{ amber: boolean; red: boolean }>({ amber: false, red: false });



    // Initialize fingerprint and load saved username
    useEffect(() => {
        async function init() {
            // Get fingerprint
            const { getVisitorId } = await import('@/lib/fingerprint');
            const id = await getVisitorId();
            setVisitorId(id);

            // Set Twitch parent domain for embed validation
            setTwitchParent(window.location.hostname);

            // 🔑 Check for admin session (set by admin page login)
            try {
                const storedAdminKey = sessionStorage.getItem('crate-admin-key');
                if (storedAdminKey) {
                    // Validate the key against the backend
                    const authRes = await fetch('/api/admin/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: storedAdminKey }),
                    });
                    const authData = await authRes.json();
                    if (authData.success) {
                        setIsAdminOnFrontPage(true);
                        setAdminKey(storedAdminKey);
                        console.log('🔑 Admin mode activated on front page');
                    } else {
                        // Invalid key, clean up
                        sessionStorage.removeItem('crate-admin-key');
                    }
                }
            } catch (e) {
                // sessionStorage not available or auth failed — not admin
            }

            // 🔐 Hydrate localStorage from cookie (heals Twitch in-app browser wipes)
            persistHydrate();

            // Load saved username and avatar from persistent storage
            const savedName = persistGet('crate-username');
            const savedAvatar = persistGet('crate-avatar');
            const savedColor = persistGet('crate-color');
            const savedSounds = persistGet('crate-sounds');
            const savedLocation = persistGet('crate-location');

            if (savedName) {
                setUsername(savedName);
            }
            if (savedAvatar) {
                setUserAvatar(savedAvatar);
                setAvatarInput(savedAvatar);
            }
            if (savedColor) {
                setUserColor(savedColor);
                setColorInput(savedColor);
            }
            if (savedSounds === 'off') {
                setSoundsEnabled(false);
            }
            if (savedLocation) {
                setUserLocation(savedLocation);
            }
            // Check if admin wants to hide the stream embed on this screen
            const hideStream = persistGet('crate-admin-hide-stream');
            if (hideStream === 'true') {
                setHideStreamLocally(true);
            }
            if (!savedName) {
                setShowUsernameModal(true);
            }

            // Check if user already signed up for mailing list
            const rsvpDone = persistGet('crate-rsvp-done');
            if (rsvpDone === 'true') {
                setWaitingRsvpAlreadyDone(true);
            }

            // 📊 Load last session recap for welcome-back state
            try {
                const savedSession = persistGet('crate-last-session');
                if (savedSession) {
                    setLastSession(JSON.parse(savedSession));
                }
            } catch (e) {
                // Corrupted data, ignore
            }

            // Initialize sound effects on first interaction
            SoundEffects.init();

            // Fetch user location (IP-based)
            try {
                const geoRes = await fetch('/api/geolocation');
                const geoData = await geoRes.json();
                if (geoData.success && geoData.location?.displayLocation) {
                    const locationDisplay = geoData.location.displayLocation;
                    setUserLocation(locationDisplay);
                    persistSet('crate-location', locationDisplay);
                }
            } catch (err) {
                console.warn('Could not fetch location:', err);
            }
        }
        init();
    }, []);

    // Client-side profanity filter for usernames (uses BLOCKED_WORDS from config)
    const containsBadWord = (text: string): boolean => {
        const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
        return words.some(word => BLOCKED_WORDS.has(word));
    };

    // Save username with loading feedback
    // Step 1 → Step 2: Validate DJ name and advance to email capture
    const handleStep1Next = () => {
        const name = usernameInput.trim();
        if (name.length === 0) {
            setMessage({ type: 'error', text: 'Please enter a name' });
            return;
        }
        if (containsBadWord(name)) {
            setMessage({ type: 'error', text: 'Please choose an appropriate username' });
            return;
        }
        setOnboardingStep(2);
    };

    // (Step 2 "Are you a DJ?" removed — isProfessionalDJ was never used in the codebase)

    // Step 3: Submit to Kartra and complete onboarding
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const handleOnboardingComplete = async () => {
        const name = usernameInput.trim();
        const email = emailInput.trim();

        if (!email || !isValidEmail(email)) {
            setKartraError('Enter a valid email address');
            return;
        }

        setIsSubmittingKartra(true);
        setKartraError(null);

        // Fire Kartra lead creation (non-blocking to login)
        try {
            await fetch('/api/kartra', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    phone: phoneInput.trim() || undefined,
                    firstName: name,
                }),
            });
        } catch (err) {
            // Don't block onboarding if Kartra fails — just log it
            console.warn('Kartra submission failed (non-blocking):', err);
        }

        // Now complete the actual login (same logic as before)
        setIsSavingUsername(true);
        await new Promise(resolve => setTimeout(resolve, 200));
        setUsername(name);
        persistSet('crate-username', name);
        if (avatarInput) {
            persistSet('crate-avatar', avatarInput);
            setUserAvatar(avatarInput);
        }
        persistSet('crate-color', colorInput);
        setUserColor(colorInput);
        setIsSavingUsername(false);
        setIsSubmittingKartra(false);
        setShowUsernameModal(false);
        setOnboardingStep(1); // Reset for next time
        setMessage({ type: 'success', text: `Welcome, ${name}! You're in. 🎧` });

        // Mark RSVP as done to suppress duplicate email capture on waiting screen
        setWaitingRsvpAlreadyDone(true);
        persistSet('crate-rsvp-done', 'true');

        // Sync all state to cookie for Twitch resilience
        persistSyncToCookie();

        // Show first-time coach mark after a short delay
        const coachDone = persistGet('crate-coach-done');
        if (!coachDone) {
            setTimeout(() => setShowCoachMark('search'), 1500);
        }
    };

    // Skip Step 3: Let users in without email capture
    const handleSkipOnboarding = async () => {
        const name = usernameInput.trim();
        setIsSavingUsername(true);
        await new Promise(resolve => setTimeout(resolve, 200));
        setUsername(name);
        persistSet('crate-username', name);
        if (avatarInput) {
            persistSet('crate-avatar', avatarInput);
            setUserAvatar(avatarInput);
        }
        persistSet('crate-color', colorInput);
        setUserColor(colorInput);
        setIsSavingUsername(false);
        setShowUsernameModal(false);
        setOnboardingStep(1);
        setMessage({ type: 'success', text: `Welcome, ${name}! 🎧` });

        // Sync all state to cookie for Twitch resilience
        persistSyncToCookie();

        // Show first-time coach mark after a short delay
        const coachDone = persistGet('crate-coach-done');
        if (!coachDone) {
            setTimeout(() => setShowCoachMark('search'), 1500);
        }
    };

    // Legacy handler for profile editing (re-opening modal when already logged in)
    const handleSetUsername = async () => {
        const name = usernameInput.trim();
        if (name.length === 0) {
            setMessage({ type: 'error', text: 'Please enter a name' });
            return;
        }
        if (containsBadWord(name)) {
            setMessage({ type: 'error', text: 'Please choose an appropriate username' });
            return;
        }
        setIsSavingUsername(true);
        await new Promise(resolve => setTimeout(resolve, 200));
        setUsername(name);
        persistSet('crate-username', name);
        if (avatarInput) {
            persistSet('crate-avatar', avatarInput);
            setUserAvatar(avatarInput);
        }
        persistSet('crate-color', colorInput);
        setUserColor(colorInput);
        setIsSavingUsername(false);
        setShowUsernameModal(false);
        setMessage({ type: 'success', text: 'Profile updated!' });

        // Sync all state to cookie for Twitch resilience
        persistSyncToCookie();
    };

    // Fetch playlist data with rank tracking for dopamine effects
    // Use refs to avoid stale closures in the callback dependencies
    const previousRanksRef = useRef(previousRanks);
    previousRanksRef.current = previousRanks;
    const seenActivityIdsRef = useRef(seenActivityIds);
    seenActivityIdsRef.current = seenActivityIds;
    const lastKarmaRainTimestampRef = useRef(lastKarmaRainTimestamp);
    lastKarmaRainTimestampRef.current = lastKarmaRainTimestamp;
    const lastPrizeDropTimestampRef = useRef(lastPrizeDropTimestamp);
    lastPrizeDropTimestampRef.current = lastPrizeDropTimestamp;
    const lastLeaderboardKingTimestampRef = useRef(lastLeaderboardKingTimestamp);
    lastLeaderboardKingTimestampRef.current = lastLeaderboardKingTimestamp;

    const fetchPlaylist = useCallback(async (showRefreshIndicator = false) => {
        if (!visitorId) return;
        if (showRefreshIndicator) setIsRefreshing(true);

        try {
            const res = await fetchWithRetry('/api/songs', {
                headers: { 'x-visitor-id': visitorId },
            }, 2, 8000); // 2 retries, 8 second timeout

            const data = await res.json();
            const newSongs: Song[] = data.songs;

            // Reset stale indicator on successful fetch
            setConsecutiveFailures(0);
            if (isStale) setIsStale(false);

            // 🎉 DOPAMINE: Track rank changes
            const newRanks: Record<string, number> = {};
            const rankChanges: Record<string, 'up' | 'down' | 'new'> = {};

            // Sort to get current ranks (matching main sorting logic)
            const sorted = [...newSongs].sort((a, b) => {
                const aIsPositive = a.score > 0;
                const bIsPositive = b.score > 0;
                const aIsUnvoted = a.score === 0;
                const bIsUnvoted = b.score === 0;

                if (aIsPositive && !bIsPositive) return -1;
                if (!aIsPositive && bIsPositive) return 1;

                if (aIsPositive && bIsPositive) {
                    if (b.score !== a.score) return b.score - a.score;
                    return a.addedAt - b.addedAt;
                }

                if (aIsUnvoted && !bIsUnvoted) return -1;
                if (!aIsUnvoted && bIsUnvoted) return 1;

                if (aIsUnvoted && bIsUnvoted) {
                    return b.addedAt - a.addedAt;
                }

                if (b.score !== a.score) return b.score - a.score;
                return a.addedAt - b.addedAt;
            });

            sorted.forEach((song, index) => {
                const rank = index + 1;
                newRanks[song.id] = rank;

                const prevRank = previousRanksRef.current[song.id];
                if (prevRank === undefined) {
                    // New song added!
                    rankChanges[song.id] = 'new';
                } else if (rank < prevRank) {
                    // Song moved UP
                    rankChanges[song.id] = 'up';

                    // 🎊 CONFETTI: If YOUR song hits top 3
                    if (rank <= 3 && prevRank > 3 && song.addedBy === visitorId) {
                        setConfettiMessage(`🎉 Your song "${song.name}" hit #${rank}!`);
                        setShowConfetti(true);
                        setTimeout(() => setShowConfetti(false), 3000);
                    }
                } else if (rank > prevRank) {
                    // Song moved DOWN
                    rankChanges[song.id] = 'down';
                }
            });

            setPreviousRanks(newRanks);
            setRecentlyMoved(rankChanges);

            // Clear movement indicators after animation
            setTimeout(() => setRecentlyMoved({}), 2000);

            setSongs(newSongs);
            setUserVotes(data.userVotes);
            setUserStatus(data.userStatus);
            setIsLocked(data.isLocked);
            if (data.playlistTitle) setPlaylistTitle(data.playlistTitle);
            if (data.karmaBonuses) setKarmaBonuses(data.karmaBonuses);
            if (data.playlistStats) setPlaylistStats(data.playlistStats);
            if (data.viewerCount !== undefined) setViewerCount(data.viewerCount);
            if (data.deleteWindow) {
                setDeleteWindow(data.deleteWindow);
                if (data.deleteWindow.active && data.deleteWindow.remaining > 0) {
                    setDeleteWindowRemaining(data.deleteWindow.remaining);
                }
            }

            // 🎚️ Sync session permissions
            if (data.permissions) {
                setPermissions(data.permissions);
            }

            // 📺 Sync stream config (YouTube / Twitch)
            if (data.streamConfig) {
                setStreamPlatform(data.streamConfig.platform || null);
                if (data.streamConfig.platform === 'youtube' && data.streamConfig.youtubeUrl) {
                    const videoId = extractYouTubeId(data.streamConfig.youtubeUrl);
                    setYoutubeEmbed(videoId);
                    setTwitchChannel(null);
                } else if (data.streamConfig.platform === 'twitch' && data.streamConfig.twitchChannel) {
                    setTwitchChannel(data.streamConfig.twitchChannel);
                    setYoutubeEmbed(null);
                } else {
                    setYoutubeEmbed(null);
                    setTwitchChannel(null);
                }
            } else if (data.youtubeEmbed !== undefined) {
                // Legacy compat
                const videoId = data.youtubeEmbed ? extractYouTubeId(data.youtubeEmbed) : null;
                setYoutubeEmbed(videoId);
                setStreamPlatform(videoId ? 'youtube' : null);
            }

            // ⚔️ Handle Versus Battle data
            if (data.versusBattle) {
                // If lightning round started, server resets votes - sync local state
                const newBattle = data.versusBattle;
                setVersusBattle(prev => {
                    // If transitioning to lightning round, clear local vote state
                    if (newBattle.isLightningRound && !prev.isLightningRound && newBattle.userVote === null) {
                        return { ...newBattle, userVote: null };
                    }
                    // If battle just became inactive (resolved or cancelled), auto-dismiss after 5 seconds
                    if (!newBattle.active && prev.active) {
                        setTimeout(() => setVersusBattle({ active: false }), 5000);
                    }
                    return newBattle;
                });
                if (newBattle.active && newBattle.endTime) {
                    setBattleCountdown(Math.max(0, newBattle.endTime - Date.now()));
                }
            }

            // 🌧️ Handle Karma Rain celebration
            if (data.karmaRain && data.karmaRain.active && data.karmaRain.timestamp > lastKarmaRainTimestampRef.current) {
                setLastKarmaRainTimestamp(data.karmaRain.timestamp);
                setShowKarmaRain(true);
                setConfettiMessage(`🌧️ Karma Rain! +1 karma for everyone`);
                setShowConfetti(true);
                setTimeout(() => {
                    setShowKarmaRain(false);
                    setShowConfetti(false);
                }, 5000);
            }

            // 🎰 Handle Golden Hour Prize Drop
            if (data.prizeDrop && data.prizeDrop.active && data.prizeDrop.timestamp > lastPrizeDropTimestampRef.current) {
                setLastPrizeDropTimestamp(data.prizeDrop.timestamp);
                const isWinner = data.prizeDrop.winnerVisitorId === visitorId;
                setPrizeDropIsWinner(isWinner);
                setPrizeDropWinnerName(data.prizeDrop.winnerName || 'Someone');
                setShowPrizeDrop(true);
                if (isWinner) {
                    SoundEffects.victory();
                    // Auto-dismiss winner view after 20s (long enough to read & click claim link)
                    setTimeout(() => setShowPrizeDrop(false), 20000);
                } else {
                    SoundEffects.karmaRain();
                    // Auto-dismiss viewer announcement after 8s
                    setTimeout(() => setShowPrizeDrop(false), 8000);
                }
            }

            // 👑 Handle Leaderboard King announcement
            if (data.leaderboardKing && data.leaderboardKing.active && data.leaderboardKing.timestamp > lastLeaderboardKingTimestampRef.current) {
                setLastLeaderboardKingTimestamp(data.leaderboardKing.timestamp);
                const isMe = data.leaderboardKing.winnerVisitorId === visitorId;
                setLeaderboardKingIsMe(isMe);
                setLeaderboardKingName(data.leaderboardKing.winnerName || 'Someone');
                setLeaderboardKingScore(data.leaderboardKing.score || 0);
                setShowLeaderboardKing(true);
                if (isMe) {
                    SoundEffects.victory();
                }
                // Auto-dismiss after 5s max
                setTimeout(() => setShowLeaderboardKing(false), 5000);
            }

            // 📺 Sync Show Clock state
            if (data.showClock && data.showClock.isRunning) {
                setShowClock(data.showClock);
            } else if (data.showClock && !data.showClock.isRunning && showClock?.isRunning) {
                // Show just ended
                setShowClock(null);
                setShowClockWarningLevel('none');
            } else if (!data.showClock || !data.showClock.isRunning) {
                setShowClock(null);
            }

            // ⏱️ Extract timer data from the merged response (eliminates separate /api/timer fetch)
            if (data.timer) {
                setTimerRunning(data.timer.running);
                setTimerEndTime(data.timer.endTime);
                setIsBanned(data.timer.isBanned);

                if (data.timer.running && data.timer.endTime) {
                    setTimerRemaining(Math.max(0, data.timer.endTime - Date.now()));
                } else {
                    setTimerRemaining(0);
                }
            }

            // 💣 Sync now-playing + bomb count from server
            if (data.nowPlaying) {
                setNowPlaying(prev => {
                    // If song changed, reset local bomb state
                    if (!prev || prev.songId !== data.nowPlaying.songId) {
                        setHasBombedCurrentSong(false);
                    }
                    return {
                        songId: data.nowPlaying.songId,
                        songName: data.nowPlaying.songName,
                        artistName: data.nowPlaying.artistName,
                        albumArt: data.nowPlaying.albumArt,
                        bombCount: data.nowPlaying.bombCount,
                        bombThreshold: data.nowPlaying.bombThreshold,
                    };
                });
            } else {
                setNowPlaying(null);
            }

            // 📢 Process live activity from server
            if (data.recentActivity && Array.isArray(data.recentActivity)) {
                const newActivities = data.recentActivity.filter(
                    (activity: ActivityItem) => !seenActivityIdsRef.current.has(activity.id)
                );

                if (newActivities.length > 0) {
                    // Mark as seen — cap at 500 to prevent unbounded growth over long sessions
                    setSeenActivityIds(prev => {
                        const newSet = new Set(prev);
                        newActivities.forEach((a: ActivityItem) => newSet.add(a.id));
                        // Prune oldest entries if set grows too large (8hr stream protection)
                        if (newSet.size > 500) {
                            const entries = Array.from(newSet);
                            return new Set(entries.slice(entries.length - 250));
                        }
                        return newSet;
                    });

                    // Add to toast queue (newest first)
                    setToastQueue(prev => [...newActivities, ...prev].slice(0, 5));
                }
            }
        } catch (error: any) {
            console.error('Failed to fetch playlist:', error);
            // Track consecutive failures for stale data indicator
            setConsecutiveFailures(prev => {
                const newCount = prev + 1;
                if (newCount >= 3) setIsStale(true);
                return newCount;
            });
            // Show user-friendly error for network issues
            if (error.message?.includes('timed out') || error.message?.includes('connection')) {
                setMessage({ type: 'error', text: 'Slow connection - retrying...' });
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [visitorId]);

    // Fetch timer status
    // Timer data is now merged into the /api/songs response — no separate fetchTimer needed.
    // This eliminates one HTTP request per poll cycle (~50% reduction in polling traffic).

    // Initial fetch
    useEffect(() => {
        if (visitorId) {
            fetchPlaylist();
        }
    }, [fetchPlaylist, visitorId]);

    // 📢 Auto-clear toast notifications after 8 seconds
    useEffect(() => {
        if (toastQueue.length === 0) return;

        const timeout = setTimeout(() => {
            setToastQueue(prev => prev.slice(0, -1)); // Remove oldest
        }, 8000);

        return () => clearTimeout(timeout);
    }, [toastQueue]);

    // 💡 Periodic tips in activity feed - engaging, dopamine-inducing hints
    useEffect(() => {
        let tipIndex = 0;

        const tipInterval = setInterval(() => {
            const tip: ActivityItem = {
                id: `tip-${Date.now()}`,
                type: 'add',
                userName: 'System',
                songName: GAME_TIPS[tipIndex % GAME_TIPS.length],
                timestamp: Date.now(),
            };
            setToastQueue(prev => [tip, ...prev.slice(0, 2)]); // Add tip, keep max 3
            tipIndex++;
        }, 90000); // Every 90 seconds (reduced from 45s to minimize noise)

        return () => clearInterval(tipInterval);
    }, []);

    // REAL-TIME POLLING - optimized for 1000+ concurrent users
    // Uses 15s base interval + random jitter to prevent thundering herd
    // Timer data is now merged into the songs response — single fetch per cycle
    useEffect(() => {
        if (!visitorId) return;

        // Add random jitter (0-5 seconds) to spread out requests
        const jitter = Math.random() * 5000;
        const baseInterval = 15000; // 15 seconds base

        // Initial delayed start with jitter
        const initialTimeout = setTimeout(fetchPlaylist, jitter);

        // Subsequent polls at regular interval
        const interval = setInterval(fetchPlaylist, baseInterval);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [visitorId, fetchPlaylist]);



    // 📢 AUTO SHOUT-OUTS - Generate encouraging messages
    useEffect(() => {
        if (sortedSongs.length === 0 || !timerRunning) {
            setCurrentShoutout(null);
            return;
        }

        const generateShoutout = () => {
            const shoutouts: string[] = [];

            // Top song shoutout
            if (sortedSongs.length > 0) {
                const topSong = sortedSongs[0];
                shoutouts.push(`🔥 "${topSong.name}" by ${topSong.addedByName} is dominating at #1!`);
            }

            // Hot competition
            if (sortedSongs.length >= 3) {
                const top3 = sortedSongs.slice(0, 3);
                if (top3[0].score - top3[2].score <= 2) {
                    shoutouts.push(`⚔️ It's a tight race! Top 3 songs are neck and neck!`);
                }
            }

            // Underdog rising
            if (sortedSongs.length >= 5) {
                const fourthSong = sortedSongs[3];
                if (fourthSong.score > 0) {
                    shoutouts.push(`🚀 "${fourthSong.name}" is pushing for the top 3!`);
                }
            }

            // Random encouragement
            const encouragements = [
                `👍 Use your upvote to champion your favorite!`,
                `👎 Got a song you don't like? Downvote it!`,
                `💿 ${sortedSongs.length} tracks and counting!`,
            ];
            shoutouts.push(...encouragements);

            // Pick random shoutout
            const randomShoutout = shoutouts[Math.floor(Math.random() * shoutouts.length)];
            setCurrentShoutout(randomShoutout);
        };

        generateShoutout();
        const shoutoutInterval = setInterval(generateShoutout, 7000); // Rotate every 7 seconds

        return () => clearInterval(shoutoutInterval);
    }, [sortedSongs, timerRunning]);

    // ⏱️ LOYALTY REWARD - Track time on page for karma
    useEffect(() => {
        if (!visitorId) return;

        // Set a timer for 5 minutes (300,000 ms)
        const loyaltyTimer = setTimeout(async () => {
            try {
                const res = await fetch('/api/karma', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-visitor-id': visitorId,
                    },
                    body: JSON.stringify({ action: 'presence' }),
                });

                const data = await res.json();
                if (data.success) {
                    setMessage({ type: 'success', text: '+1 Karma for being active!' });
                    setConfettiMessage('🎉 +1 Karma for being active!');
                    setShowConfetti(true);
                    setTimeout(() => setShowConfetti(false), 4000);
                    // Refresh stats
                    fetchPlaylist();
                }
            } catch (err) {
                // Show subtle feedback on error (non-blocking)
                console.warn('Karma presence check failed:', err);
            }
        }, 300000); // 5 minutes

        return () => clearTimeout(loyaltyTimer);
    }, [visitorId, fetchPlaylist]);

    // Update timer display every second (local countdown only)
    useEffect(() => {
        if (!timerRunning || !timerEndTime) return;

        const interval = setInterval(() => {
            const remaining = Math.max(0, timerEndTime - Date.now());
            setTimerRemaining(remaining);

            if (remaining <= 0) {
                setTimerRunning(false);
                setIsLocked(true);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [timerRunning, timerEndTime]);

    // 📺 SHOW CLOCK LOCAL COUNTDOWN - updates every second, fires warning sounds
    useEffect(() => {
        if (!showClock?.isRunning || !showClock.segmentStartedAt) return;

        const tick = () => {
            const seg = showClock.segments[showClock.activeSegmentIndex];
            if (!seg) return;
            const elapsed = Date.now() - showClock.segmentStartedAt!;
            const remaining = Math.max(0, seg.durationMs - elapsed);
            setShowClockRemaining(remaining);

            // Check for segment transition
            if (showClock.activeSegmentIndex !== showClockPrevIndex.current) {
                showClockPrevIndex.current = showClock.activeSegmentIndex;
                showClockWarningFired.current = { amber: false, red: false };
                // Play transition sound and show splash
                if (soundsEnabled) SoundEffects.segmentTransition();
                const nextSeg = showClock.segments[showClock.activeSegmentIndex];
                if (nextSeg) {
                    setShowClockTransition(`${nextSeg.icon} ${nextSeg.name}`);
                    setTimeout(() => setShowClockTransition(null), 4000);
                }
            }

            // Countdown warnings
            if (remaining <= BROADCAST.segmentUrgentMs && remaining > 0 && !showClockWarningFired.current.red) {
                showClockWarningFired.current.red = true;
                setShowClockWarningLevel('red');
                if (soundsEnabled) SoundEffects.segmentUrgent();
            } else if (remaining <= BROADCAST.segmentWarningMs && remaining > BROADCAST.segmentUrgentMs && !showClockWarningFired.current.amber) {
                showClockWarningFired.current.amber = true;
                setShowClockWarningLevel('amber');
                if (soundsEnabled) SoundEffects.segmentWarning();
            } else if (remaining > BROADCAST.segmentWarningMs) {
                setShowClockWarningLevel('none');
            }
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [showClock, soundsEnabled]);

    // 🏆 WINNER DETECTION + SESSION RECAP - When round ends
    useEffect(() => {
        // Detect transition from running to stopped (round ended)
        if (previousTimerRunning.current && !timerRunning && songs.length > 0) {
            // Get the #1 song
            const topSong = songs[0];
            // Check if current user added the winning song
            if (topSong && topSong.addedBy === visitorId) {
                setWinnerSongName(topSong.name);
                setShowWinnerSplash(true);
                // Auto-dismiss after 15s (long enough to read & click claim link)
                setTimeout(() => setShowWinnerSplash(false), 15000);
            }

            // 📊 SESSION RECAP - Compute and save personalized summary
            const mySongs = songs.filter(s => s.addedBy === visitorId);
            const sorted = [...songs].sort((a, b) => {
                const aIsPositive = a.score > 0;
                const bIsPositive = b.score > 0;
                const aIsUnvoted = a.score === 0;
                const bIsUnvoted = b.score === 0;
                if (aIsPositive && !bIsPositive) return -1;
                if (!aIsPositive && bIsPositive) return 1;
                if (aIsPositive && bIsPositive) {
                    if (b.score !== a.score) return b.score - a.score;
                    return a.addedAt - b.addedAt;
                }
                if (aIsUnvoted && !bIsUnvoted) return -1;
                if (!aIsUnvoted && bIsUnvoted) return 1;
                if (aIsUnvoted && bIsUnvoted) return b.addedAt - a.addedAt;
                if (b.score !== a.score) return b.score - a.score;
                return a.addedAt - b.addedAt;
            });

            // Find best-ranked song by this user
            let bestRank: number | null = null;
            let bestSongName: string | null = null;
            sorted.forEach((s, i) => {
                if (s.addedBy === visitorId && (bestRank === null || i + 1 < bestRank)) {
                    bestRank = i + 1;
                    bestSongName = s.name;
                }
            });

            const recap: SessionRecap = {
                date: new Date().toISOString(),
                topSongName: bestSongName,
                topSongRank: bestRank,
                totalSongsAdded: mySongs.length,
                totalVotesCast: (userVotes.upvotedSongIds?.length || 0) + (userVotes.downvotedSongIds?.length || 0),
                karmaEarned: karmaBonuses.karma || 0,
                participantCount: viewerCount || 0,
                playlistSize: songs.length,
            };

            setSessionRecap(recap);
            setLastSession(recap);

            // Show recap overlay after a brief delay (let winner splash show first if applicable)
            const recapDelay = topSong?.addedBy === visitorId ? 6000 : 1500;
            setTimeout(() => setShowSessionRecap(true), recapDelay);
            // Auto-dismiss recap after 20s so it doesn't stay on screen forever
            setTimeout(() => setShowSessionRecap(false), recapDelay + 20000);

            // Persist for welcome-back state (dual-layer: localStorage + cookie)
            persistSet('crate-last-session', JSON.stringify(recap));
        }
        previousTimerRunning.current = timerRunning;
    }, [timerRunning, songs, visitorId, userVotes, karmaBonuses, viewerCount]);

    // 📺 YOUTUBE/JUKEBOX SYNC - Mute YouTube when Jukebox opens, restore when it closes
    useEffect(() => {
        const iframe = youtubePlayerRef.current;
        if (!iframe) return;

        const postMessage = (cmd: string) => {
            try {
                iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: cmd, args: [] }), '*');
            } catch (e) {
                // Cross-origin posting may fail silently, that's ok
            }
        };

        if (jukeboxState) {
            // Jukebox opened - record current state and mute YouTube stream
            youtubeWasUnmuted.current = true; // Assume user might have audio on
            postMessage('mute');
            // Auto-minimize stream to PiP so jukebox has focus
            if (!streamMinimized) {
                setStreamMinimized(true);
            }
        } else if (youtubeWasUnmuted.current) {
            // Jukebox closed - restore audio if user had it on
            postMessage('unMute');
            youtubeWasUnmuted.current = false;
        }
    }, [jukeboxState]);

    // 🔥 DELETE WINDOW COUNTDOWN - local countdown for chaos mode
    useEffect(() => {
        if (!deleteWindow.active || !deleteWindow.endTime) {
            setDeleteWindowRemaining(0);
            return;
        }

        const interval = setInterval(() => {
            const remaining = Math.max(0, deleteWindow.endTime! - Date.now());
            setDeleteWindowRemaining(remaining);

            if (remaining <= 0) {
                setDeleteWindow(prev => ({ ...prev, active: false, canDelete: false }));
                fetchPlaylist(); // Refresh when window ends
            }
        }, 1000); // Update every second (was 100ms — countdown only shows seconds)

        return () => clearInterval(interval);
    }, [deleteWindow.active, deleteWindow.endTime, fetchPlaylist]);

    // 🎰 PURGE SPLASH - Show full-screen announcement when Purge first activates
    useEffect(() => {
        if (deleteWindow.active && !previousPurgeActive) {
            // Purge just started! Show the mega splash
            setShowPurgeSplash(true);
            // 🔊 Play dramatic alarm sound
            SoundEffects.purgeAlarm();
            // Auto-dismiss after 3 seconds
            setTimeout(() => setShowPurgeSplash(false), 3000);
        }
        setPreviousPurgeActive(deleteWindow.active);
    }, [deleteWindow.active, previousPurgeActive]);

    // 🌧️ KARMA RAIN SPLASH - Enhanced full-screen celebration
    useEffect(() => {
        if (showKarmaRain) {
            setShowKarmaRainSplash(true);
            // 🔊 Play magical karma sound
            SoundEffects.karmaRain();
            // Auto-dismiss after 4 seconds
            setTimeout(() => setShowKarmaRainSplash(false), 4000);
        }
    }, [showKarmaRain]);

    // 🗑️ WIPE DETECTION - Show splash when playlist is wiped
    useEffect(() => {
        if (previousSongCount !== null && previousSongCount > 5 && songs.length === 0) {
            // Playlist was wiped! Show the mega splash
            setShowWipeSplash(true);
            setTimeout(() => setShowWipeSplash(false), 3000);
        }
        setPreviousSongCount(songs.length);
    }, [songs.length, previousSongCount]);

    // 🗑️ Handle window delete (chaos mode delete)
    const handleWindowDelete = async (songId: string) => {
        if (!visitorId || !deleteWindow.canDelete || isDeleting) return;

        setIsDeleting(true);
        try {
            const res = await fetch('/api/songs/window-delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                },
                body: JSON.stringify({ songId }),
            });

            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: '💥 Song removed' });
                setDeleteWindow(prev => ({ ...prev, canDelete: false }));
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to delete' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error' });
        } finally {
            setIsDeleting(false);
        }
    };

    // ⚔️ VERSUS BATTLE COUNTDOWN
    useEffect(() => {
        if (!versusBattle.active || !versusBattle.endTime) {
            setBattleCountdown(0);
            return;
        }

        const interval = setInterval(() => {
            const remaining = Math.max(0, versusBattle.endTime! - Date.now());
            setBattleCountdown(remaining);

            if (remaining <= 0) {
                // Battle ended - refresh to get results
                fetchPlaylist();
            }
        }, 1000); // Update every second (was 100ms — countdown only shows seconds)

        return () => clearInterval(interval);
    }, [versusBattle.active, versusBattle.endTime, fetchPlaylist]);

    // ⚔️ Vote in Versus Battle (one and done)
    const handleBattleVote = async (choice: 'A' | 'B') => {
        if (!visitorId || isVotingInBattle || versusBattle.userVote) return;

        setIsVotingInBattle(true);

        // Optimistic update
        const previousVote = versusBattle.userVote;
        setVersusBattle(prev => ({ ...prev, userVote: choice }));

        try {
            const res = await fetch('/api/versus-battle/vote', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                },
                body: JSON.stringify({ choice }),
            });

            const data = await res.json();
            if (!res.ok) {
                // Revert optimistic update to previous state
                setVersusBattle(prev => ({ ...prev, userVote: previousVote }));
                setMessage({ type: 'error', text: data.error || 'Failed to vote' });
            } else {
                setMessage({ type: 'success', text: '⚔️ Vote locked in!' });
            }
        } catch (error) {
            // Revert optimistic update on network error
            setVersusBattle(prev => ({ ...prev, userVote: previousVote }));
            setMessage({ type: 'error', text: 'Connection issue — try again' });
        } finally {
            setIsVotingInBattle(false);
        }
    };

    // Format timer display (supports days, hours, minutes, seconds)
    const formatTime = (ms: number) => {
        const totalSeconds = Math.ceil(ms / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (days > 0) {
            return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Search songs
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }

        const timeout = setTimeout(async () => {
            setIsSearching(true);
            setNoSearchResults(false);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
                const data = await res.json();
                const tracks = data.tracks || [];
                setSearchResults(tracks);
                setShowResults(true);
                // Show "no results" feedback if search returned nothing
                if (tracks.length === 0 && searchQuery.trim().length > 2) {
                    setNoSearchResults(true);
                    setMessage({ type: 'error', text: `No songs found for "${searchQuery}"` });
                }
            } catch (error) {
                console.error('Search failed:', error);
                setMessage({ type: 'error', text: 'Search failed — try again' });
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [searchQuery]);

    // Add song with loading feedback
    const handleAddSong = async (track: SearchResult) => {
        if (!visitorId || (!username && !isAdminOnFrontPage)) {
            setMessage({ type: 'error', text: 'Set your name first' });
            return;
        }

        // Prevent double-clicks
        if (isAddingSong === track.id) return;

        setIsAddingSong(track.id);
        try {
            const res = await fetch('/api/songs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                    ...(isAdminOnFrontPage && adminKey ? { 'x-admin-key': adminKey } : {}),
                },
                body: JSON.stringify({ ...track, addedByName: username || 'Admin', addedByAvatar: userAvatar, addedByColor: userColor, addedByLocation: userLocation || undefined }),
            });

            const data = await res.json();

            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Couldn\'t add that song — try again' });
                return;
            }

            setMessage({ type: 'success', text: `✓ "${track.name}" added to playlist` });
            setSearchQuery('');
            setShowResults(false);
            setNoSearchResults(false);
            fetchPlaylist();

            // Advance coach mark: after first song add, show vote coach mark
            if (showCoachMark === 'search') {
                setShowCoachMark('vote');
            }

            // 🔊 Play sound effect
            if (soundsEnabled) {
                SoundEffects.addSong();
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Couldn\'t connect — try adding again' });
        } finally {
            setIsAddingSong(null);
        }
    };

    // 🔥 Handle reaction toggle on a song
    const handleReaction = async (songId: string, reaction: ReactionType) => {
        if (!visitorId) return;

        setReactingTo(songId);

        try {
            const res = await fetch('/api/reactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                },
                body: JSON.stringify({ songId, reaction }),
            });

            const data = await res.json();

            if (data.success) {
                // Update local state
                setSongReactions(prev => ({
                    ...prev,
                    [songId]: data.counts,
                }));

                if (data.action === 'added') {
                    setUserReactions(prev => ({ ...prev, [songId]: reaction }));
                } else {
                    setUserReactions(prev => {
                        const next = { ...prev };
                        delete next[songId];
                        return next;
                    });
                }

                // 🔊 Play sound
                if (soundsEnabled) {
                    SoundEffects.reaction();
                }
            }
        } catch (error) {
            console.error('Reaction error:', error);
        } finally {
            setReactingTo(null);
        }
    };

    // 🎯 Handle prediction submission
    const handleMakePrediction = async (songId: string) => {
        if (!visitorId) return;

        try {
            const res = await fetch('/api/predictions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                },
                body: JSON.stringify({ songId }),
            });

            const data = await res.json();

            if (data.success) {
                setUserPrediction(songId);
                setShowPredictionModal(false);
                setMessage({ type: 'success', text: '🎯 Prediction locked in!' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Couldn\'t save your prediction — try again' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Connection issue — try again' });
        }
    };

    // 🏆 Fetch leaderboard
    const fetchLeaderboard = async () => {
        try {
            const res = await fetch('/api/leaderboard');
            const data = await res.json();
            if (data.leaderboard) {
                setLeaderboard(data.leaderboard);
            }
        } catch (error) {
            console.error('Leaderboard fetch error:', error);
        }
    };

    // 🎯 Fetch prediction status
    const fetchPredictionStatus = async () => {
        if (!visitorId) return;
        try {
            const res = await fetch('/api/predictions', {
                headers: { 'x-visitor-id': visitorId },
            });
            const data = await res.json();
            setPredictionsLocked(data.isLocked);
            setUserPrediction(data.userPrediction);
        } catch (error) {
            console.error('Prediction status error:', error);
        }
    };

    // 🎬 Open video preview for a song - now launches JUKEBOX MODE
    const handleOpenVideoPreview = async (songId: string, songName: string, artistName: string, event: React.MouseEvent) => {
        // If already in jukebox mode with this song, close it
        if (jukeboxState?.songId === songId) {
            setJukeboxState(null);
            return;
        }

        // If in small preview mode, close it and open jukebox
        if (videoPreview?.songId === songId) {
            setVideoPreview(null);
        }

        // Find the song in playlist
        const song = sortedSongs.find(s => s.id === songId);
        if (!song) return;

        // Set loading state
        setIsLoadingVideo(songId);

        try {
            const response = await fetch(`/api/youtube-search?song=${encodeURIComponent(songName)}&artist=${encodeURIComponent(artistName)}`);
            const data = await response.json();

            if (data.videoId) {
                // Launch JUKEBOX MODE with full-screen player
                setJukeboxState({
                    songId,
                    videoId: data.videoId,
                    song: song,
                });
                setMessage({ type: 'success', text: '🎵 Now playing music videos' });
            } else {
                // No video found - show brief message
                setMessage({ type: 'error', text: 'No video found for this song' });
                setTimeout(() => setMessage(null), 2000);
            }
        } catch (error) {
            console.error('Failed to load video:', error);
            setMessage({ type: 'error', text: 'Couldn\'t load the video' });
        } finally {
            setIsLoadingVideo(null);
        }
    };

    // 🎵 JUKEBOX: Handle advancing to next song
    const handleJukeboxNextSong = async (nextSongId: string) => {
        const nextSong = sortedSongs.find(s => s.id === nextSongId);
        if (!nextSong) {
            setJukeboxState(null);
            return;
        }

        setIsLoadingVideo(nextSongId);
        try {
            const response = await fetch(`/api/youtube-search?song=${encodeURIComponent(nextSong.name)}&artist=${encodeURIComponent(nextSong.artist)}`);
            const data = await response.json();

            if (data.videoId) {
                setJukeboxState({
                    songId: nextSongId,
                    videoId: data.videoId,
                    song: nextSong,
                });
            } else {
                // Skip songs without videos
                const currentIndex = sortedSongs.findIndex(s => s.id === nextSongId);
                if (currentIndex < sortedSongs.length - 1) {
                    handleJukeboxNextSong(sortedSongs[currentIndex + 1].id);
                } else {
                    setJukeboxState(null);
                    setMessage({ type: 'success', text: '🎉 Playlist complete! Thanks for listening.' });
                }
            }
        } catch (error) {
            console.error('Failed to load next video:', error);
            setJukeboxState(null);
        } finally {
            setIsLoadingVideo(null);
        }
    };

    // 🎵 JUKEBOX: Handle karma earned from watching
    const handleJukeboxKarmaEarned = async () => {
        if (!visitorId) return;

        try {
            const res = await fetch('/api/karma', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                },
                body: JSON.stringify({ action: 'jukebox' }),
            });

            const data = await res.json();
            if (data.success) {
                setConfettiMessage('🎧 +1 Karma for watching!');
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 3000);
                fetchPlaylist(); // Refresh to show updated karma
            }
        } catch (error) {
            console.warn('Failed to award jukebox karma:', error);
        }
    };

    // 💣 BOMB: Handle bombing the currently playing song
    const handleBombSong = async (songId: string) => {
        if (!visitorId || hasBombedCurrentSong) return;

        setHasBombedCurrentSong(true);
        setBombAnimating(true);
        setTimeout(() => setBombAnimating(false), 600);

        try {
            const res = await fetch('/api/songs/bomb', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                },
                body: JSON.stringify({ songId }),
            });

            const data = await res.json();
            if (data.success) {
                // Update local bomb count immediately for responsiveness
                setNowPlaying(prev => prev ? { ...prev, bombCount: data.bombCount } : null);

                if (data.bombed) {
                    // Song was bombed off! The JukeboxPlayer will handle the skip via its own effect
                    setMessage({ type: 'success', text: '💣💥 Song BOMBED! Skipping...' });
                }
            } else if (data.error) {
                setMessage({ type: 'error', text: data.error });
            }
        } catch (error) {
            console.warn('Failed to bomb song:', error);
            setHasBombedCurrentSong(false); // Allow retry on error
        }
    };


    // Vote on song - NEW MODEL: user gets ONE upvote and ONE downvote total
    const handleVote = async (songId: string, vote: 1 | -1) => {
        if (!visitorId) {
            toast.info('Loading...');
            return;
        }
        if (isBanned) {
            toast.error('A moderator paused your access');
            return;
        }

        // 🔒 Participation gate — explain WHY voting is unavailable
        const sessionActive = timerRunning && timerRemaining > 0;
        if (!isAdminOnFrontPage && !((!isBanned && !isLocked && !!username && sessionActive))) {
            if (!sessionActive) {
                toast.info('⏸️ Voting opens when we go live');
            } else if (isLocked) {
                toast.info('🔒 Voting is paused by the host');
            } else if (!username) {
                toast.info('👤 Set your name first to vote');
                setShowUsernameModal(true);
            } else {
                toast.info('Voting is paused');
            }
            return;
        }

        // ⏱️ RATE LIMITING - Check if too soon since last vote on this song
        const lastVoteTime = voteTimestamps.current.get(songId);
        if (lastVoteTime && Date.now() - lastVoteTime < VOTE_COOLDOWN_MS) {
            toast.info('Too fast — wait a few seconds');
            return;
        }
        voteTimestamps.current.set(songId, Date.now());

        // Prevent double-clicks on same song
        if (votingInProgress.has(songId)) return;

        // Mark as voting
        setVotingInProgress(prev => new Set(prev).add(songId));

        // 🔒 Lock UI from re-sorting during interaction
        markInteraction();

        // 🎉 DOPAMINE: Trigger vote animation
        setVoteAnimation({ songId, type: vote === 1 ? 'up' : 'down' });
        setTimeout(() => setVoteAnimation(null), 600);

        // 🔊 Play sound effect
        if (soundsEnabled) {
            vote === 1 ? SoundEffects.upvote() : SoundEffects.downvote();
        }

        // Check if already voted on this song
        const hasUpvoted = userVotes.upvotedSongIds.includes(songId);
        const hasDownvoted = userVotes.downvotedSongIds.includes(songId);

        // Optimistic update for user votes and song scores
        if (vote === 1) {
            // UPVOTE
            if (hasUpvoted) {
                // Remove upvote (toggle off)
                const removedSong = songs.find(s => s.id === songId);
                if (removedSong) toast.info('Vote removed');
                setUserVotes(prev => ({
                    ...prev,
                    upvotedSongIds: prev.upvotedSongIds.filter(id => id !== songId)
                }));
                setUserStatus(prev => ({
                    ...prev,
                    upvotesUsed: prev.upvotesUsed - 1,
                    upvotesRemaining: prev.upvotesRemaining + 1
                }));
                setSongs(prev => prev.map(s =>
                    s.id === songId ? { ...s, score: s.score - 1 } : s
                ));
            } else if (userStatus.upvotesRemaining > 0) {
                // Add upvote
                setUserVotes(prev => ({
                    ...prev,
                    upvotedSongIds: [...prev.upvotedSongIds, songId]
                }));
                setUserStatus(prev => ({
                    ...prev,
                    upvotesUsed: prev.upvotesUsed + 1,
                    upvotesRemaining: prev.upvotesRemaining - 1
                }));
                setSongs(prev => prev.map(s =>
                    s.id === songId ? { ...s, score: s.score + 1 } : s
                ));
            } else {
                toast.info('All upvotes used');
                setVotingInProgress(prev => { const next = new Set(prev); next.delete(songId); return next; });
                return;
            }
        } else {
            // DOWNVOTE
            if (hasDownvoted) {
                // Remove downvote (toggle off)
                const removedSong = songs.find(s => s.id === songId);
                if (removedSong) toast.info('Vote removed');
                setUserVotes(prev => ({
                    ...prev,
                    downvotedSongIds: prev.downvotedSongIds.filter(id => id !== songId)
                }));
                setUserStatus(prev => ({
                    ...prev,
                    downvotesUsed: prev.downvotesUsed - 1,
                    downvotesRemaining: prev.downvotesRemaining + 1
                }));
                setSongs(prev => prev.map(s =>
                    s.id === songId ? { ...s, score: s.score + 1 } : s
                ));
            } else if (userStatus.downvotesRemaining > 0) {
                // Add downvote
                setUserVotes(prev => ({
                    ...prev,
                    downvotedSongIds: [...prev.downvotedSongIds, songId]
                }));
                setUserStatus(prev => ({
                    ...prev,
                    downvotesUsed: prev.downvotesUsed + 1,
                    downvotesRemaining: prev.downvotesRemaining - 1
                }));
                setSongs(prev => prev.map(s =>
                    s.id === songId ? { ...s, score: s.score - 1 } : s
                ));
            } else {
                toast.info('All downvotes used');
                setVotingInProgress(prev => { const next = new Set(prev); next.delete(songId); return next; });
                return;
            }
        }

        // Fire and forget - never reload page on vote
        try {
            // Find the song to get its name for activity feed
            const votedSong = songs.find(s => s.id === songId);

            const res = await fetch(`/api/songs/${songId}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                },
                body: JSON.stringify({
                    vote,
                    userName: username || 'Anonymous',
                    songName: votedSong?.name || 'Unknown',
                    userLocation: userLocation || undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                if (data.error?.includes('banned')) {
                    setIsBanned(true);
                    toast.error('A moderator paused your access');
                } else if (data.error?.includes('not found') || data.error?.includes('locked')) {
                    // Song was deleted or playlist was locked - refresh to sync
                    toast.info('Song was removed — refreshing...');
                    fetchPlaylist();
                } else if (res.status === 429) {
                    // Rate limited — friendly countdown
                    const retryAfter = res.headers.get('Retry-After') || '10';
                    toast.info(`Rate limited — try again in ${retryAfter}s`);
                } else {
                    toast.error(data.error || 'Vote failed — try again');
                }
            } else {
                // Success — always confirm so users know their vote counted
                toast.success(vote === 1 ? '👍 Upvote counted' : '👎 Downvote counted');
                // Dismiss vote coach mark on first successful vote
                if (showCoachMark === 'vote') {
                    setShowCoachMark(null);
                    persistSet('crate-coach-done', 'true');
                }
            }
        } catch (error) {
            console.error('Vote failed:', error);
            toast.error('Vote failed — check your connection');
            // On network error, refresh to ensure sync
            fetchPlaylist();
        } finally {
            // Clear voting state
            setVotingInProgress(prev => {
                const next = new Set(prev);
                next.delete(songId);
                return next;
            });
        }
    };

    // Manual refresh - debounced to prevent spam
    const handleRefresh = () => {
        if (isRefreshCooldown) return;
        setIsRefreshCooldown(true);
        fetchPlaylist(true);
        // Timer data is now included in the songs response
        // 2 second cooldown between manual refreshes
        setTimeout(() => setIsRefreshCooldown(false), 2000);
    };

    // Auto-hide message
    useEffect(() => {
        if (message) {
            const timeout = setTimeout(() => setMessage(null), 3000);
            return () => clearTimeout(timeout);
        }
    }, [message]);

    // Check if song is already in playlist — O(1) via memoized Set (was O(n) per call)
    const playlistIdSet = useMemo(() => new Set(songs.map(s => s.id)), [songs]);
    const isSongInPlaylist = (trackId: string) => playlistIdSet.has(trackId);

    // Scroll to a song already in the playlist (for "already added" click)
    const scrollToSongInPlaylist = (trackId: string) => {
        const songEl = document.querySelector(`[data-song-id="${trackId}"]`);
        if (songEl) {
            songEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            songEl.classList.add('highlight-flash');
            setTimeout(() => songEl.classList.remove('highlight-flash'), 2000);
        }
        setShowResults(false);
        setSearchQuery('');
    };

    // Can user participate?
    // Session must be active (timer running) to participate
    // Admins bypass all gates (lock, ban, session, permissions)
    const isSessionActive = timerRunning && timerRemaining > 0;
    const canParticipate = isAdminOnFrontPage || (!isBanned && !isLocked && !!username && isSessionActive);

    // Loading state - show skeleton UI
    if (isLoading || !visitorId) {
        return (
            <div className="stream-layout loading-state">
                <header className="stream-header">
                    <div className="header-left">
                        <img src="/crate-hackers-master-logo.png" alt="Crate Hackers" className="master-logo" />
                    </div>
                    <div className="header-right">
                        <span className="stat-pill capacity">--/100</span>
                    </div>
                </header>
                <div className="main-content">
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto' }} />
                        <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Loading playlist...</p>
                    </div>
                    <PlaylistSkeleton count={8} />
                </div>
            </div>
        );
    }

    // Username modal is now rendered as an overlay inside the main return (see below)

    // Export playlist - redirect to export page for platform selection
    const handleExport = () => {
        setIsExporting(true);
        setMessage({ type: 'success', text: 'Opening export options...' });
        window.location.href = '/export';
    };

    return (
        <div className="stream-layout">

            {/* 🔒 JOIN OVERLAY — Multi-step onboarding with Kartra integration */}
            {showUsernameModal && !username && (
                <div className="join-overlay">
                    <div className="join-card">
                        {/* Step indicator */}
                        <div className="onboarding-steps-indicator">
                            <span className={`step-dot ${onboardingStep >= 1 ? 'active' : ''}`} />
                            <span className={`step-dot ${onboardingStep >= 2 ? 'active' : ''}`} />
                        </div>

                        {/* ── STEP 1: DJ Name ── */}
                        {onboardingStep === 1 && (
                            <>
                                <img src="/logo.png" alt="Crate Hackers" className="join-logo" />
                                <h2 className="join-title">Join the Live Playlist</h2>
                                <p className="join-subtitle">
                                    Search songs. Vote your favorites up. Build the playlist together.
                                </p>
                                {viewerCount > 0 && (
                                    <p className="join-social-proof">
                                        🟢 {viewerCount} {viewerCount === 1 ? 'person' : 'people'} here now
                                    </p>
                                )}
                                <div className="join-name-section">
                                    <input
                                        type="text"
                                        className="join-name-input"
                                        placeholder="Your display name"
                                        value={usernameInput}
                                        onChange={(e) => setUsernameInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && usernameInput.trim() && handleStep1Next()}
                                        autoFocus
                                        maxLength={20}
                                    />
                                    <button
                                        className="join-go-btn"
                                        onClick={handleStep1Next}
                                        disabled={!usernameInput.trim()}
                                    >
                                        Next →
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Step 2 ("Are you a DJ?") removed — unused flag, adds friction */}

                        {/* ── STEP 2: Email + Phone (Kartra capture) ── */}
                        {onboardingStep === 2 && (
                            <>
                                <div className="step3-emoji">🚀</div>
                                <h2 className="join-title">Get Notified When We Go Live</h2>
                                <p className="join-subtitle">
                                    One email before each live event. That's it.
                                </p>
                                <div className="join-capture-section">
                                    <input
                                        type="email"
                                        className={`join-name-input ${emailInput && !isValidEmail(emailInput) ? 'input-invalid' : ''}`}
                                        placeholder="you@email.com"
                                        value={emailInput}
                                        onChange={(e) => { setEmailInput(e.target.value); setKartraError(null); }}
                                        onKeyDown={(e) => e.key === 'Enter' && isValidEmail(emailInput) && handleOnboardingComplete()}
                                        autoFocus
                                    />
                                    {emailInput && !isValidEmail(emailInput) && (
                                        <p className="inline-validation-hint">Enter a valid email</p>
                                    )}
                                    <input
                                        type="tel"
                                        className="join-name-input"
                                        placeholder="Phone (optional)"
                                        value={phoneInput}
                                        onChange={(e) => setPhoneInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && isValidEmail(emailInput) && handleOnboardingComplete()}
                                    />
                                    {kartraError && (
                                        <p className="kartra-error">{kartraError}</p>
                                    )}
                                    <button
                                        className="join-go-btn"
                                        onClick={handleOnboardingComplete}
                                        disabled={!isValidEmail(emailInput) || isSubmittingKartra}
                                    >
                                        {isSubmittingKartra ? 'Joining...' : 'Join & Enter →'}
                                    </button>
                                </div>
                                <button className="skip-onboarding-btn" onClick={handleSkipOnboarding}>
                                    Skip for now →
                                </button>
                                <p className="join-privacy-note">
                                    🔒 Unsubscribe anytime. We never share your info.
                                </p>
                                <button className="step-back-btn" onClick={() => setOnboardingStep(1)}>
                                    ← Back
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )
            }

            {/* 🔒 PROFILE EDIT OVERLAY — simple name edit for existing users */}
            {
                showUsernameModal && username && (
                    <div className="join-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowUsernameModal(false); }}>
                        <div className="join-card">
                            <button className="modal-close-x" onClick={() => setShowUsernameModal(false)} aria-label="Close">✕</button>
                            <img src="/logo.png" alt="Crate Hackers" className="join-logo" />
                            <h2 className="join-title">Edit Your Profile</h2>
                            <div className="join-name-section">
                                <input
                                    type="text"
                                    className="join-name-input"
                                    placeholder="Your name"
                                    value={usernameInput}
                                    onChange={(e) => setUsernameInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && usernameInput.trim() && handleSetUsername()}
                                    autoFocus
                                    maxLength={20}
                                    disabled={isSavingUsername}
                                />
                                <button
                                    className="join-go-btn"
                                    onClick={handleSetUsername}
                                    disabled={!usernameInput.trim() || isSavingUsername}
                                >
                                    {isSavingUsername ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                            <button className="step-back-btn" onClick={() => setShowUsernameModal(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )
            }

            {/* 🎉 CONFETTI CELEBRATION OVERLAY */}
            {
                showConfetti && (
                    <div className="confetti-overlay">
                        <div className="confetti-message">{confettiMessage}</div>
                    </div>
                )
            }

            {/* 🌧️ KARMA RAIN ANIMATION */}
            {
                showKarmaRain && (
                    <div className="karma-rain-overlay">
                        {[...Array(30)].map((_, i) => (
                            <span
                                key={i}
                                className="rain-drop"
                                style={{
                                    left: `${Math.random() * 100}%`,
                                    animationDelay: `${Math.random() * 2}s`,
                                    animationDuration: `${1.5 + Math.random() * 1}s`,
                                }}
                            >
                                {['💧', '✨', '💫', '⭐', '🌟'][i % 5]}
                            </span>
                        ))}
                    </div>
                )
            }

            {/* 🎰 MEGA-ANNOUNCEMENT: PURGE SPLASH */}
            {
                showPurgeSplash && (
                    <div className="mega-announcement purge">
                        <div className="purge-particles">
                            {[...Array(12)].map((_, i) => (
                                <span
                                    key={i}
                                    className="purge-particle"
                                    style={{
                                        left: `${10 + Math.random() * 80}%`,
                                        top: `${10 + Math.random() * 80}%`,
                                        animationDelay: `${Math.random() * 2}s`,
                                    }}
                                >
                                    {['💀', '🔥', '⚡', '💥'][i % 4]}
                                </span>
                            ))}
                        </div>
                        <span className="mega-icon">💀</span>
                        <h1 className="mega-title">THE PURGE</h1>
                        <p className="mega-subtitle">Delete any song — one shot!</p>
                        <div className="mega-countdown">{Math.ceil(deleteWindowRemaining / 1000)}s</div>
                    </div>
                )
            }

            {/* 🎰 MEGA-ANNOUNCEMENT: KARMA RAIN SPLASH */}
            {
                showKarmaRainSplash && (
                    <div className="mega-announcement karma-rain">
                        <div className="karma-rain-enhanced">
                            {[...Array(20)].map((_, i) => (
                                <span
                                    key={i}
                                    className="karma-drop"
                                    style={{
                                        left: `${Math.random() * 100}%`,
                                        animationDelay: `${Math.random() * 2}s`,
                                    }}
                                >
                                    {['✨', '💫', '⭐', '🌟', '💎'][i % 5]}
                                </span>
                            ))}
                        </div>
                        <span className="mega-icon">🌧️</span>
                        <h1 className="mega-title">KARMA RAIN!</h1>
                        <p className="mega-subtitle">+1 Karma for everyone! 🎉</p>
                    </div>
                )
            }

            {/* 🎰 MEGA-ANNOUNCEMENT: WIPE SPLASH */}
            {
                showWipeSplash && (
                    <div className="mega-announcement wipe">
                        <span className="mega-icon">🗑️</span>
                        <h1 className="mega-title">PLAYLIST RESET!</h1>
                        <p className="mega-subtitle">Add your songs now.</p>
                    </div>
                )
            }

            {/* 🏆 WINNER ANNOUNCEMENT - Promo code popup */}
            {
                showWinnerSplash && (
                    <div className="winner-announcement" onClick={(e) => e.target === e.currentTarget && setShowWinnerSplash(false)}>
                        <div className="winner-modal">
                            <button className="winner-close" onClick={() => setShowWinnerSplash(false)}>✕</button>
                            <div className="winner-confetti">🎉</div>
                            <h1 className="winner-title">YOU WON! 🏆</h1>
                            <p className="winner-song">"{winnerSongName}" finished #1!</p>
                            <div className="winner-prize">
                                <img src="/hat-prize.png" alt="Free Hat" className="prize-image" />
                                <div className="prize-details">
                                    <h2>FREE HAT!</h2>
                                    <p className="promo-code">Code: <strong>HACKATHONWINNER</strong></p>
                                    <p className="winner-shipping-note">Just pay shipping · Hat is on us 🎩</p>
                                </div>
                            </div>
                            <a
                                href="https://dj.style/products/crate-hackers-vintage-cotton-twill-hat-special-offer"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="claim-prize-btn"
                            >
                                🎁 Claim Your Free Hat →
                            </a>
                            <p className="winner-note">Tap above → Enter code <strong>HACKATHONWINNER</strong> at checkout → Done!</p>
                            <a
                                href={generateCalendarUrl()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="winner-calendar-link"
                            >
                                📅 Never miss a vote — Add to Calendar
                            </a>
                        </div>
                    </div>
                )
            }

            {/* 🎰 GOLDEN HOUR PRIZE DROP */}
            {
                showPrizeDrop && (
                    <div className={`prize-drop-overlay ${prizeDropIsWinner ? 'is-winner' : 'is-viewer'}`} onClick={(e) => {
                        if (e.target === e.currentTarget) setShowPrizeDrop(false);
                    }}>
                        {prizeDropIsWinner ? (
                            <div className="prize-drop-modal winner-modal-prize">
                                <button className="winner-close" onClick={() => setShowPrizeDrop(false)}>✕</button>
                                <div className="prize-drop-particles">
                                    {[...Array(15)].map((_, i) => (
                                        <span key={i} className="prize-particle" style={{
                                            left: `${Math.random() * 100}%`,
                                            top: `${Math.random() * 100}%`,
                                            animationDelay: `${Math.random() * 2}s`,
                                        }}>
                                            {['🎰', '💰', '✨', '🎉', '💎'][i % 5]}
                                        </span>
                                    ))}
                                </div>
                                <span className="prize-drop-mega-icon">🎰</span>
                                <h1 className="prize-drop-title">GOLDEN HOUR DROP!</h1>
                                <p className="prize-drop-subtitle">You&apos;ve been selected — free hat incoming! 🎩</p>
                                <div className="winner-prize">
                                    <img src="/hat-prize.png" alt="Free Hat" className="prize-image" />
                                    <div className="prize-details">
                                        <h2>FREE HAT!</h2>
                                        <p className="promo-code">Code: <strong>HACKATHONWINNER</strong></p>
                                        <p className="winner-shipping-note">Just pay shipping · Hat is on us 🎩</p>
                                    </div>
                                </div>
                                <a
                                    href="https://dj.style/products/crate-hackers-vintage-cotton-twill-hat-special-offer"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="claim-prize-btn"
                                >
                                    🎁 Claim Your Free Hat →
                                </a>
                                <p className="winner-note">Tap above → Enter code <strong>HACKATHONWINNER</strong> at checkout → Done!</p>
                            </div>
                        ) : (
                            <div className="prize-drop-broadcast">
                                <div className="prize-drop-particles">
                                    {[...Array(10)].map((_, i) => (
                                        <span key={i} className="prize-particle" style={{
                                            left: `${Math.random() * 100}%`,
                                            top: `${Math.random() * 100}%`,
                                            animationDelay: `${Math.random() * 2}s`,
                                        }}>
                                            {['🎰', '💰', '✨', '🎉', '💎'][i % 5]}
                                        </span>
                                    ))}
                                </div>
                                <span className="prize-drop-mega-icon">🎰</span>
                                <h1 className="prize-drop-title">GOLDEN HOUR DROP!</h1>
                                <p className="prize-drop-winner-name">🎉 {prizeDropWinnerName} just won a free hat!</p>
                                <p className="prize-drop-hint">Stay active — you could be next! 🎯</p>
                            </div>
                        )}
                    </div>
                )
            }

            {/* 👑 LEADERBOARD KING ANNOUNCEMENT */}
            {
                showLeaderboardKing && (
                    <div className={`leaderboard-king-overlay ${leaderboardKingIsMe ? 'is-winner' : 'is-viewer'}`} onClick={(e) => {
                        if (e.target === e.currentTarget) setShowLeaderboardKing(false);
                    }}>
                        {leaderboardKingIsMe ? (
                            <div className="leaderboard-king-modal winner-modal-prize">
                                <button className="winner-close" onClick={() => setShowLeaderboardKing(false)}>✕</button>
                                <div className="king-crown-particles">
                                    {[...Array(12)].map((_, i) => (
                                        <span key={i} className="king-particle" style={{
                                            left: `${10 + Math.random() * 80}%`,
                                            top: `${10 + Math.random() * 80}%`,
                                            animationDelay: `${Math.random() * 2}s`,
                                        }}>
                                            {['👑', '⭐', '✨', '🏆'][i % 4]}
                                        </span>
                                    ))}
                                </div>
                                <span className="king-mega-icon">👑</span>
                                <h1 className="king-title">LEADERBOARD KING!</h1>
                                <p className="king-subtitle">You&apos;re #1 with <strong>{leaderboardKingScore}</strong> points — you earned this! 🔥</p>
                                <div className="winner-prize">
                                    <img src="/hat-prize.png" alt="Free Hat" className="prize-image" />
                                    <div className="prize-details">
                                        <h2>FREE HAT!</h2>
                                        <p className="promo-code">Code: <strong>HACKATHONWINNER</strong></p>
                                        <p className="winner-shipping-note">Just pay shipping · Hat is on us 🎩</p>
                                    </div>
                                </div>
                                <a
                                    href="https://dj.style/products/crate-hackers-vintage-cotton-twill-hat-special-offer"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="claim-prize-btn"
                                >
                                    🎁 Claim Your Free Hat →
                                </a>
                                <p className="winner-note">Tap above → Enter code <strong>HACKATHONWINNER</strong> at checkout → Done!</p>
                            </div>
                        ) : (
                            <div className="leaderboard-king-broadcast">
                                <div className="king-crown-particles">
                                    {[...Array(8)].map((_, i) => (
                                        <span key={i} className="king-particle" style={{
                                            left: `${10 + Math.random() * 80}%`,
                                            top: `${10 + Math.random() * 80}%`,
                                            animationDelay: `${Math.random() * 2}s`,
                                        }}>
                                            {['👑', '⭐', '✨', '🏆'][i % 4]}
                                        </span>
                                    ))}
                                </div>
                                <span className="king-mega-icon">👑</span>
                                <h1 className="king-title">LEADERBOARD KING!</h1>
                                <p className="king-winner-name">🏆 {leaderboardKingName} finished #1!</p>
                                <p className="king-score">Score: <strong>{leaderboardKingScore}</strong> points</p>
                                <a
                                    href={generateCalendarUrl()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="king-calendar-link"
                                >
                                    📅 Come back next Tuesday — Add to Calendar
                                </a>
                            </div>
                        )}
                    </div>
                )
            }

            {/* 🔴 PERSISTENT PURGE INDICATOR (after splash) */}
            {
                deleteWindow.active && !showPurgeSplash && (
                    <div className={`purge-persistent-indicator ${!deleteWindow.canDelete ? 'inactive-user' : ''}`}>
                        <span className="purge-icon">💀</span>
                        <span className="purge-text">PURGE ACTIVE</span>
                        <span className="purge-countdown">{Math.ceil(deleteWindowRemaining / 1000)}s</span>
                        {!deleteWindow.canDelete && deleteWindow.reason && (
                            <span className="purge-restriction">{deleteWindow.reason}</span>
                        )}
                    </div>
                )
            }

            {/* ⚠️ STALE DATA INDICATOR - Show when offline */}
            {isStale && (
                <div className="stale-indicator">
                    ⚠️ You're offline
                    <button className="stale-retry-btn" onClick={() => { fetchPlaylist(); }}>{isRefreshing ? 'Retrying...' : 'Retry'}</button>
                </div>
            )}

            {/* 🎓 FIRST-TIME COACH MARKS */}
            {showCoachMark === 'vote' && sortedSongs.length > 0 && (
                <div className="coach-mark-banner">
                    <span>🏆 Vote on songs — top 3 win prizes!</span>
                    <button className="coach-dismiss" onClick={() => { setShowCoachMark(null); persistSet('crate-coach-done', 'true'); }}>Got it</button>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                COMPACT TOP BAR - Everything important on 1-2 lines
               ═══════════════════════════════════════════════════════════ */}
            <header className="stream-header">
                <div className="header-left">
                    <Link href="/" className="logo-home-link" title="Go to Home">
                        <img src="/crate-hackers-master-logo.png" alt="Crate Hackers" className="master-logo" />
                    </Link>

                    {/* Rules info popover */}
                    <div className="rules-popover-wrapper">
                        <button
                            className="admin-link-subtle rules-info-btn rules-info-bright"
                            title="How to play"
                            onClick={() => setShowRulesPopover(!showRulesPopover)}
                        >
                            ℹ️
                        </button>
                        {showRulesPopover && (
                            <div className="rules-popover">
                                <div className="rules-popover-arrow" />
                                <h4><img src="/logo.png" alt="" className="inline-crate-icon" /> How It Works</h4>
                                <ul>
                                    <li><img src="/logo.png" alt="" className="inline-crate-icon" /> Add up to 5 songs</li>
                                    <li>👍 10 upvotes + 👎 10 downvotes to rank songs</li>
                                    <li>🏆 Top 3 songs win prizes + karma!</li>
                                </ul>
                                <button className="rules-popover-close" onClick={() => setShowRulesPopover(false)}>Got it</button>
                            </div>
                        )}
                    </div>
                    {/* LIVE badge integrated into header with viewer count */}
                    {timerRunning && (
                        <span className="live-badge-inline">
                            <span className="live-pulse"></span>
                            🗳️ VOTE NOW • {formatTime(timerRemaining)}
                            {viewerCount > 0 && <span className="viewer-count">• 👁 {viewerCount}</span>}
                        </span>
                    )}
                </div>
                <div className="header-right">
                    {!isBanned && isSessionActive && (
                        <div className="action-stats">
                            {/* Songs remaining - hide if adding disabled */}
                            {permissions.canAddSongs && (
                                <span className="stat-counter songs" data-tooltip={`${userStatus.songsRemaining} song${userStatus.songsRemaining !== 1 ? 's' : ''} left`} tabIndex={0}>
                                    <img src="/logo.png" alt="" className="inline-crate-icon" /> {userStatus.songsRemaining}
                                </span>
                            )}
                            {/* Upvotes remaining - hide if voting disabled */}
                            {permissions.canVote && (
                                <span className="stat-counter upvotes" data-tooltip={`${userStatus.upvotesRemaining} upvote${userStatus.upvotesRemaining !== 1 ? 's' : ''} left`} tabIndex={0}>
                                    👍 {userStatus.upvotesRemaining}
                                </span>
                            )}
                            {/* Downvotes remaining - hide if voting disabled */}
                            {permissions.canVote && (
                                <span className="stat-counter downvotes" data-tooltip={`${userStatus.downvotesRemaining} downvote${userStatus.downvotesRemaining !== 1 ? 's' : ''} left`} tabIndex={0}>
                                    👎 {userStatus.downvotesRemaining}
                                </span>
                            )}
                            {/* Karma - only show if > 0 */}
                            {karmaBonuses.karma > 0 && (
                                <span className="stat-counter karma" data-tooltip="Karma: each point = +1 song slot & +1 vote" tabIndex={0}>
                                    ✨ {karmaBonuses.karma}
                                </span>
                            )}
                            {/* 👑 GOD MODE - User's song is #1 (unlimited votes, extra purge deletes) */}
                            {userStatus.isGodMode && (
                                <span className="god-mode-badge" data-tooltip="Your song is #1 — unlimited votes unlocked!" tabIndex={0}>
                                    👑 GOD MODE
                                </span>
                            )}
                        </div>
                    )}

                    <span className="stat-pill capacity" data-tooltip={`Playlist: ${playlistStats.current} of ${playlistStats.max} songs`} tabIndex={0}>
                        🎵 {playlistStats.current}/{playlistStats.max}
                    </span>
                    {username && (
                        <button
                            className="user-pill"
                            onClick={() => {
                                setUsernameInput(username);
                                setAvatarInput(userAvatar);
                                setShowUsernameModal(true);
                            }}
                            data-tooltip="Edit profile"
                        >
                            <span className="user-pill-avatar">{userAvatar}</span>
                            {username} <span className="edit-hint">✏️</span>
                        </button>
                    )}
                </div>
            </header>

            {/* 📡 BROADCAST SCHEDULE BAR - Countdown to next Tuesday 8 PM ET + Calendar CTA */}
            <div className={`broadcast-bar ${isBroadcastLive ? 'broadcast-live' : ''}`}>
                {isBroadcastLive ? (
                    <>
                        <span className="broadcast-live-dot" />
                        <span className="broadcast-text">LIVE NOW</span>
                        <span className="broadcast-schedule">Every Tue · 8 PM ET</span>
                    </>
                ) : (
                    <>
                        <span className="broadcast-text">📡 NEXT LIVE EVENT</span>
                        <span className="broadcast-countdown">{broadcastCountdown}</span>
                        <span className="broadcast-schedule">Every Tuesday · 8 PM ET</span>
                        <a
                            href={generateCalendarUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="calendar-cta-btn"
                            title="Add recurring reminder to Google Calendar"
                        >
                            📅 Add to Calendar
                        </a>
                    </>
                )}
            </div>

            {/* 🎮 GAME FEATURES BAR - Leaderboard, Predictions, Sound toggle */}
            {
                timerRunning && (
                    <div className="game-features-bar">
                        <button
                            className={`feature-btn ${showLeaderboard ? 'active' : ''}`}
                            onClick={() => { setShowLeaderboard(!showLeaderboard); if (!showLeaderboard) fetchLeaderboard(); }}
                        >
                            🏆 Leaderboard
                        </button>

                        {!predictionsLocked && !userPrediction && (
                            <button
                                className="feature-btn prediction"
                                onClick={() => setShowPredictionModal(true)}
                            >
                                🎯 Predict the Winner
                            </button>
                        )}

                        {userPrediction && (
                            <span className="prediction-badge">
                                🎯 Prediction locked
                            </span>
                        )}

                        <button
                            className={`feature-btn sound-toggle ${soundsEnabled ? '' : 'muted'}`}
                            onClick={() => {
                                const newState = !soundsEnabled;
                                setSoundsEnabled(newState);
                                SoundEffects.setEnabled(newState);
                            }}
                            title={soundsEnabled ? 'Mute sounds' : 'Turn on sounds'}
                        >
                            {soundsEnabled ? '🔊' : '🔇'}
                        </button>
                    </div>
                )
            }

            {/* 📺 LIVE STREAM HOST - Dual mode: PiP (bottom-right) / Expanded (sticky top) */}
            {/* YouTube Mode */}
            {
                !hideStreamLocally && streamPlatform === 'youtube' && youtubeEmbed && (
                    <div className={`stream-host ${streamMinimized ? 'pip-mode' : 'expanded-mode'}`}>
                        <div className="stream-host-header">
                            <span className="live-host-badge replay-badge">🎬 REPLAY</span>
                            <div className="stream-host-controls">

                                <button
                                    className="stream-toggle-btn"
                                    onClick={() => streamMinimized ? handleExpandStream() : handleMinimizeStream()}
                                    title={streamMinimized ? 'Expand stream' : 'Minimize to PiP'}
                                >
                                    {streamMinimized ? '▶ Expand' : '➖'}
                                </button>
                            </div>
                        </div>
                        <div className="stream-host-video">
                            <iframe
                                ref={youtubePlayerRef}
                                src={getYouTubeEmbedSrc(youtubeEmbed)}
                                title="Live Host Stream"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                        {/* PiP tap-to-expand overlay */}
                        {streamMinimized && (
                            <button
                                className="pip-expand-overlay"
                                onClick={handleExpandStream}
                                aria-label="Expand and unmute stream"
                            >
                                <span className="pip-sound-prompt">🔊 Tap for sound</span>
                            </button>
                        )}
                        {/* 🔍 PiP DOCKED SONG SEARCH — Add songs while watching YouTube */}
                        {streamMinimized && (isAdminOnFrontPage || (permissions.canAddSongs && canParticipate && (userStatus.songsRemaining > 0 || karmaBonuses.bonusSongAdds > 0))) && (
                            <div className="pip-docked-search">
                                <input
                                    type="text"
                                    className="pip-search-input"
                                    placeholder="🔍 Add a song..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onBlur={() => setTimeout(() => setShowResults(false), 450)}
                                    onFocus={() => searchResults.length > 0 && setShowResults(true)}
                                />
                                {isSearching && <span className="pip-search-spinner">...</span>}
                                {showResults && searchResults.length > 0 && (
                                    <div className="pip-search-dropdown">
                                        <div className="search-results-header">
                                            🔍 RESULTS <span className="header-hint">Tap to add →</span>
                                        </div>
                                        {searchResults.slice(0, 4).map((track) => (
                                            <div
                                                key={track.id}
                                                className={`search-result-row ${isAddingSong === track.id ? 'adding' : ''} ${isSongInPlaylist(track.id) ? 'in-playlist' : 'can-add'}`}
                                                onMouseDown={() => isSongInPlaylist(track.id) ? scrollToSongInPlaylist(track.id) : (!isAddingSong && handleAddSong(track))}
                                            >
                                                <img src={track.albumArt || '/placeholder.svg'} alt="" />
                                                <div className="result-info">
                                                    <span className="result-name">{track.name}</span>
                                                    <span className="result-artist">{track.artist}</span>
                                                </div>
                                                {isAddingSong === track.id ? (
                                                    <span className="adding-spinner">⏳</span>
                                                ) : isSongInPlaylist(track.id) ? (
                                                    <span className="already-added">✓</span>
                                                ) : (
                                                    <span className="add-btn-stream">+ ADD</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {showResults && searchResults.length === 0 && !isSearching && searchQuery.length > 2 && (
                                    <div className="pip-search-dropdown">
                                        <div className="search-empty-state">No songs found — try another search</div>
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Scroll-expanded: still muted, encourage tap for sound */}
                        {!streamMinimized && scrollExpandedMuted && (
                            <button
                                className="expanded-sound-overlay"
                                onClick={handleUnmuteExpanded}
                                aria-label="Unmute stream"
                            >
                                <span className="pip-sound-prompt">🔊 Tap for sound</span>
                            </button>
                        )}
                    </div>
                )
            }

            {/* Twitch Mode */}
            {
                !hideStreamLocally && streamPlatform === 'twitch' && twitchChannel && (
                    <div className={`stream-host twitch-host ${streamMinimized ? 'pip-mode' : 'expanded-mode'}`}>
                        <div className="stream-host-header twitch-header">
                            <span className="live-host-badge twitch-badge">🟣 LIVE</span>
                            <div className="stream-host-controls">
                                {!streamMinimized && (
                                    <>
                                        <a
                                            href={`https://twitch.tv/${twitchChannel}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="stream-rsvp-btn twitch-rsvp"
                                            title="Open in Twitch app"
                                        >
                                            ⇗ Twitch
                                        </a>
                                        <button
                                            className={`stream-rsvp-btn twitch-rsvp ${chatDocked ? 'active' : ''}`}
                                            onClick={() => setChatDocked(!chatDocked)}
                                            title={chatDocked ? 'Unpin chat' : 'Pin chat'}
                                        >
                                            {chatDocked ? 'Unpin Chat' : '💬 Pin Chat'}
                                        </button>
                                    </>
                                )}
                                <button
                                    className="stream-toggle-btn"
                                    onClick={() => streamMinimized ? handleExpandStream() : handleMinimizeStream()}
                                    title={streamMinimized ? 'Expand stream' : 'Minimize to PiP'}
                                >
                                    {streamMinimized ? '⬜ ᴇxᴘᴀɴᴅ' : '➖'}
                                </button>
                            </div>
                        </div>
                        <div className={`twitch-content ${streamMinimized ? '' : 'twitch-expanded-layout'}`}>
                            <div className="stream-host-video">
                                <iframe
                                    src={`https://player.twitch.tv/?channel=${twitchChannel}&parent=${twitchParent}&muted=${twitchMuted}`}
                                    title="Twitch Stream"
                                    frameBorder="0"
                                    allowFullScreen
                                    scrolling="no"
                                />
                            </div>
                            {/* Chat inline (only when NOT docked and expanded) */}
                            {!streamMinimized && !chatDocked && (
                                <div className="twitch-chat-container">
                                    <iframe
                                        src={`https://www.twitch.tv/embed/${twitchChannel}/chat?parent=${twitchParent}&darkpopout`}
                                        title="Twitch Chat"
                                        frameBorder="0"
                                        scrolling="no"
                                    />
                                </div>
                            )}
                        </div>
                        {/* PiP tap-to-expand overlay */}
                        {streamMinimized && (
                            <button
                                className="pip-expand-overlay twitch-pip-overlay"
                                onClick={handleExpandStream}
                                aria-label="Expand and unmute stream"
                            >
                                <span className="pip-sound-prompt">🔊 Tap for sound</span>
                            </button>
                        )}
                        {/* 🔍 PiP DOCKED SONG SEARCH — Add songs while watching Twitch */}
                        {streamMinimized && (isAdminOnFrontPage || (permissions.canAddSongs && canParticipate && (userStatus.songsRemaining > 0 || karmaBonuses.bonusSongAdds > 0))) && (
                            <div className="pip-docked-search twitch-pip-search">
                                <input
                                    type="text"
                                    className="pip-search-input"
                                    placeholder="🔍 Add a song..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onBlur={() => setTimeout(() => setShowResults(false), 450)}
                                    onFocus={() => searchResults.length > 0 && setShowResults(true)}
                                />
                                {isSearching && <span className="pip-search-spinner">...</span>}
                                {showResults && searchResults.length > 0 && (
                                    <div className="pip-search-dropdown twitch-search-dropdown">
                                        <div className="search-results-header">
                                            🔍 RESULTS <span className="header-hint">Tap to add →</span>
                                        </div>
                                        {searchResults.slice(0, 4).map((track) => (
                                            <div
                                                key={track.id}
                                                className={`search-result-row ${isAddingSong === track.id ? 'adding' : ''} ${isSongInPlaylist(track.id) ? 'in-playlist' : 'can-add'}`}
                                                onMouseDown={() => isSongInPlaylist(track.id) ? scrollToSongInPlaylist(track.id) : (!isAddingSong && handleAddSong(track))}
                                            >
                                                <img src={track.albumArt || '/placeholder.svg'} alt="" />
                                                <div className="result-info">
                                                    <span className="result-name">{track.name}</span>
                                                    <span className="result-artist">{track.artist}</span>
                                                </div>
                                                {isAddingSong === track.id ? (
                                                    <span className="adding-spinner">⏳</span>
                                                ) : isSongInPlaylist(track.id) ? (
                                                    <span className="already-added">✓</span>
                                                ) : (
                                                    <span className="add-btn-stream">+ ADD</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {showResults && searchResults.length === 0 && !isSearching && searchQuery.length > 2 && (
                                    <div className="pip-search-dropdown twitch-search-dropdown">
                                        <div className="search-empty-state">No songs found — try another search</div>
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Scroll-expanded: still muted, encourage tap for sound */}
                        {!streamMinimized && scrollExpandedMuted && (
                            <button
                                className="expanded-sound-overlay twitch-pip-overlay"
                                onClick={handleUnmuteExpanded}
                                aria-label="Unmute stream"
                            >
                                <span className="pip-sound-prompt">🔊 Tap for sound</span>
                            </button>
                        )}
                    </div>
                )
            }

            {/* 💬 DOCKED TWITCH CHAT - Fixed bottom panel for chatting while scrolling */}
            {
                chatDocked && streamPlatform === 'twitch' && twitchChannel && !streamMinimized && (
                    <div className="docked-chat-panel">
                        <div className="docked-chat-header">
                            <span className="docked-chat-handle" />
                            <span className="docked-chat-title">💬 Chat</span>
                            <div className="docked-chat-controls">
                                <a
                                    href={`https://twitch.tv/${twitchChannel}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="docked-chat-btn"
                                    title="Open in Twitch"
                                >
                                    ⇗
                                </a>
                                <button
                                    className="docked-chat-btn"
                                    onClick={() => setChatDocked(false)}
                                    title="Unpin chat"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        {/* 🔍 DOCKED SONG SEARCH — Add songs without leaving the chat */}
                        {(isAdminOnFrontPage || (permissions.canAddSongs && canParticipate && (userStatus.songsRemaining > 0 || karmaBonuses.bonusSongAdds > 0))) && (
                            <div className="docked-search-container">
                                <input
                                    type="text"
                                    className="docked-search-input"
                                    placeholder="Search any song on Spotify..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onBlur={() => setTimeout(() => setShowResults(false), 450)}
                                    onFocus={() => searchResults.length > 0 && setShowResults(true)}
                                />
                                {isSearching && <span className="docked-search-spinner">...</span>}
                                {showResults && searchResults.length > 0 && (
                                    <div className="docked-search-dropdown">
                                        <div className="search-results-header">
                                            🔍 RESULTS <span className="header-hint">Tap to add →</span>
                                        </div>
                                        {searchResults.slice(0, 4).map((track) => (
                                            <div
                                                key={track.id}
                                                className={`search-result-row ${isAddingSong === track.id ? 'adding' : ''} ${isSongInPlaylist(track.id) ? 'in-playlist' : 'can-add'}`}
                                                onMouseDown={() => !isSongInPlaylist(track.id) && !isAddingSong && handleAddSong(track)}
                                            >
                                                <img src={track.albumArt || '/placeholder.svg'} alt="" />
                                                <div className="result-info">
                                                    <span className="result-name">{track.name}</span>
                                                    <span className="result-artist">{track.artist}</span>
                                                </div>
                                                {isAddingSong === track.id ? (
                                                    <span className="adding-spinner">⏳</span>
                                                ) : isSongInPlaylist(track.id) ? (
                                                    <span className="already-added">✓</span>
                                                ) : (
                                                    <span className="add-btn-stream">+ ADD</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {/* No results state for docked search */}
                                {showResults && searchResults.length === 0 && !isSearching && searchQuery.length > 2 && (
                                    <div className="docked-search-dropdown">
                                        <div className="search-empty-state">No songs found — try another search</div>
                                    </div>
                                )}
                            </div>
                        )}
                        <iframe
                            src={`https://www.twitch.tv/embed/${twitchChannel}/chat?parent=${twitchParent}&darkpopout`}
                            title="Twitch Chat (Docked)"
                            frameBorder="0"
                            scrolling="no"
                            className="docked-chat-iframe"
                        />
                    </div>
                )
            }

            {
                showLeaderboard && (
                    <div className="leaderboard-panel">
                        <div className="leaderboard-header">
                            <span>🏆 Top Contributors</span>
                            <button className="close-btn" onClick={() => setShowLeaderboard(false)}>×</button>
                        </div>
                        <div className="leaderboard-list">
                            {leaderboard.length === 0 ? (
                                <div className="leaderboard-empty">Add songs or vote to appear here</div>
                            ) : (
                                leaderboard.slice(0, 5).map((entry, idx) => (
                                    <div key={entry.visitorId} className={`leaderboard-row ${entry.hasTopSong ? 'has-crown' : ''}`}>
                                        <span className="lb-rank">{idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}</span>
                                        <span className="lb-name" style={entry.visitorId === visitorId ? { color: userColor } : {}}>
                                            {entry.username}{entry.visitorId === visitorId && ' (you)'}
                                        </span>
                                        <span className="lb-score">+{entry.score}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )
            }

            {/* 🎯 PREDICTION MODAL */}
            {
                showPredictionModal && (
                    <div className="modal-overlay" onClick={() => setShowPredictionModal(false)}>
                        <div className="prediction-modal" onClick={(e) => e.stopPropagation()}>
                            <button className="modal-close-x" onClick={() => setShowPredictionModal(false)} aria-label="Close prediction modal">✕</button>
                            <h3>🎯 Predict the Winner</h3>
                            <p>Pick the song you think will finish #1.<br />Get it right = <strong>+3 karma!</strong></p>
                            <div className="prediction-list">
                                {sortedSongs.slice(0, 10).map((song, idx) => (
                                    <button
                                        key={song.id}
                                        className="prediction-option"
                                        onClick={() => handleMakePrediction(song.id)}
                                    >
                                        <img src={song.albumArt || '/placeholder.svg'} alt="" />
                                        <span className="pred-name">{song.name.length > 22 ? song.name.slice(0, 22) + '…' : song.name} <span className="pred-artist">— {song.artist}</span></span>
                                        <span className="pred-score">+{song.score}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="prediction-scroll-hint">↓ Scroll for more</p>
                            <button className="cancel-btn" onClick={() => setShowPredictionModal(false)}>Cancel</button>
                        </div>
                    </div>
                )
            }

            {/* 🎧 YOUR REQUESTS - REMOVED: Now using in-playlist highlighting instead */}

            {/* 📺 SHOW CLOCK TICKER BAR - ESPN-style segment progress */}
            {showClock?.isRunning && (
                <div className={`show-clock-ticker ${showClockWarningLevel !== 'none' ? `ticker-${showClockWarningLevel}` : ''}`}>
                    <div className="ticker-segments">
                        {showClock.segments.map((seg, i) => (
                            <div key={seg.id} className={`ticker-seg ${i === showClock.activeSegmentIndex ? 'current' : i < showClock.activeSegmentIndex ? 'done' : 'upcoming'}`}>
                                <span className="ticker-seg-icon">{seg.icon}</span>
                                <span className="ticker-seg-name">{seg.name}</span>
                            </div>
                        ))}
                    </div>
                    <div className="ticker-countdown">
                        <span className="ticker-time">
                            {Math.floor(showClockRemaining / 60000)}:{String(Math.floor((showClockRemaining % 60000) / 1000)).padStart(2, '0')}
                        </span>
                    </div>
                </div>
            )}

            {/* 📺 SHOW CLOCK TRANSITION SPLASH */}
            {showClockTransition && (
                <div className="show-clock-splash">
                    <div className="splash-content">
                        <span className="splash-label">UP NEXT</span>
                        <span className="splash-segment">{showClockTransition}</span>
                    </div>
                </div>
            )}

            {/* 📺 SHOW CLOCK WARNING TOAST */}
            {showClockWarningLevel === 'amber' && showClock?.isRunning && (
                <div className="show-clock-warning amber">
                    ⏳ {showClock.segments[showClock.activeSegmentIndex]?.name} — 2 minutes remaining
                </div>
            )}
            {showClockWarningLevel === 'red' && showClock?.isRunning && (
                <div className="show-clock-warning red">
                    ⚠️ {showClock.segments[showClock.activeSegmentIndex]?.name} — 30 seconds!
                </div>
            )}

            {/* 💣 NOW PLAYING BOMB BAR - Shows when jukebox is active, lets users bomb the song */}
            {nowPlaying && !jukeboxState && (
                <div className={`now-playing-bomb-bar ${bombAnimating ? 'bomb-shake' : ''}`}>
                    <div className="npb-left">
                        {nowPlaying.albumArt && (
                            <img src={nowPlaying.albumArt} alt="" className="npb-album-art" />
                        )}
                        <div className="npb-info">
                            <span className="npb-label">🎵 NOW PLAYING</span>
                            <span className="npb-song">{nowPlaying.songName}</span>
                            <span className="npb-artist">{nowPlaying.artistName}</span>
                        </div>
                    </div>
                    <div className="npb-right">
                        <div className="npb-bomb-meter">
                            <div className="npb-bomb-fill" style={{ width: `${Math.min(100, (nowPlaying.bombCount / nowPlaying.bombThreshold) * 100)}%` }} />
                            <span className="npb-bomb-text">{nowPlaying.bombCount}/{nowPlaying.bombThreshold} 💣</span>
                        </div>
                        <button
                            className={`npb-bomb-btn ${hasBombedCurrentSong ? 'already-bombed' : ''}`}
                            onClick={() => handleBombSong(nowPlaying.songId)}
                            disabled={hasBombedCurrentSong}
                        >
                            {hasBombedCurrentSong ? '💥 Bombed!' : '💣 BOMB IT'}
                        </button>
                    </div>
                </div>
            )}

            {/* 📦 PLAYLIST HEADER - Title + Activity ticker in fixed-height banner */}
            <div className="playlist-header-bar">
                <div className="playlist-header-left">
                    <span className="playlist-title-text">
                        <span className="crate-week-label">This Week's Crate:</span> {playlistTitle}
                    </span>
                </div>

                {/* 🔔 ACTIVITY TICKER - Middle area, fixed height, doesn't push content */}
                <div className="activity-ticker-inline">
                    {toastQueue.length > 0 ? (
                        <span className={`ticker-item-inline ${toastQueue[0].type}`}>
                            {toastQueue[0].userName === 'System' ? toastQueue[0].songName : (
                                <>
                                    {toastQueue[0].type === 'add' && `💿 ${toastQueue[0].userName} added "${toastQueue[0].songName.length > 18 ? toastQueue[0].songName.slice(0, 18) + '…' : toastQueue[0].songName}"`}
                                    {toastQueue[0].type === 'upvote' && `👍 ${toastQueue[0].userName} upvoted`}
                                    {toastQueue[0].type === 'downvote' && `👎 ${toastQueue[0].userName} downvoted`}
                                </>
                            )}
                        </span>
                    ) : (
                        <span className="ticker-placeholder">
                            {timerRunning ? currentShoutout || '🎵 Vote for your favorites!' : 'Waiting for the next event...'}
                        </span>
                    )}
                </div>

                {/* 🎵 SAVE TO — Spotify + TIDAL logo buttons */}
                <div className="save-logos-group">
                    <button
                        className="save-logo-btn spotify"
                        onClick={handleExport}
                        disabled={isExporting}
                        title="Save to Spotify"
                        aria-label="Save playlist to Spotify"
                    >
                        <svg className="save-logo-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                    </button>
                    <button
                        className="save-logo-btn tidal"
                        onClick={handleExport}
                        disabled={isExporting}
                        title="Save to TIDAL"
                        aria-label="Save playlist to TIDAL"
                    >
                        <svg className="save-logo-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004L8.008 8l4.004 4 4.004-4-4.004-4.004zM12.012 12l-4.004 4.004L12.012 20l4.004-4.004L12.012 12z" />
                            <path d="M20 3.992l-4.004 4.004L20 12l4-4.004L20 3.992z" />
                        </svg>
                    </button>
                </div>
            </div>


            {/* 💀 THE PURGE - Now handled by mega-announcement splash + persistent indicator above */}



            {/* ⚔️ VERSUS BATTLE COMPONENT - Show when battle is active */}
            {
                versusBattle.active && versusBattle.songA && versusBattle.songB && (
                    <ErrorBoundary fallback={<div className="battle-error">⚔️ Battle error - refreshing...</div>}>
                        <VersusBattle
                            battle={versusBattle}
                            visitorId={visitorId || ''}
                            onVote={handleBattleVote}
                            isVoting={isVotingInBattle}
                        />
                    </ErrorBoundary>
                )
            }

            {isBanned && <div className="banned-banner">⚠️ A moderator paused your access. <span className="banned-detail">It resets next round.</span></div>}

            {/* ═══════════════════════════════════════════════════════════
                SEARCH BAR - Only when session active and adding is enabled
               ═══════════════════════════════════════════════════════════ */}
            {
                (isAdminOnFrontPage || (permissions.canAddSongs && canParticipate && (userStatus.songsRemaining > 0 || karmaBonuses.bonusSongAdds > 0))) ? (
                    <div className={`search-bar-container ${showCoachMark === 'search' ? 'coach-highlight' : ''}`}>
                        <input
                            id="search-input"
                            type="text"
                            className="search-input-stream"
                            placeholder="Search for a song..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onBlur={() => setTimeout(() => setShowResults(false), 450)}
                            onFocus={() => { searchResults.length > 0 && setShowResults(true); if (showCoachMark === 'search') setShowCoachMark(null); }}
                        />
                        {showCoachMark === 'search' && (
                            <div className="coach-mark-tooltip">
                                🎵 Search for a song to add it to the playlist
                            </div>
                        )}
                        {isSearching && <span className="search-spinner">...</span>}

                        {showResults && searchResults.length > 0 && (
                            <div className="search-dropdown-stream">
                                <div className="search-results-header">
                                    🔍 Results <span className="header-hint">Tap to add →</span>
                                </div>
                                {searchResults.slice(0, 5).map((track) => (
                                    <div
                                        key={track.id}
                                        className={`search-result-row ${isAddingSong === track.id ? 'adding' : ''} ${isSongInPlaylist(track.id) ? 'in-playlist' : 'can-add'}`}
                                        onMouseDown={() => isSongInPlaylist(track.id) ? scrollToSongInPlaylist(track.id) : (!isAddingSong && handleAddSong(track))}
                                    >
                                        <img src={track.albumArt || '/placeholder.svg'} alt="" />
                                        <div className="result-info">
                                            <span className="result-name">{track.name}</span>
                                            <span className="result-artist">{track.artist}</span>
                                        </div>
                                        {isAddingSong === track.id ? (
                                            <span className="adding-spinner">⏳</span>
                                        ) : isSongInPlaylist(track.id) ? (
                                            <span className="already-added">✓ Already added</span>
                                        ) : (
                                            <span className="add-btn-stream">+ Add</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* No results state */}
                        {showResults && searchResults.length === 0 && !isSearching && searchQuery.length > 2 && (
                            <div className="search-dropdown-stream">
                                <div className="search-empty-state">No results for "{searchQuery}" — try a different search</div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="search-bar-container">
                        <input
                            type="text"
                            className="search-input-stream search-input-disabled"
                            placeholder={
                                !(timerRunning && timerRemaining > 0) ? '🎵 Song adding opens when we go live' :
                                    isLocked ? '🔒 Song adding is paused' :
                                        !permissions.canAddSongs ? '🔒 Song adding is off right now' :
                                            !username ? '👤 Set your name to add songs' :
                                                (userStatus.songsRemaining <= 0 && karmaBonuses.bonusSongAdds <= 0) ? `All ${userStatus.songsAdded} song slots used — vote to shape the playlist` :
                                                    'Search for a song...'
                            }
                            disabled
                        />
                    </div>
                )
            }

            {/* ═══════════════════════════════════════════════════════════
                SONG LIST - The main star. Music first!
               ═══════════════════════════════════════════════════════════ */}
            <div className={`song-list-stream${chatDocked ? ' chat-docked' : ''}`} id="song-list">
                {sortedSongs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon"><img src="/logo.png" alt="" className="empty-crate-icon" /></div>
                        {timerRunning ? (
                            <>
                                <div className="empty-title">
                                    Playlist is empty — be the first to add a song
                                </div>
                                <div className="empty-subtitle">
                                    Search above to add a song.
                                </div>
                            </>
                        ) : username ? (
                            <>
                                <div className="empty-title">
                                    Welcome back, {username}! 🎧
                                </div>

                                {/* 📊 WELCOME-BACK CARD — Show last session recap if available */}
                                {lastSession ? (
                                    <div className="welcome-back-card">
                                        <div className="welcome-back-header">Your Last Event</div>
                                        <div className="welcome-back-stats">
                                            {lastSession.topSongName && lastSession.topSongRank && (
                                                <div className="welcome-back-stat">
                                                    <span className="wb-stat-icon">{lastSession.topSongRank <= 3 ? '🏆' : '🎵'}</span>
                                                    <span className="wb-stat-text">
                                                        <strong>&ldquo;{lastSession.topSongName}&rdquo;</strong> finished <strong>#{lastSession.topSongRank}</strong>
                                                    </span>
                                                </div>
                                            )}
                                            {lastSession.totalVotesCast > 0 && (
                                                <div className="welcome-back-stat">
                                                    <span className="wb-stat-icon">🗳️</span>
                                                    <span className="wb-stat-text">{lastSession.totalVotesCast} votes cast</span>
                                                </div>
                                            )}
                                            {lastSession.totalSongsAdded > 0 && (
                                                <div className="welcome-back-stat">
                                                    <span className="wb-stat-icon">🎶</span>
                                                    <span className="wb-stat-text">{lastSession.totalSongsAdded} songs added</span>
                                                </div>
                                            )}
                                            {lastSession.karmaEarned > 0 && (
                                                <div className="welcome-back-stat">
                                                    <span className="wb-stat-icon">⭐</span>
                                                    <span className="wb-stat-text">+{lastSession.karmaEarned} karma earned</span>
                                                </div>
                                            )}
                                            {lastSession.playlistSize > 0 && (
                                                <div className="welcome-back-stat">
                                                    <span className="wb-stat-icon">📋</span>
                                                    <span className="wb-stat-text">{lastSession.playlistSize} songs in playlist · {lastSession.participantCount || '?'} participants</span>
                                                </div>
                                            )}
                                        </div>
                                        <a
                                            href={generateCalendarUrl()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="welcome-back-calendar"
                                        >
                                            📅 Add to Calendar
                                        </a>
                                    </div>
                                ) : (
                                    <div className="empty-subtitle">
                                        No live event right now. We go live weekly — add songs, vote, and build playlists together.
                                    </div>
                                )}

                                {broadcastCountdown && (
                                    <div className="empty-countdown">
                                        🕐 Next live event in <strong>{broadcastCountdown}</strong>
                                        <a
                                            href={generateCalendarUrl()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="countdown-calendar-link"
                                        >
                                            📅 Add to Calendar
                                        </a>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="empty-title">
                                    Welcome to Crate Hackers
                                </div>
                                <div className="empty-subtitle">
                                    Every week we go live. Add songs, vote, and build the playlist together.
                                </div>
                                {broadcastCountdown && (
                                    <div className="empty-countdown">
                                        🕐 Next live event in <strong>{broadcastCountdown}</strong>
                                        <a
                                            href={generateCalendarUrl()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="countdown-calendar-link"
                                        >
                                            📅 Add to Calendar
                                        </a>
                                    </div>
                                )}
                            </>
                        )}

                        {/* 📬 Mailing List RSVP — only shown when session is NOT active AND user hasn't already signed up */}
                        {!timerRunning && !waitingRsvpAlreadyDone && (
                            <div className="waiting-rsvp">
                                {waitingRsvpStatus === 'success' ? (
                                    <div className="waiting-rsvp-success">
                                        <span className="waiting-rsvp-check">✅</span> You're on the list! We'll notify you before the next event.
                                    </div>
                                ) : (
                                    <>
                                        <p className="waiting-rsvp-label">Get notified when we go live</p>
                                        <form className="waiting-rsvp-form" onSubmit={async (e) => {
                                            e.preventDefault();
                                            const email = waitingEmail.trim();
                                            if (!email || !isValidEmail(email)) {
                                                setWaitingRsvpError('Enter a valid email address');
                                                return;
                                            }
                                            setWaitingRsvpStatus('submitting');
                                            setWaitingRsvpError(null);
                                            try {
                                                const res = await fetch('/api/kartra', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ email, firstName: username || 'Visitor' }),
                                                });
                                                const data = await res.json();
                                                if (data.success) {
                                                    setWaitingRsvpStatus('success');
                                                    setWaitingRsvpAlreadyDone(true);
                                                    persistSet('crate-rsvp-done', 'true');
                                                } else {
                                                    if (data.error?.includes('already')) {
                                                        setWaitingRsvpStatus('success');
                                                        setWaitingRsvpAlreadyDone(true);
                                                        persistSet('crate-rsvp-done', 'true');
                                                    } else {
                                                        setWaitingRsvpStatus('error');
                                                        setWaitingRsvpError('Something went wrong — try again');
                                                    }
                                                }
                                            } catch (_) {
                                                setWaitingRsvpStatus('error');
                                                setWaitingRsvpError('Connection issue — try again');
                                            }
                                        }}>
                                            <input
                                                type="email"
                                                className="waiting-rsvp-input"
                                                placeholder="your@email.com"
                                                value={waitingEmail}
                                                onChange={(e) => { setWaitingEmail(e.target.value); setWaitingRsvpError(null); }}
                                                disabled={waitingRsvpStatus === 'submitting'}
                                            />
                                            <button
                                                type="submit"
                                                className="waiting-rsvp-btn"
                                                disabled={waitingRsvpStatus === 'submitting' || !waitingEmail.trim()}
                                            >
                                                {waitingRsvpStatus === 'submitting' ? 'Submitting...' : 'Notify Me'}
                                            </button>
                                        </form>
                                        {waitingRsvpError && (
                                            <p className="waiting-rsvp-error">{waitingRsvpError}</p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* ✅ Already on the list — subtle confirmation */}
                        {!timerRunning && waitingRsvpAlreadyDone && (
                            <div className="waiting-rsvp-already">
                                ✅ You're on the list — we'll email you before the next event.
                            </div>
                        )}
                    </div>
                ) : (
                    sortedSongs.map((song, index) => {
                        const hasUpvoted = userVotes.upvotedSongIds.includes(song.id);
                        const hasDownvoted = userVotes.downvotedSongIds.includes(song.id);
                        const isMyComment = song.addedBy === visitorId;
                        const movement = recentlyMoved[song.id];
                        const isNewEntry = (Date.now() - song.addedAt) < 60000; // 60s

                        return (
                            <div
                                key={song.id}
                                data-song-id={song.id}
                                className={`song-row-stream ${index < 3 ? 'top-song' : ''} ${isMyComment ? 'my-song' : ''} ${movement ? `move-${movement}` : ''} ${isNewEntry ? 'new-entry' : ''}`}
                                onMouseEnter={markInteraction}
                                onTouchStart={markInteraction}
                            >
                                {/* Rank */}
                                <span
                                    className={`rank-badge ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}
                                    data-tooltip={index < 3 ? `Top 3 earn +5 karma` : `Rank #${index + 1}`}
                                    tabIndex={0}
                                >
                                    {index === 0 ? '👑' : `#${index + 1}`}
                                    {isNewEntry && <span className="new-entry-badge">🆕</span>}
                                </span>

                                {/* Album Art - clean, no overlay */}
                                <div className="album-art-wrapper">
                                    <img src={song.albumArt || '/placeholder.svg'} alt="" className="album-thumb" />
                                </div>

                                {/* Play Button - separate, always visible */}
                                <button
                                    className={`play-preview-btn ${isLoadingVideo === song.id ? 'loading' : ''}`}
                                    onClick={(e) => handleOpenVideoPreview(song.id, song.name, song.artist, e)}
                                    title="Play music video"
                                >
                                    {isLoadingVideo === song.id ? '⏳ Loading...' : '▶'}
                                </button>

                                {/* Song Info - super compact */}
                                <div className="song-info-stream">
                                    <span className="song-title">{song.name}</span>
                                    <span className="song-artist">
                                        {song.artist} <span className="by-user" style={{ color: isMyComment ? userColor : (song.addedByColor || '#9ca3af'), opacity: 1 }}>• {song.addedByName}{isMyComment && ' (you)'}</span>
                                        {song.addedByLocation && <span className="location-badge" title={`From ${song.addedByLocation}`}>📍{song.addedByLocation}</span>}
                                    </span>
                                </div>

                                {/* Voting - inline thumbs down/up with score (hidden if voting disabled) */}
                                {permissions.canVote && (
                                    <div className="vote-inline">
                                        <button
                                            className={`thumb-btn down ${hasDownvoted ? 'active' : ''} ${votingInProgress.has(song.id) ? 'voting' : ''} ${!canParticipate && !isAdminOnFrontPage ? 'participation-locked' : ''}`}
                                            onClick={() => handleVote(song.id, -1)}
                                            disabled={votingInProgress.has(song.id)}
                                            aria-label={hasDownvoted ? `Remove downvote from ${song.name}` : `Downvote ${song.name}`}
                                            data-tooltip={hasDownvoted ? 'Remove downvote' : 'Downvote'}
                                        >
                                            {votingInProgress.has(song.id) ? '⏳' : '👎'}
                                        </button>
                                        <span
                                            className={`vote-score ${song.score > 0 ? 'positive' : song.score < 0 ? 'negative' : ''}`}
                                            data-tooltip={`Score: ${song.score > 0 ? '+' : ''}${song.score}`}
                                            tabIndex={0}
                                            aria-label={`Score: ${song.score > 0 ? 'plus ' : song.score < 0 ? 'minus ' : ''}${Math.abs(song.score)}`}
                                        >
                                            {song.score > 0 ? '+' : ''}{song.score}
                                        </span>
                                        <button
                                            className={`thumb-btn up ${hasUpvoted ? 'active' : ''} ${votingInProgress.has(song.id) ? 'voting' : ''} ${!canParticipate && !isAdminOnFrontPage ? 'participation-locked' : ''}`}
                                            onClick={() => handleVote(song.id, 1)}
                                            disabled={votingInProgress.has(song.id)}
                                            aria-label={hasUpvoted ? `Remove upvote from ${song.name}` : `Upvote ${song.name}`}
                                            data-tooltip={hasUpvoted ? 'Remove upvote' : 'Upvote'}
                                        >
                                            {votingInProgress.has(song.id) ? '⏳' : '👍'}
                                        </button>
                                    </div>
                                )}

                                {/* 💀 THE PURGE - Only visible during purge window */}
                                {deleteWindow.active && deleteWindow.canDelete && (
                                    <button
                                        className={`chaos-delete-btn ${purgeArmedSongId === song.id ? 'armed' : ''}`}
                                        onClick={() => {
                                            if (purgeArmedSongId === song.id) {
                                                handleWindowDelete(song.id);
                                                setPurgeArmedSongId(null);
                                                if (purgeArmTimeout.current) clearTimeout(purgeArmTimeout.current);
                                            } else {
                                                setPurgeArmedSongId(song.id);
                                                if (purgeArmTimeout.current) clearTimeout(purgeArmTimeout.current);
                                                purgeArmTimeout.current = setTimeout(() => setPurgeArmedSongId(null), 3000);
                                            }
                                        }}
                                        disabled={isDeleting}
                                        title={purgeArmedSongId === song.id ? 'Tap again to confirm' : 'Delete this song'}
                                    >
                                        {purgeArmedSongId === song.id ? '⚠️ Confirm?' : '💀'}
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* � JUKEBOX MODE - Full-screen music experience */}
            {
                jukeboxState && (
                    <JukeboxPlayer
                        currentSong={jukeboxState.song}
                        videoId={jukeboxState.videoId}
                        playlist={sortedSongs}
                        onClose={() => setJukeboxState(null)}
                        onNextSong={handleJukeboxNextSong}
                        onVote={(songId, delta) => handleVote(songId, delta as 1 | -1)}
                        onKarmaEarned={handleJukeboxKarmaEarned}
                        visitorId={visitorId || undefined}
                        streamMode={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('stream') === 'true'}
                        bombCount={nowPlaying?.bombCount ?? 0}
                        bombThreshold={nowPlaying?.bombThreshold ?? 5}
                        onBomb={handleBombSong}
                    />
                )
            }

            {/* �🎬 Video Preview Popup (fallback - now mainly used for Jukebox) */}
            {
                videoPreview && !jukeboxState && (
                    <VideoPreview
                        videoId={videoPreview.videoId}
                        songName={videoPreview.songName}
                        artistName={videoPreview.artistName}
                        anchorRect={videoPreview.anchorRect}
                        onClose={() => setVideoPreview(null)}
                    />
                )
            }

            {/* 📊 SESSION RECAP OVERLAY — Personalized end-of-session summary */}
            {showSessionRecap && sessionRecap && (
                <div className="session-recap-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSessionRecap(false); }}>
                    <div className="session-recap-card">
                        <button className="recap-close" onClick={() => setShowSessionRecap(false)}>✕</button>
                        <div className="recap-header">
                            <img src="/logo.png" alt="" className="recap-logo" />
                            <h2 className="recap-title">Event Complete! 🎧</h2>
                        </div>
                        <div className="recap-stats">
                            {sessionRecap.topSongName && sessionRecap.topSongRank && (
                                <div className="recap-stat highlight">
                                    <span className="recap-stat-icon">{sessionRecap.topSongRank === 1 ? '👑' : sessionRecap.topSongRank <= 3 ? '🏆' : '🎵'}</span>
                                    <div className="recap-stat-content">
                                        <span className="recap-stat-label">Your Best Song</span>
                                        <span className="recap-stat-value">&ldquo;{sessionRecap.topSongName}&rdquo; — #{sessionRecap.topSongRank}</span>
                                    </div>
                                </div>
                            )}
                            {sessionRecap.totalSongsAdded > 0 && (
                                <div className="recap-stat">
                                    <span className="recap-stat-icon">🎶</span>
                                    <div className="recap-stat-content">
                                        <span className="recap-stat-label">Songs Added</span>
                                        <span className="recap-stat-value">{sessionRecap.totalSongsAdded}</span>
                                    </div>
                                </div>
                            )}
                            <div className="recap-stat">
                                <span className="recap-stat-icon">🗳️</span>
                                <div className="recap-stat-content">
                                    <span className="recap-stat-label">Votes Cast</span>
                                    <span className="recap-stat-value">{sessionRecap.totalVotesCast}</span>
                                </div>
                            </div>
                            {sessionRecap.karmaEarned > 0 && (
                                <div className="recap-stat">
                                    <span className="recap-stat-icon">⭐</span>
                                    <div className="recap-stat-content">
                                        <span className="recap-stat-label">Karma Earned</span>
                                        <span className="recap-stat-value">+{sessionRecap.karmaEarned}</span>
                                    </div>
                                </div>
                            )}
                            <div className="recap-stat">
                                <span className="recap-stat-icon">📋</span>
                                <div className="recap-stat-content">
                                    <span className="recap-stat-label">Playlist</span>
                                    <span className="recap-stat-value">{sessionRecap.playlistSize} songs · {sessionRecap.participantCount || '?'} participants</span>
                                </div>
                            </div>
                        </div>
                        <div className="recap-footer">
                            <p className="recap-next">Next event: <strong>Tuesday 8 PM ET</strong></p>
                            <a
                                href={generateCalendarUrl()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="recap-calendar-btn"
                            >
                                📅 Add to Calendar
                            </a>
                            <button className="recap-dismiss-btn" onClick={() => setShowSessionRecap(false)}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 🍞 TOAST NOTIFICATIONS */}
            <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        </div >
    );
}
