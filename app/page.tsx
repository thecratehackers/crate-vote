'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { APP_CONFIG, BLOCKED_WORDS, GAME_TIPS, LIMITS } from '@/lib/config';
import { PlaylistSkeleton } from '@/components/Skeleton';
import VersusBattle from '@/components/VersusBattle';
import VideoPreview from '@/components/VideoPreview';
import JukeboxPlayer from '@/components/JukeboxPlayer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastContainer, useToast } from '@/components/Toast';
import { SoundEffects } from '@/lib/sounds';

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
            throw new Error('Request timed out - please check your connection');
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

    // 📺 STREAM EMBED - Admin-controlled live stream (YouTube or Twitch)
    const [streamPlatform, setStreamPlatform] = useState<'youtube' | 'twitch' | null>(null);
    const [youtubeEmbed, setYoutubeEmbed] = useState<string | null>(null);
    const [twitchChannel, setTwitchChannel] = useState<string | null>(null);
    const [streamMinimized, setStreamMinimized] = useState(true); // Start as PiP
    const [twitchParent, setTwitchParent] = useState('localhost');
    const [hideStreamLocally, setHideStreamLocally] = useState(false); // Admin screen-share mirror prevention
    const youtubePlayerRef = useRef<HTMLIFrameElement | null>(null);
    const youtubeWasUnmuted = useRef<boolean>(false);  // Track if user had audio on

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
            return a.addedAt - b.addedAt; // Older first for ties
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

            // Load saved username and avatar from localStorage
            const savedName = localStorage.getItem('crate-username');
            const savedAvatar = localStorage.getItem('crate-avatar');
            const savedColor = localStorage.getItem('crate-color');
            const savedSounds = localStorage.getItem('crate-sounds');
            const savedLocation = localStorage.getItem('crate-location');

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
            const hideStream = localStorage.getItem('crate-admin-hide-stream');
            if (hideStream === 'true') {
                setHideStreamLocally(true);
            }
            if (!savedName) {
                setShowUsernameModal(true);
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
                    try {
                        localStorage.setItem('crate-location', locationDisplay);
                    } catch (e) {
                        // localStorage full or disabled
                    }
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
    const handleSetUsername = async () => {
        const name = usernameInput.trim();
        if (name.length === 0) {
            setMessage({ type: 'error', text: 'Please enter a name' });
            return;
        }
        // Check for profanity
        if (containsBadWord(name)) {
            setMessage({ type: 'error', text: 'Please choose an appropriate username' });
            return;
        }
        setIsSavingUsername(true);
        // Simulate slight delay for feedback
        await new Promise(resolve => setTimeout(resolve, 200));
        setUsername(name);
        try {
            localStorage.setItem('crate-username', name);
            if (avatarInput) {
                localStorage.setItem('crate-avatar', avatarInput);
                setUserAvatar(avatarInput);
            }
            localStorage.setItem('crate-color', colorInput);
            setUserColor(colorInput);
        } catch (e) {
            // localStorage full or disabled - continue anyway, just won't persist
            console.warn('Could not save to localStorage:', e);
        }
        setIsSavingUsername(false);
        setShowUsernameModal(false);
        setMessage({ type: 'success', text: `Welcome, ${name}!` });
    };

    // Fetch playlist data with rank tracking for dopamine effects
    // Use refs to avoid stale closures in the callback dependencies
    const previousRanksRef = useRef(previousRanks);
    previousRanksRef.current = previousRanks;
    const seenActivityIdsRef = useRef(seenActivityIds);
    seenActivityIdsRef.current = seenActivityIds;

    const fetchPlaylist = useCallback(async (showRefreshIndicator = false) => {
        if (!visitorId) return;
        if (showRefreshIndicator) setIsRefreshing(true);

        try {
            const res = await fetchWithRetry('/api/songs', {
                headers: { 'x-visitor-id': visitorId },
            }, 2, 8000); // 2 retries, 8 second timeout

            const data = await res.json();
            const newSongs: Song[] = data.songs;

            // 🎉 DOPAMINE: Track rank changes
            const newRanks: Record<string, number> = {};
            const rankChanges: Record<string, 'up' | 'down' | 'new'> = {};

            // Sort to get current ranks (matching main sorting logic)
            const sorted = [...newSongs].sort((a, b) => {
                // Priority 1: Unvoted songs (score === 0) rise to the top
                const aIsUnvoted = a.score === 0;
                const bIsUnvoted = b.score === 0;

                if (aIsUnvoted && !bIsUnvoted) return -1;
                if (!aIsUnvoted && bIsUnvoted) return 1;

                // Within unvoted: newest first
                if (aIsUnvoted && bIsUnvoted) {
                    return b.addedAt - a.addedAt;
                }

                // Within voted: score descending, then oldest first
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
            if (data.karmaRain && data.karmaRain.active && data.karmaRain.timestamp > lastKarmaRainTimestamp) {
                setLastKarmaRainTimestamp(data.karmaRain.timestamp);
                setShowKarmaRain(true);
                setConfettiMessage(`🌧️ KARMA RAIN! +1 karma for everyone!`);
                setShowConfetti(true);
                setTimeout(() => {
                    setShowKarmaRain(false);
                    setShowConfetti(false);
                }, 5000);
            }

            // 📢 Process live activity from server
            if (data.recentActivity && Array.isArray(data.recentActivity)) {
                const newActivities = data.recentActivity.filter(
                    (activity: ActivityItem) => !seenActivityIdsRef.current.has(activity.id)
                );

                if (newActivities.length > 0) {
                    // Mark as seen
                    setSeenActivityIds(prev => {
                        const newSet = new Set(prev);
                        newActivities.forEach((a: ActivityItem) => newSet.add(a.id));
                        return newSet;
                    });

                    // Add to toast queue (newest first)
                    setToastQueue(prev => [...newActivities, ...prev].slice(0, 5));
                }
            }
        } catch (error: any) {
            console.error('Failed to fetch playlist:', error);
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
    const fetchTimer = useCallback(async () => {
        try {
            const res = await fetchWithTimeout('/api/timer', {
                headers: visitorId ? { 'x-visitor-id': visitorId } : {},
            }, 5000); // 5 second timeout for timer
            const data: TimerStatus = await res.json();
            setTimerRunning(data.running);
            setTimerEndTime(data.endTime);
            setIsBanned(data.isBanned);

            if (data.running && data.endTime) {
                setTimerRemaining(Math.max(0, data.endTime - Date.now()));
            } else {
                setTimerRemaining(0);
            }
        } catch (error: any) {
            console.error('Failed to fetch timer:', error);
            // Silent fail for timer - it's not critical
        }
    }, [visitorId]);

    // Initial fetch
    useEffect(() => {
        if (visitorId) {
            fetchPlaylist();
            fetchTimer();
        }
    }, [fetchPlaylist, fetchTimer, visitorId]);

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
        }, 45000); // Every 45 seconds

        return () => clearInterval(tipInterval);
    }, []);

    // REAL-TIME POLLING - optimized for 1000+ concurrent users
    // Uses 15s base interval + random jitter to prevent thundering herd
    useEffect(() => {
        if (!visitorId) return;

        // Add random jitter (0-5 seconds) to spread out requests
        const jitter = Math.random() * 5000;
        const baseInterval = 15000; // 15 seconds base

        const poll = () => {
            fetchPlaylist();
            fetchTimer();
        };

        // Initial delayed start with jitter
        const initialTimeout = setTimeout(poll, jitter);

        // Subsequent polls at regular interval
        const interval = setInterval(poll, baseInterval);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [visitorId, fetchPlaylist, fetchTimer]);



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
                    setMessage({ type: 'success', text: 'Thanks for hanging out! +1 Karma' });
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

    // 🏆 WINNER DETECTION - When round ends, check if user won
    useEffect(() => {
        // Detect transition from running to stopped (round ended)
        if (previousTimerRunning.current && !timerRunning && songs.length > 0) {
            // Get the #1 song
            const topSong = songs[0];
            // Check if current user added the winning song
            if (topSong && topSong.addedBy === visitorId) {
                setWinnerSongName(topSong.name);
                setShowWinnerSplash(true);
            }
        }
        previousTimerRunning.current = timerRunning;
    }, [timerRunning, songs, visitorId]);

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
        }, 100); // Update frequently for smooth countdown

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
                setMessage({ type: 'success', text: '💥 Song deleted!' });
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
        }, 100);

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
                setMessage({ type: 'success', text: `⚔️ Voted for Song ${choice}!` });
            }
        } catch (error) {
            // Revert optimistic update on network error
            setVersusBattle(prev => ({ ...prev, userVote: previousVote }));
            setMessage({ type: 'error', text: 'Network error - try again quickly!' });
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
                setMessage({ type: 'error', text: 'Search failed - please try again' });
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [searchQuery]);

    // Add song with loading feedback
    const handleAddSong = async (track: SearchResult) => {
        if (!visitorId || (!username && !isAdminOnFrontPage)) {
            setMessage({ type: 'error', text: 'Please enter your name first' });
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
                setMessage({ type: 'error', text: data.error || 'Failed to add song' });
                return;
            }

            setMessage({ type: 'success', text: `✓ Added "${track.name}"!` });
            setSearchQuery('');
            setShowResults(false);
            setNoSearchResults(false);
            fetchPlaylist();

            // 🔊 Play sound effect
            if (soundsEnabled) {
                SoundEffects.addSong();
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error - please try again' });
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
                setMessage({ type: 'success', text: '🎯 Prediction locked in! Good luck!' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Could not save prediction' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error - please try again' });
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
                setMessage({ type: 'success', text: '🎵 Jukebox mode activated! Enjoy the music.' });
            } else {
                // No video found - show brief message
                setMessage({ type: 'error', text: 'No music video found for this song' });
                setTimeout(() => setMessage(null), 2000);
            }
        } catch (error) {
            console.error('Failed to load video:', error);
            setMessage({ type: 'error', text: 'Failed to load video preview' });
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


    // Vote on song - NEW MODEL: user gets ONE upvote and ONE downvote total
    const handleVote = async (songId: string, vote: 1 | -1) => {
        if (!visitorId || isBanned) {
            toast.error(isBanned ? 'You are banned from voting' : 'Please wait...');
            return;
        }

        // ⏱️ RATE LIMITING - Check if too soon since last vote on this song
        const lastVoteTime = voteTimestamps.current.get(songId);
        if (lastVoteTime && Date.now() - lastVoteTime < VOTE_COOLDOWN_MS) {
            toast.info('Slow down! Wait a moment before voting again.');
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
                setMessage({ type: 'error', text: 'No upvotes remaining!' });
                return;
            }
        } else {
            // DOWNVOTE
            if (hasDownvoted) {
                // Remove downvote (toggle off)
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
                setMessage({ type: 'error', text: 'No downvotes remaining!' });
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
                    toast.error('You have been banned');
                } else if (data.error?.includes('not found') || data.error?.includes('locked')) {
                    // Song was deleted or playlist was locked - refresh to sync
                    toast.info('Song was modified - refreshing...');
                    fetchPlaylist();
                } else {
                    toast.error(data.error || 'Vote failed');
                }
            } else {
                // Success - brief confirmation (only show occasionally to avoid spam)
                if (Math.random() < 0.3) {
                    toast.success(vote === 1 ? '👍 Upvoted!' : '👎 Downvoted!');
                }
            }
        } catch (error) {
            console.error('Vote failed:', error);
            toast.error('Vote failed - check your connection');
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
        fetchTimer();
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

    // Check if song is already in playlist
    const isSongInPlaylist = (trackId: string) => songs.some(s => s.id === trackId);

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
                        <img src="/logo.png" alt="" className="mini-logo" />
                        <span className="brand-name">{APP_CONFIG.name}</span>
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

    // Export to Spotify - redirect to export page for OAuth flow
    const handleExport = () => {
        setIsExporting(true);
        setMessage({ type: 'success', text: 'Redirecting to Spotify...' });
        window.location.href = '/export';
    };

    return (
        <div className="stream-layout">

            {/* 🔒 JOIN OVERLAY — glassmorphism over live page */}
            {showUsernameModal && (
                <div className="join-overlay">
                    <div className="join-card">
                        <img src="/logo.png" alt="Crate Hackers" className="join-logo" />
                        <h2 className="join-title">Join the Crate Hackers Hackathon</h2>
                        <p className="join-subtitle">Pick songs, vote, and collaborate live with DJs worldwide.
                            Every Tuesday at 8 PM ET.</p>

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
                                {isSavingUsername ? 'Joining...' : "Let's Go! 🚀"}
                            </button>
                        </div>

                        <div className="join-rsvp-section">
                            <p className="join-rsvp-label">📅 RSVP — Tuesdays at 8 PM ET</p>
                            <a
                                href="https://www.addevent.com/event/Kc25151651"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="join-rsvp-btn"
                            >
                                RSVP — Get on the List
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* 🎉 CONFETTI CELEBRATION OVERLAY */}
            {showConfetti && (
                <div className="confetti-overlay">
                    <div className="confetti-message">{confettiMessage}</div>
                </div>
            )}

            {/* 🌧️ KARMA RAIN ANIMATION */}
            {showKarmaRain && (
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
            )}

            {/* 🎰 MEGA-ANNOUNCEMENT: PURGE SPLASH */}
            {showPurgeSplash && (
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
                    <p className="mega-subtitle">Delete ANY song! Choose wisely...</p>
                    <div className="mega-countdown">{Math.ceil(deleteWindowRemaining / 1000)}s</div>
                </div>
            )}

            {/* 🎰 MEGA-ANNOUNCEMENT: KARMA RAIN SPLASH */}
            {showKarmaRainSplash && (
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
            )}

            {/* 🎰 MEGA-ANNOUNCEMENT: WIPE SPLASH */}
            {showWipeSplash && (
                <div className="mega-announcement wipe">
                    <span className="mega-icon">🗑️</span>
                    <h1 className="mega-title">PLAYLIST WIPED!</h1>
                    <p className="mega-subtitle">Fresh start! Add your songs now.</p>
                </div>
            )}

            {/* 🏆 WINNER ANNOUNCEMENT - Promo code popup */}
            {showWinnerSplash && (
                <div className="winner-announcement" onClick={(e) => e.target === e.currentTarget && setShowWinnerSplash(false)}>
                    <div className="winner-modal">
                        <button className="winner-close" onClick={() => setShowWinnerSplash(false)}>✕</button>
                        <div className="winner-confetti">🎉</div>
                        <h1 className="winner-title">YOU WON! 🏆</h1>
                        <p className="winner-song">Your song "{winnerSongName}" hit #1!</p>
                        <div className="winner-prize">
                            <img src="/hat-prize.png" alt="Free Hat" className="prize-image" />
                            <div className="prize-details">
                                <h2>FREE HAT!</h2>
                                <p className="promo-code">Use code: <strong>HACKATHONWINNER</strong></p>
                            </div>
                        </div>
                        <img src="/djstyle-logo.png" alt="DJ.style" className="djstyle-logo" />
                        <a
                            href="https://dj.style/discount/HACKATHONWINNER?redirect=%2Fproducts%2Fcrate-hackers-vintage-cotton-twill-hat-special-offer"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="claim-prize-btn"
                        >
                            🎁 CLAIM YOUR FREE HAT
                        </a>
                        <p className="winner-note">Click to visit DJ.style - code auto-applies!</p>
                    </div>
                </div>
            )}

            {/* 🔴 PERSISTENT PURGE INDICATOR (after splash) */}
            {deleteWindow.active && !showPurgeSplash && (
                <div className={`purge-persistent-indicator ${!deleteWindow.canDelete ? 'inactive-user' : ''}`}>
                    <span className="purge-icon">💀</span>
                    <span className="purge-text">PURGE ACTIVE</span>
                    <span className="purge-countdown">{Math.ceil(deleteWindowRemaining / 1000)}s</span>
                    {!deleteWindow.canDelete && deleteWindow.reason && (
                        <span className="purge-restriction">{deleteWindow.reason}</span>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                COMPACT TOP BAR - Everything important on 1-2 lines
               ═══════════════════════════════════════════════════════════ */}
            <header className="stream-header">
                <div className="header-left">
                    <Link href="/" className="logo-home-link" title="Go to Home">
                        <img src="/logo.png" alt="" className="mini-logo" />
                    </Link>
                    <span className="brand-name">{APP_CONFIG.name}</span>
                    {/* Discrete admin link */}
                    <Link href="/admin" className="admin-link-subtle" title="Admin Panel">
                        ⚙️
                    </Link>
                    {/* Rules info popover */}
                    <div className="rules-popover-wrapper">
                        <button
                            className="admin-link-subtle rules-info-btn"
                            title="How to play"
                            onClick={() => setShowRulesPopover(!showRulesPopover)}
                        >
                            ℹ️
                        </button>
                        {showRulesPopover && (
                            <div className="rules-popover">
                                <div className="rules-popover-arrow" />
                                <h4>🎶 How to Play</h4>
                                <ul>
                                    <li>💿 Add up to 5 songs</li>
                                    <li>🗳️ 10 upvotes & 10 downvotes</li>
                                    <li>🏆 Top 3 songs win!</li>
                                </ul>
                                <button className="rules-popover-close" onClick={() => setShowRulesPopover(false)}>Got it!</button>
                            </div>
                        )}
                    </div>
                    {/* LIVE badge integrated into header with viewer count */}
                    {timerRunning && (
                        <span className="live-badge-inline">
                            <span className="live-pulse"></span>
                            LIVE • {formatTime(timerRemaining)}
                            {viewerCount > 0 && <span className="viewer-count">• 👁 {viewerCount}</span>}
                        </span>
                    )}
                </div>
                <div className="header-right">
                    {!isBanned && isSessionActive && (
                        <div className="action-stats">
                            {/* Songs remaining - hide if adding disabled */}
                            {permissions.canAddSongs && (
                                <span className="stat-counter songs" data-tooltip={`You can add ${userStatus.songsRemaining} more song${userStatus.songsRemaining !== 1 ? 's' : ''}`} tabIndex={0}>
                                    💿 {userStatus.songsRemaining}
                                </span>
                            )}
                            {/* Upvotes remaining - hide if voting disabled */}
                            {permissions.canVote && (
                                <span className="stat-counter upvotes" data-tooltip={`${userStatus.upvotesRemaining} upvote${userStatus.upvotesRemaining !== 1 ? 's' : ''} left — boost songs you like!`} tabIndex={0}>
                                    👍 {userStatus.upvotesRemaining}
                                </span>
                            )}
                            {/* Downvotes remaining - hide if voting disabled */}
                            {permissions.canVote && (
                                <span className="stat-counter downvotes" data-tooltip={`${userStatus.downvotesRemaining} downvote${userStatus.downvotesRemaining !== 1 ? 's' : ''} left — sink songs you don't want`} tabIndex={0}>
                                    👎 {userStatus.downvotesRemaining}
                                </span>
                            )}
                            {/* Karma - only show if > 0 */}
                            {karmaBonuses.karma > 0 && (
                                <span className="stat-counter karma" data-tooltip="Karma points! Each gives +1 song & +1 vote" tabIndex={0}>
                                    ✨ {karmaBonuses.karma}
                                </span>
                            )}
                            {/* 👑 GOD MODE - User's song is #1 (unlimited votes, extra purge deletes) */}
                            {userStatus.isGodMode && (
                                <span className="god-mode-badge" data-tooltip="Your song is #1! Unlimited votes + extra Purge power!" tabIndex={0}>
                                    👑 GOD MODE
                                </span>
                            )}
                        </div>
                    )}
                    <a
                        href="https://www.addevent.com/event/Kc25151651"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="stat-pill rsvp-pill"
                        data-tooltip="RSVP — Live every Tuesday at 8 PM ET"
                    >
                        📅
                    </a>
                    <span className="stat-pill capacity" data-tooltip={`Playlist: ${playlistStats.current} of ${playlistStats.max} songs`} tabIndex={0}>
                        {playlistStats.current}/{playlistStats.max}
                    </span>
                    {username && (
                        <button
                            className="user-pill"
                            onClick={() => {
                                setUsernameInput(username);
                                setAvatarInput(userAvatar);
                                setShowUsernameModal(true);
                            }}
                            data-tooltip="Tap to edit profile"
                        >
                            <span className="user-pill-avatar">{userAvatar}</span>
                            {username} <span className="edit-hint">✏️</span>
                        </button>
                    )}
                </div>
            </header>

            {/* 🎮 GAME FEATURES BAR - Leaderboard, Predictions, Sound toggle */}
            {timerRunning && (
                <div className="game-features-bar">
                    <button
                        className={`feature-btn ${showLeaderboard ? 'active' : ''}`}
                        onClick={() => { setShowLeaderboard(!showLeaderboard); if (!showLeaderboard) fetchLeaderboard(); }}
                    >
                        🏆 Top DJs
                    </button>

                    {!predictionsLocked && !userPrediction && (
                        <button
                            className="feature-btn prediction"
                            onClick={() => setShowPredictionModal(true)}
                        >
                            🎯 Predict #1
                        </button>
                    )}

                    {userPrediction && (
                        <span className="prediction-badge">
                            🎯 Predicted!
                        </span>
                    )}

                    <button
                        className={`feature-btn sound-toggle ${soundsEnabled ? '' : 'muted'}`}
                        onClick={() => {
                            const newState = !soundsEnabled;
                            setSoundsEnabled(newState);
                            SoundEffects.setEnabled(newState);
                        }}
                        title={soundsEnabled ? 'Mute sounds' : 'Enable sounds'}
                    >
                        {soundsEnabled ? '🔊' : '🔇'}
                    </button>
                </div>
            )}

            {/* 📺 LIVE STREAM HOST - Dual mode: PiP (bottom-right) / Expanded (sticky top) */}
            {/* YouTube Mode */}
            {!hideStreamLocally && streamPlatform === 'youtube' && youtubeEmbed && (
                <div className={`stream-host ${streamMinimized ? 'pip-mode' : 'expanded-mode'}`}>
                    <div className="stream-host-header">
                        <span className="live-host-badge replay-badge">🎬 REPLAY</span>
                        <div className="stream-host-controls">
                            {!streamMinimized && (
                                <a
                                    href="https://www.addevent.com/event/Kc25151651"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="stream-rsvp-btn"
                                    title="RSVP for the next event"
                                >
                                    📅 RSVP
                                </a>
                            )}
                            <button
                                className="stream-toggle-btn"
                                onClick={() => setStreamMinimized(!streamMinimized)}
                                title={streamMinimized ? 'Expand stream' : 'Minimize to PiP'}
                            >
                                {streamMinimized ? '⬜ ᴇxᴘᴀɴᴅ' : '➖'}
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
                            onClick={() => setStreamMinimized(false)}
                            aria-label="Expand and unmute stream"
                        >
                            <span className="pip-sound-prompt">🔊 Tap for sound</span>
                        </button>
                    )}
                </div>
            )}

            {/* Twitch Mode */}
            {!hideStreamLocally && streamPlatform === 'twitch' && twitchChannel && (
                <div className={`stream-host twitch-host ${streamMinimized ? 'pip-mode' : 'expanded-mode'}`}>
                    <div className="stream-host-header twitch-header">
                        <span className="live-host-badge twitch-badge">🟣 LIVE</span>
                        <div className="stream-host-controls">
                            {!streamMinimized && (
                                <a
                                    href="https://www.addevent.com/event/Kc25151651"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="stream-rsvp-btn twitch-rsvp"
                                    title="RSVP for the next event"
                                >
                                    📅 RSVP
                                </a>
                            )}
                            <button
                                className="stream-toggle-btn"
                                onClick={() => setStreamMinimized(!streamMinimized)}
                                title={streamMinimized ? 'Expand stream' : 'Minimize to PiP'}
                            >
                                {streamMinimized ? '⬜ ᴇxᴘᴀɴᴅ' : '➖'}
                            </button>
                        </div>
                    </div>
                    <div className={`twitch-content ${streamMinimized ? '' : 'twitch-expanded-layout'}`}>
                        <div className="stream-host-video">
                            <iframe
                                src={`https://player.twitch.tv/?channel=${twitchChannel}&parent=${twitchParent}&muted=true`}
                                title="Twitch Stream"
                                frameBorder="0"
                                allowFullScreen
                                scrolling="no"
                            />
                        </div>
                        {/* Chat only in expanded mode */}
                        {!streamMinimized && (
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
                            onClick={() => setStreamMinimized(false)}
                            aria-label="Expand and unmute stream"
                        >
                            <span className="pip-sound-prompt">🔊 Tap for sound</span>
                        </button>
                    )}
                </div>
            )}



            {showLeaderboard && (
                <div className="leaderboard-panel">
                    <div className="leaderboard-header">
                        <span>🏆 Top Contributors</span>
                        <button className="close-btn" onClick={() => setShowLeaderboard(false)}>×</button>
                    </div>
                    <div className="leaderboard-list">
                        {leaderboard.length === 0 ? (
                            <div className="leaderboard-empty">Add songs to appear here!</div>
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
            )}

            {/* 🎯 PREDICTION MODAL */}
            {showPredictionModal && (
                <div className="modal-overlay" onClick={() => setShowPredictionModal(false)}>
                    <div className="prediction-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>🎯 Predict the Winner!</h3>
                        <p>Which song will be #1 when voting ends?<br />Correct predictions earn <strong>+3 karma!</strong></p>
                        <div className="prediction-list">
                            {sortedSongs.slice(0, 10).map((song) => (
                                <button
                                    key={song.id}
                                    className="prediction-option"
                                    onClick={() => handleMakePrediction(song.id)}
                                >
                                    <img src={song.albumArt || '/placeholder.svg'} alt="" />
                                    <span className="pred-name">{song.name.length > 25 ? song.name.slice(0, 25) + '…' : song.name}</span>
                                    <span className="pred-score">+{song.score}</span>
                                </button>
                            ))}
                        </div>
                        <button className="cancel-btn" onClick={() => setShowPredictionModal(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* 🎧 YOUR REQUESTS - REMOVED: Now using in-playlist highlighting instead */}

            {/* 📦 PLAYLIST HEADER - Title + Activity ticker in fixed-height banner */}
            <div className="playlist-header-bar">
                <div className="playlist-header-left">
                    <span className="playlist-title-text">📦 {playlistTitle}</span>
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
                            {timerRunning ? currentShoutout || '🎵 Vote for your favorites!' : 'Waiting for session...'}
                        </span>
                    )}
                </div>

                <button
                    className="export-inline-btn"
                    onClick={handleExport}
                    disabled={isExporting}
                    title="Export playlist to Spotify anytime!"
                >
                    <img src="/spotify-logo.png" alt="" className="spotify-icon-sm" />
                    {isExporting ? '...' : 'Export'}
                </button>
            </div>


            {/* 💀 THE PURGE - Now handled by mega-announcement splash + persistent indicator above */}



            {/* ⚔️ VERSUS BATTLE COMPONENT - Show when battle is active */}
            {versusBattle.active && versusBattle.songA && versusBattle.songB && (
                <ErrorBoundary fallback={<div className="battle-error">⚔️ Battle error - refreshing...</div>}>
                    <VersusBattle
                        battle={versusBattle}
                        visitorId={visitorId || ''}
                        onVote={handleBattleVote}
                        isVoting={isVotingInBattle}
                    />
                </ErrorBoundary>
            )}

            {isBanned && <div className="banned-banner">🚫 You've been banned from this session</div>}

            {/* ═══════════════════════════════════════════════════════════
                SEARCH BAR - Only when session active and adding is enabled
               ═══════════════════════════════════════════════════════════ */}
            {
                (isAdminOnFrontPage || (permissions.canAddSongs && canParticipate && (userStatus.songsRemaining > 0 || karmaBonuses.bonusSongAdds > 0))) && (
                    <div className="search-bar-container">
                        <input
                            id="search-input"
                            type="text"
                            className="search-input-stream"
                            placeholder="🔍 Add a song..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onBlur={() => setTimeout(() => setShowResults(false), 300)}
                            onFocus={() => searchResults.length > 0 && setShowResults(true)}
                        />
                        {isSearching && <span className="search-spinner">...</span>}

                        {showResults && searchResults.length > 0 && (
                            <div className="search-dropdown-stream">
                                <div className="search-results-header">
                                    🔍 SEARCH RESULTS <span className="header-hint">Tap to add →</span>
                                </div>
                                {searchResults.slice(0, 5).map((track) => (
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
                                            <span className="already-added">✓ Added</span>
                                        ) : (
                                            <span className="add-btn-stream">+ ADD</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            }

            {/* ═══════════════════════════════════════════════════════════
                SONG LIST - The main star. Music first!
               ═══════════════════════════════════════════════════════════ */}
            <div className="song-list-stream" id="song-list">
                {sortedSongs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🎧</div>
                        <div className="empty-title">
                            {timerRunning ? 'No songs yet!' : 'Waiting for session...'}
                        </div>
                        <div className="empty-subtitle">
                            {timerRunning
                                ? 'Use the search bar above to add the first song and get the party started!'
                                : 'The admin will start a voting session soon. Hang tight!'}
                        </div>
                    </div>
                ) : (
                    sortedSongs.map((song, index) => {
                        const hasUpvoted = userVotes.upvotedSongIds.includes(song.id);
                        const hasDownvoted = userVotes.downvotedSongIds.includes(song.id);
                        const isMyComment = song.addedBy === visitorId;
                        const movement = recentlyMoved[song.id];

                        return (
                            <div
                                key={song.id}
                                className={`song-row-stream ${index < 3 ? 'top-song' : ''} ${isMyComment ? 'my-song' : ''} ${movement ? `move-${movement}` : ''}`}
                                onMouseEnter={markInteraction}
                                onTouchStart={markInteraction}
                            >
                                {/* Rank */}
                                <span
                                    className={`rank-badge ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}
                                    data-tooltip={index < 3 ? `Top 3 = +5 karma reward!` : `Rank #${index + 1}`}
                                    tabIndex={0}
                                >
                                    {index === 0 ? '👑' : `#${index + 1}`}
                                </span>

                                {/* Album Art - clean, no overlay */}
                                <div className="album-art-wrapper">
                                    <img src={song.albumArt || '/placeholder.svg'} alt="" className="album-thumb" />
                                </div>

                                {/* Play Button - separate, always visible */}
                                <button
                                    className={`play-preview-btn ${isLoadingVideo === song.id ? 'loading' : ''}`}
                                    onClick={(e) => handleOpenVideoPreview(song.id, song.name, song.artist, e)}
                                    title="Preview music video"
                                >
                                    {isLoadingVideo === song.id ? '⏳' : '▶'}
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
                                            className={`thumb-btn down ${hasDownvoted ? 'active' : ''} ${votingInProgress.has(song.id) ? 'voting' : ''}`}
                                            onClick={() => handleVote(song.id, -1)}
                                            disabled={!canParticipate || votingInProgress.has(song.id)}
                                            data-tooltip={hasDownvoted ? 'Remove downvote' : 'Downvote this song'}
                                        >
                                            {votingInProgress.has(song.id) ? '⏳' : '👎'}
                                        </button>
                                        <span
                                            className={`vote-score ${song.score > 0 ? 'positive' : song.score < 0 ? 'negative' : ''}`}
                                            data-tooltip={`Net score: ${song.score > 0 ? '+' : ''}${song.score}`}
                                            tabIndex={0}
                                        >
                                            {song.score > 0 ? '+' : ''}{song.score}
                                        </span>
                                        <button
                                            className={`thumb-btn up ${hasUpvoted ? 'active' : ''} ${votingInProgress.has(song.id) ? 'voting' : ''}`}
                                            onClick={() => handleVote(song.id, 1)}
                                            disabled={!canParticipate || votingInProgress.has(song.id)}
                                            data-tooltip={hasUpvoted ? 'Remove upvote' : 'Upvote this song'}
                                        >
                                            {votingInProgress.has(song.id) ? '⏳' : '👍'}
                                        </button>
                                    </div>
                                )}

                                {/* 💀 THE PURGE - Only visible during purge window */}
                                {deleteWindow.active && deleteWindow.canDelete && (
                                    <button
                                        className="chaos-delete-btn"
                                        onClick={() => handleWindowDelete(song.id)}
                                        disabled={isDeleting}
                                        title="PURGE this song!"
                                    >
                                        💀
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* � JUKEBOX MODE - Full-screen music experience */}
            {jukeboxState && (
                <JukeboxPlayer
                    currentSong={jukeboxState.song}
                    videoId={jukeboxState.videoId}
                    playlist={sortedSongs}
                    onClose={() => setJukeboxState(null)}
                    onNextSong={handleJukeboxNextSong}
                    onVote={(songId, delta) => handleVote(songId, delta as 1 | -1)}
                    onKarmaEarned={handleJukeboxKarmaEarned}
                    visitorId={visitorId || undefined}
                />
            )}

            {/* �🎬 Video Preview Popup (fallback - now mainly used for Jukebox) */}
            {videoPreview && !jukeboxState && (
                <VideoPreview
                    videoId={videoPreview.videoId}
                    songName={videoPreview.songName}
                    artistName={videoPreview.artistName}
                    anchorRect={videoPreview.anchorRect}
                    onClose={() => setVideoPreview(null)}
                />
            )}

            {/* 🍞 TOAST NOTIFICATIONS */}
            <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        </div>
    );
}
