'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { APP_CONFIG, BROADCAST } from '@/lib/config';
import { persistGet, persistSet, persistRemove } from '@/lib/persist';

interface Song {
    id: string;
    spotifyUri: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    addedBy: string;        // Visitor ID (fingerprint)
    addedByName: string;
    score: number;
}

interface ActiveUser {
    visitorId: string;
    name: string;
    songsAdded: number;
    isBanned: boolean;
    karma: number;
    lastActivity: number;
}

interface Stats {
    totalSongs: number;
    totalVotes: number;
    uniqueVoters: number;
}

interface TimerStatus {
    endTime: number | null;
    running: boolean;
    remaining: number;
}

interface ActivityItem {
    id: string;
    type: 'add' | 'upvote' | 'downvote';
    userName: string;
    visitorId: string;
    songName: string;
    userLocation?: string;  // Location annotation (e.g., "Austin, TX")
    timestamp: number;
}

// Tab type for admin panel navigation
type AdminTab = 'activity' | 'users' | 'playlist' | 'tools';

export default function AdminPage() {
    const { data: session } = useSession();
    const [adminPassword, setAdminPassword] = useState('');

    // Tab navigation state - default to activity for live monitoring
    const [activeTab, setActiveTab] = useState<AdminTab>('activity');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [songs, setSongs] = useState<Song[]>([]);
    const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
    const [isLocked, setIsLocked] = useState(false);
    const [stats, setStats] = useState<Stats>({ totalSongs: 0, totalVotes: 0, uniqueVoters: 0 });
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [exportUrl, setExportUrl] = useState<string | null>(null);
    const [adminVotes, setAdminVotes] = useState<Record<string, 1 | -1>>({});
    const [activeAdminCount, setActiveAdminCount] = useState(0);
    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

    // Session permissions state
    const [permissionCanVote, setPermissionCanVote] = useState(true);
    const [permissionCanAddSongs, setPermissionCanAddSongs] = useState(true);


    // Unique admin ID for this session
    const [adminId] = useState(() => 'admin-' + Math.random().toString(36).substr(2, 9));

    // Timer state
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerRemaining, setTimerRemaining] = useState(0);
    const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
    const [selectedDuration, setSelectedDuration] = useState(60); // minutes

    // Playlist title state
    const [playlistTitle, setPlaylistTitle] = useState(`${APP_CONFIG.name} Playlist`);
    const [titleInput, setTitleInput] = useState('');
    const [isEditingTitle, setIsEditingTitle] = useState(false);

    // Admin song search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // Shuffle state
    const [isShuffling, setIsShuffling] = useState(false);

    // 🔄 LOADING STATES - Explicit feedback for all admin actions
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isSavingTitle, setIsSavingTitle] = useState(false);
    const [isTogglingLock, setIsTogglingLock] = useState(false);
    const [isTimerAction, setIsTimerAction] = useState(false);
    const [isDeletingSong, setIsDeletingSong] = useState<string | null>(null);
    const [isExportingSpotify, setIsExportingSpotify] = useState(false);
    const [isExportingJSON, setIsExportingJSON] = useState(false);
    const [isGrantingKarma, setIsGrantingKarma] = useState<string | null>(null);
    const [isBanningUser, setIsBanningUser] = useState<string | null>(null);
    const [isWiping, setIsWiping] = useState(false);
    const [isRainingKarma, setIsRainingKarma] = useState(false);
    const [isStartingDoublePoints, setIsStartingDoublePoints] = useState(false);
    const [doublePointsActive, setDoublePointsActive] = useState(false);
    const [isAddingSong, setIsAddingSong] = useState<string | null>(null);
    const [isTriggeredPrizeDrop, setIsTriggeredPrizeDrop] = useState(false);

    // 🤖 AUTO-PILOT - Random surprise events during live sessions
    const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);
    const autoPilotEnabledRef = useRef(autoPilotEnabled);
    autoPilotEnabledRef.current = autoPilotEnabled;
    const lastAutoEventTime = useRef<number>(0);

    // 📺 STREAM EMBED - YouTube / Twitch platform
    const [streamPlatform, setStreamPlatform] = useState<'youtube' | 'twitch' | null>(null);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [twitchChannel, setTwitchChannel] = useState('');
    const [isSavingStream, setIsSavingStream] = useState(false);
    const [hideStreamLocally, setHideStreamLocally] = useState(() => {
        if (typeof window !== 'undefined') {
            return persistGet('crate-admin-hide-stream') === 'true';
        }
        return false;
    });
    const isEditingStream = useRef(false);
    const editingStreamTimeout = useRef<NodeJS.Timeout | null>(null);
    const streamConfigLoaded = useRef(false);
    const autoPilotTimeouts = useRef<NodeJS.Timeout[]>([]);
    const adminFetchFailures = useRef(0);

    // Delete window (chaos mode) state
    const [isStartingDeleteWindow, setIsStartingDeleteWindow] = useState(false);
    const [deleteWindowActive, setDeleteWindowActive] = useState(false);
    const [deleteWindowEndTime, setDeleteWindowEndTime] = useState<number | null>(null);

    // Import playlist state
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [showImportPanel, setShowImportPanel] = useState(false);

    // Predictions state
    const [isRevealingPredictions, setIsRevealingPredictions] = useState(false);

    // Custom confirmation modal state (replaces native confirm() which flickers)
    interface ConfirmModalState {
        isOpen: boolean;
        title: string;
        message: string;
        confirmText: string;
        onConfirm: (() => void) | null;
    }
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        onConfirm: null,
    });

    const showConfirmModal = (title: string, message: string, onConfirm: () => void, confirmText = 'Confirm') => {
        setConfirmModal({ isOpen: true, title, message, confirmText, onConfirm });
    };

    const closeConfirmModal = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false, onConfirm: null }));
    };

    const handleConfirmAction = () => {
        if (confirmModal.onConfirm) {
            confirmModal.onConfirm();
        }
        closeConfirmModal();
    };

    // Admin API call helper
    const adminFetch = async (url: string, options: RequestInit = {}) => {
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Content-Type': 'application/json',
                'x-admin-key': adminPassword,
                'x-admin-id': adminId,
            },
        });
    };

    // Fetch playlist data (with admin heartbeat)
    const fetchPlaylist = useCallback(async () => {
        // Skip fetching if a confirmation dialog is open to prevent flickering
        // Using a ref for this would be better but we don't have one readily exposed in current scope easily without re-declaring
        if (confirmModal.isOpen) return;

        try {
            const res = await fetch('/api/playlist', {
                headers: isAuthenticated ? {
                    'x-admin-key': adminPassword,
                    'x-admin-id': adminId,
                } : {},
            });
            const data = await res.json();
            setSongs(data.songs);
            // Reset failure counter on successful fetch
            if (adminFetchFailures.current >= 3) {
                setMessage({ type: 'success', text: '✓ Connection restored' });
            }
            adminFetchFailures.current = 0;
            setIsLocked(data.isLocked);
            setStats(data.stats);
            setActiveUsers(data.activeUsers || []);
            setActiveAdminCount(data.activeAdminCount || 0);
            if (data.recentActivity) {
                setRecentActivity(data.recentActivity);
            }
            if (data.playlistTitle) {
                setPlaylistTitle(data.playlistTitle);
                if (!isEditingTitle) setTitleInput(data.playlistTitle);
            }
            // Sync session permissions
            if (data.permissions) {
                setPermissionCanVote(data.permissions.canVote);
                setPermissionCanAddSongs(data.permissions.canAddSongs);
            }
            // Sync stream config ONLY on initial load (never during polling)
            if (!streamConfigLoaded.current) {
                streamConfigLoaded.current = true;
                if (data.streamConfig) {
                    setStreamPlatform(data.streamConfig.platform || null);
                    setYoutubeUrl(data.streamConfig.youtubeUrl || '');
                    setTwitchChannel(data.streamConfig.twitchChannel || '');
                } else if (data.youtubeEmbed !== undefined) {
                    // Legacy compat
                    setStreamPlatform(data.youtubeEmbed ? 'youtube' : null);
                    setYoutubeUrl(data.youtubeEmbed || '');
                }
            }
        } catch (error) {
            console.error('Failed to fetch playlist:', error);
            // Only show error after multiple consecutive failures to avoid spam during flaky connections
            adminFetchFailures.current++;
            if (adminFetchFailures.current === 3) {
                setMessage({ type: 'error', text: '⚠️ Connection issues — retrying automatically...' });
            }
        }
    }, [isAuthenticated, adminPassword, adminId, isEditingTitle, confirmModal.isOpen]);


    // Versus Battle state
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
        votesA?: number;
        votesB?: number;
        winner?: 'A' | 'B' | null;
    }
    const [versusBattle, setVersusBattle] = useState<VersusBattleState>({ active: false });
    const [isStartingBattle, setIsStartingBattle] = useState(false);
    const [battleCountdown, setBattleCountdown] = useState(0);
    const isResolvingBattle = useRef(false);  // Prevent multiple auto-resolves

    // 📺 SHOW CLOCK - ESPN-style segment ticker
    interface ShowSegmentLocal {
        id: string;
        name: string;
        durationMs: number;
        icon: string;
        order: number;
    }
    interface ShowClockLocal {
        segments: ShowSegmentLocal[];
        activeSegmentIndex: number;
        startedAt: number | null;
        segmentStartedAt: number | null;
        isRunning: boolean;
    }
    const [showClock, setShowClock] = useState<ShowClockLocal | null>(null);
    const [showClockSegments, setShowClockSegments] = useState<ShowSegmentLocal[]>([]);
    const [isShowClockAction, setIsShowClockAction] = useState(false);
    const [showClockExpanded, setShowClockExpanded] = useState(false);


    // Fetch timer status
    const fetchTimer = useCallback(async () => {
        if (confirmModal.isOpen) return;

        try {
            const res = await fetch('/api/timer');
            const data: TimerStatus = await res.json();
            setTimerRunning(data.running);
            setTimerEndTime(data.endTime);
            if (data.running && data.endTime) {
                setTimerRemaining(Math.max(0, data.endTime - Date.now()));
            } else {
                setTimerRemaining(0);
            }
        } catch (error) {
            console.error('Failed to fetch timer:', error);
            // Show error only occasionally to avoid spam
            if (Math.random() < 0.1) {
                setMessage({ type: 'error', text: 'Timer sync failed - retrying...' });
            }
        }
    }, [confirmModal.isOpen]);

    // Initial fetch when authenticated
    useEffect(() => {
        if (isAuthenticated) {
            fetchPlaylist();
            fetchTimer();
        }
    }, [isAuthenticated, fetchPlaylist, fetchTimer]);

    // REAL-TIME POLLING - refresh every 3 seconds
    useEffect(() => {
        if (!isAuthenticated) return;

        const interval = setInterval(() => {
            fetchPlaylist();
            fetchTimer();
        }, 3000);

        return () => clearInterval(interval);
    }, [isAuthenticated, fetchPlaylist, fetchTimer]);

    // Update timer display every second
    useEffect(() => {
        if (!timerRunning || !timerEndTime) return;

        const interval = setInterval(() => {
            const remaining = Math.max(0, timerEndTime - Date.now());
            setTimerRemaining(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [timerRunning, timerEndTime]);

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

    // Auto-hide message
    useEffect(() => {
        if (message) {
            const timeout = setTimeout(() => setMessage(null), 4000);
            return () => clearTimeout(timeout);
        }
    }, [message]);

    // Admin song search effect
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        const timeout = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
                const data = await res.json();
                setSearchResults(data.tracks || []);
                setShowSearchResults(true);
            } catch (error) {
                console.error('Search failed:', error);
                setMessage({ type: 'error', text: 'Search failed - check your connection' });
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [searchQuery]);

    // Admin add song (unlimited, bypasses all restrictions)
    const handleAdminAddSong = async (track: any) => {
        if (isAddingSong === track.id) return; // Prevent double-click

        const adminVisitorId = `admin-${adminPassword.slice(0, 8)}`;
        setIsAddingSong(track.id);

        try {
            const res = await fetch('/api/songs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': adminVisitorId,
                    'x-admin-key': adminPassword,
                },
                body: JSON.stringify({
                    ...track,
                    addedByName: 'Admin',
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Failed to add song' });
                return;
            }

            setMessage({ type: 'success', text: `✓ Added "${track.name}"` });
            setSearchQuery('');
            setShowSearchResults(false);
            fetchPlaylist();
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error - please try again' });
        } finally {
            setIsAddingSong(null);
        }
    };

    // Check if song is already in playlist
    const isSongInPlaylist = (trackId: string) => songs.some(s => s.id === trackId);

    // Admin vote on song (contributes to aggregate score)
    const handleAdminVote = async (songId: string, vote: 1 | -1) => {
        const previousVote = adminVotes[songId];

        // Optimistic update for admin votes display
        setAdminVotes(prev => {
            const newVotes = { ...prev };
            if (newVotes[songId] === vote) {
                delete newVotes[songId];
            } else {
                newVotes[songId] = vote;
            }
            return newVotes;
        });

        // Optimistic update for song scores and re-sort
        setSongs(prev => {
            const updated = prev.map(song => {
                if (song.id !== songId) return song;

                let scoreDelta = 0;
                if (previousVote === vote) {
                    scoreDelta = -vote;
                } else if (previousVote) {
                    scoreDelta = vote - previousVote;
                } else {
                    scoreDelta = vote;
                }

                return { ...song, score: song.score + scoreDelta };
            });

            // Re-sort by score (descending)
            return updated.sort((a, b) => b.score - a.score);
        });

        try {
            // Use a special admin visitor ID for admin votes
            const adminVisitorId = `admin-${adminPassword.slice(0, 8)}`;

            const res = await fetch(`/api/songs/${songId}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': adminVisitorId,
                    'x-admin-key': adminPassword,
                },
                body: JSON.stringify({ vote }),
            });

            if (!res.ok) {
                // Revert on error
                fetchPlaylist();
                setMessage({ type: 'error', text: 'Vote failed' });
            }
        } catch (error) {
            console.error('Admin vote failed:', error);
            fetchPlaylist();
            setMessage({ type: 'error', text: 'Vote failed - network error' });
        }
    };

    // Timer controls
    const handleStartTimer = async () => {
        setIsTimerAction(true);
        try {
            const res = await adminFetch('/api/timer', {
                method: 'POST',
                body: JSON.stringify({ action: 'start', duration: selectedDuration * 60 * 1000 }),
            });
            const data = await res.json();
            if (res.ok) {
                setTimerRunning(data.running);
                setTimerEndTime(data.endTime);
                // Format duration nicely
                let durationText = '';
                if (selectedDuration >= 1440) {
                    const days = selectedDuration / 1440;
                    durationText = `${days} day${days > 1 ? 's' : ''}`;
                } else if (selectedDuration >= 60) {
                    const hours = selectedDuration / 60;
                    durationText = `${hours} hour${hours > 1 ? 's' : ''}`;
                } else {
                    durationText = `${selectedDuration} minutes`;
                }
                setMessage({ type: 'success', text: `✓ Session started! ${durationText} on the clock.` });
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to start timer' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to start timer - network error' });
        } finally {
            setIsTimerAction(false);
        }
    };

    const handleStopTimer = async () => {
        setIsTimerAction(true);
        try {
            const res = await adminFetch('/api/timer', {
                method: 'POST',
                body: JSON.stringify({ action: 'stop' }),
            });
            if (res.ok) {
                setTimerRunning(false);
                setMessage({ type: 'success', text: '✓ Session stopped. Playlist locked.' });
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: 'Failed to stop timer' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to stop timer' });
        } finally {
            setIsTimerAction(false);
        }
    };

    const handleResetTimer = async () => {
        setIsTimerAction(true);
        try {
            const res = await adminFetch('/api/timer', {
                method: 'POST',
                body: JSON.stringify({ action: 'reset' }),
            });
            if (res.ok) {
                setTimerRunning(false);
                setTimerEndTime(null);
                setTimerRemaining(0);
                setMessage({ type: 'success', text: '✓ Timer reset.' });
            } else {
                setMessage({ type: 'error', text: 'Failed to reset timer' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to reset timer' });
        } finally {
            setIsTimerAction(false);
        }
    };

    // Remove song
    const handleRemoveSong = async (songId: string) => {
        if (isDeletingSong === songId) return; // Prevent double-click
        setIsDeletingSong(songId);
        try {
            const res = await adminFetch(`/api/songs/${songId}`, { method: 'DELETE' });
            if (res.ok) {
                setMessage({ type: 'success', text: '✓ Song removed' });
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: 'Failed to remove song' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to remove song - network error' });
        } finally {
            setIsDeletingSong(null);
        }
    };

    // Ban user directly from users list
    const handleBanUserDirect = (visitorId: string, userName: string) => {
        if (isBanningUser === visitorId) return;

        showConfirmModal(
            '🚫 Ban User?',
            `Ban ${userName}? This will remove them AND all their songs.`,
            async () => {
                setIsBanningUser(visitorId);
                try {
                    const res = await adminFetch('/api/playlist', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'ban', visitorId }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                        setMessage({ type: 'success', text: `✓ ${userName} banned! ${data.deletedSongs || 0} song(s) removed.` });
                        fetchPlaylist();
                    } else {
                        setMessage({ type: 'error', text: data.error || 'Failed to ban user' });
                    }
                } catch (error) {
                    setMessage({ type: 'error', text: 'Failed to ban user - network error' });
                } finally {
                    setIsBanningUser(null);
                }
            },
            'Ban User'
        );
    };


    // Quick ban from activity feed - instant action, no confirmation
    const handleQuickBan = async (visitorId: string, userName: string) => {
        // Skip banning admins
        if (userName.toLowerCase().includes('admin')) {
            setMessage({ type: 'error', text: 'Cannot ban admin users' });
            return;
        }

        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({ action: 'ban', visitorId }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: `🚫 ${userName} banned instantly! ${data.deletedSongs || 0} song(s) removed.` });
                // Remove from activity feed immediately
                setRecentActivity(prev => prev.filter(a => a.visitorId !== visitorId));
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to ban user' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to ban user' });
        }
    };

    // Delete a specific activity from the feed (without banning the user)
    const handleDeleteActivity = async (activityId: string, songName: string) => {
        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({ action: 'deleteActivity', activityId }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: `🗑️ Removed "${songName}" from activity feed` });
                // Remove from local state immediately
                setRecentActivity(prev => prev.filter(a => a.id !== activityId));
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to delete activity' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to delete activity' });
        }
    };

    // Grant karma to user - with selectable amount
    const handleGrantKarma = async (visitorId: string, userName: string, karmaAmount: number) => {
        if (isGrantingKarma === visitorId) return;
        setIsGrantingKarma(visitorId);
        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({ action: 'grantKarma', visitorId, points: karmaAmount }),
            });
            const data = await res.json();
            if (res.ok) {
                // 1 karma = +1 song, +1 upvote, +1 downvote
                setMessage({ type: 'success', text: `✓ +${karmaAmount} Karma to ${userName}! (Total: ${data.karma}) → +${karmaAmount} songs & votes!` });
                // Refresh playlist to show karma badge updates
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to grant karma' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to grant karma - network error' });
        } finally {
            setIsGrantingKarma(null);
        }
    };

    // Save playlist title
    const handleSaveTitle = async () => {
        if (!titleInput.trim()) {
            setMessage({ type: 'error', text: 'Please enter a playlist title' });
            return;
        }
        setIsSavingTitle(true);
        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({ action: 'setTitle', title: titleInput.trim() }),
            });
            if (res.ok) {
                const data = await res.json();
                setPlaylistTitle(data.playlistTitle);
                setIsEditingTitle(false);
                setMessage({ type: 'success', text: '✓ Playlist title updated!' });
            } else {
                setMessage({ type: 'error', text: 'Failed to update title' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to update title - network error' });
        } finally {
            setIsSavingTitle(false);
        }
    };

    // Wipe session (full reset)
    const handleWipeSession = () => {
        showConfirmModal(
            '⚠️ WIPE ENTIRE SESSION?',
            'This will delete ALL songs, reset the timer, and unban all users.\n\nThis cannot be undone!',
            async () => {
                setIsWiping(true);
                try {
                    const res = await adminFetch('/api/playlist', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'reset' }),
                    });
                    if (res.ok) {
                        // Also reset timer
                        await adminFetch('/api/timer', {
                            method: 'POST',
                            body: JSON.stringify({ action: 'reset' }),
                        });
                        setMessage({ type: 'success', text: '✓ Session wiped! Fresh start.' });
                        setTimerRunning(false);
                        setTimerEndTime(null);
                        setExportUrl(null);
                        setSongs([]);  // Clear local state immediately
                        setActiveUsers([]);  // Clear users too
                        setStats({ totalSongs: 0, totalVotes: 0, uniqueVoters: 0 });
                        fetchPlaylist();
                    } else {
                        const data = await res.json().catch(() => ({}));
                        setMessage({ type: 'error', text: data.error || 'Failed to wipe session - check admin password' });
                    }
                } catch (error) {
                    setMessage({ type: 'error', text: 'Failed to wipe session - network error' });
                } finally {
                    setIsWiping(false);
                }
            },
            'Wipe Everything'
        );
    };

    // Export to Spotify - redirect to export page
    const handleExportSpotify = () => {
        // Just redirect to the export page - it handles Spotify auth
        window.location.href = '/export';
    };

    // JSON Export
    const handleExportJSON = () => {
        const dataStr = JSON.stringify(songs, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `crate-playlist-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage({ type: 'success', text: '✓ JSON Exported!' });
    };

    // Login handler - now uses server-side verification
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoggingIn(true);
        setLoginError(null);

        try {
            const res = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: adminPassword }),
            });

            const data = await res.json();

            if (data.success) {
                setIsAuthenticated(true);
                // Persist admin key so front page can detect admin mode
                try { sessionStorage.setItem('crate-admin-key', adminPassword); } catch (e) { }
            } else {
                setLoginError(data.error || 'Incorrect password');
            }
        } catch (error) {
            setLoginError('Network error - please try again');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleToggleLock = async () => {
        setIsTogglingLock(true);
        const newState = !isLocked;
        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({ action: 'setLock', locked: newState }),
            });
            if (res.ok) {
                setIsLocked(newState);
                setMessage({ type: 'success', text: newState ? '🔒 Playlist locked' : '🔓 Playlist unlocked' });
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: 'Failed to toggle lock' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to toggle lock' });
        } finally {
            setIsTogglingLock(false);
        }
    };

    // Toggle session permissions (voting/song adding)
    const handleTogglePermission = async (permissionType: 'canVote' | 'canAddSongs', newValue: boolean) => {
        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'setPermissions',
                    [permissionType]: newValue
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.permissions) {
                    setPermissionCanVote(data.permissions.canVote);
                    setPermissionCanAddSongs(data.permissions.canAddSongs);
                }
                const label = permissionType === 'canVote' ? 'Voting' : 'Song Adding';
                setMessage({
                    type: 'success',
                    text: `${newValue ? '✓' : '🚫'} ${label} ${newValue ? 'enabled' : 'disabled'}`
                });
            } else {
                setMessage({ type: 'error', text: 'Failed to update permissions' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to update permissions' });
        }
    };

    // Mark stream config as being actively edited (prevents polling overwrite)
    const markStreamEditing = () => {
        isEditingStream.current = true;
        // Auto-reset after 10 seconds of inactivity
        if (editingStreamTimeout.current) clearTimeout(editingStreamTimeout.current);
        editingStreamTimeout.current = setTimeout(() => {
            isEditingStream.current = false;
        }, 10000);
    };

    // Save stream platform config
    const handleSaveStream = async (platformOverride?: 'youtube' | 'twitch' | null) => {
        const effectivePlatform = platformOverride !== undefined ? platformOverride : streamPlatform;
        setIsSavingStream(true);
        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'setStreamConfig',
                    streamPlatform: effectivePlatform,
                    streamYoutubeUrl: effectivePlatform === 'youtube' ? youtubeUrl.trim() : undefined,
                    streamTwitchChannel: effectivePlatform === 'twitch' ? twitchChannel.trim() : undefined,
                }),
            });
            if (res.ok) {
                const label = effectivePlatform === 'youtube' ? '📺 YouTube' : effectivePlatform === 'twitch' ? '🟣 Twitch' : '📺 Stream';
                setMessage({
                    type: 'success',
                    text: effectivePlatform ? `${label} stream saved!` : '📺 Stream cleared'
                });
            } else {
                setMessage({ type: 'error', text: 'Failed to save stream config' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save stream config' });
        } finally {
            setIsSavingStream(false);
            // Reset editing flag after save completes
            isEditingStream.current = false;
            if (editingStreamTimeout.current) clearTimeout(editingStreamTimeout.current);
        }
    };

    // Legacy compat: save just YouTube
    const handleSaveYouTube = async () => {
        setStreamPlatform('youtube');
        markStreamEditing(); // Mark as editing when platform is changed
        handleSaveStream('youtube');
    };

    // Shuffle all songs in the playlist
    const handleShufflePlaylist = async () => {
        if (songs.length < 2) {
            setMessage({ type: 'error', text: 'Need at least 2 songs to shuffle!' });
            return;
        }

        setIsShuffling(true);
        try {
            const res = await adminFetch('/api/admin/shuffle-playlist', {
                method: 'POST',
            });

            if (res.ok) {
                setMessage({ type: 'success', text: '🔀 Playlist shuffled! Songs randomized.' });
                fetchPlaylist();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to shuffle' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to shuffle - network error' });
        } finally {
            setIsShuffling(false);
        }
    };

    // Start THE PURGE - grants everyone ONE delete for 60 seconds
    const handleStartDeleteWindow = () => {
        showConfirmModal(
            '💀 START THE PURGE?',
            'This grants EVERY USER the ability to PURGE ONE song for 60 seconds.\n\nAll crimes are legal - use wisely!',
            async () => {
                setIsStartingDeleteWindow(true);
                try {
                    const res = await adminFetch('/api/admin/delete-window', {
                        method: 'POST',
                        body: JSON.stringify({ duration: 60 }),
                    });

                    if (res.ok) {
                        const data = await res.json();
                        setDeleteWindowActive(true);
                        setDeleteWindowEndTime(data.endTime);
                        setMessage({ type: 'success', text: '💀 THE PURGE HAS BEGUN! Everyone has 60 seconds to purge ONE song!' });

                        // Auto-refresh when window ends
                        setTimeout(() => {
                            setDeleteWindowActive(false);
                            setDeleteWindowEndTime(null);
                            fetchPlaylist();
                        }, 60000);
                    } else {
                        const data = await res.json();
                        setMessage({ type: 'error', text: data.error || 'Failed to start The Purge' });
                    }
                } catch (error) {
                    setMessage({ type: 'error', text: 'Failed to start The Purge - network error' });
                } finally {
                    setIsStartingDeleteWindow(false);
                }
            },
            'Start The Purge'
        );
    };

    // Karma Rain - give everyone +1 karma!
    const handleKarmaRain = async () => {
        setIsRainingKarma(true);
        try {
            const res = await adminFetch('/api/admin/karma-rain', { method: 'POST' });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: `🌧️ Karma Rain! ${data.usersRained} users received +1 karma!` });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to rain karma' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to rain karma - network error' });
        } finally {
            setIsRainingKarma(false);
        }
    };

    // ⚡ Double Points - votes count 2x for 2 minutes!
    const handleDoublePoints = async () => {
        setIsStartingDoublePoints(true);
        try {
            const res = await adminFetch('/api/admin/double-points', {
                method: 'POST',
                body: JSON.stringify({ duration: 120 }), // 2 minutes
            });

            if (res.ok) {
                setDoublePointsActive(true);
                setMessage({ type: 'success', text: '⚡ DOUBLE POINTS! All votes count 2X for 2 minutes!' });

                // Auto-clear after window ends
                setTimeout(() => {
                    setDoublePointsActive(false);
                    fetchPlaylist();
                }, 120000);
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to start Double Points' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to start Double Points - network error' });
        } finally {
            setIsStartingDoublePoints(false);
        }
    };

    // 🎰 Golden Hour Prize Drop - pick random active user to win a prize
    const handlePrizeDrop = async () => {
        setIsTriggeredPrizeDrop(true);
        try {
            const res = await adminFetch('/api/admin/prize-drop', { method: 'POST' });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: `🎰 Golden Hour Drop! ${data.winner?.name} won a prize!` });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to trigger prize drop' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to trigger prize drop - network error' });
        } finally {
            setIsTriggeredPrizeDrop(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 🤖 AUTO-PILOT - Silent event triggers for automation
    // ═══════════════════════════════════════════════════════════════════

    // Silent Purge - no confirmation dialog
    const triggerPurgeSilent = async () => {
        try {
            const res = await adminFetch('/api/admin/delete-window', {
                method: 'POST',
                body: JSON.stringify({ duration: 60 }),
            });
            if (res.ok) {
                setDeleteWindowActive(true);
                const data = await res.json();
                setDeleteWindowEndTime(data.endTime);
                setMessage({ type: 'success', text: '💀 AUTO-PILOT: THE PURGE HAS BEGUN!' });
                setTimeout(() => {
                    setDeleteWindowActive(false);
                    setDeleteWindowEndTime(null);
                    fetchPlaylist();
                }, 60000);
            }
        } catch (error) {
            console.error('Auto-pilot purge failed:', error);
        }
    };

    // Silent Shuffle - no confirmation
    const triggerShuffleSilent = async () => {
        if (songs.length < 2) return;
        try {
            const res = await adminFetch('/api/admin/shuffle-playlist', { method: 'POST' });
            if (res.ok) {
                setMessage({ type: 'success', text: '🔀 AUTO-PILOT: Playlist shuffled!' });
                fetchPlaylist();
            }
        } catch (error) {
            console.error('Auto-pilot shuffle failed:', error);
        }
    };

    // Silent Karma Rain - no confirmation
    const triggerKarmaRainSilent = async () => {
        try {
            const res = await adminFetch('/api/admin/karma-rain', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setMessage({ type: 'success', text: `🌧️ AUTO-PILOT: Karma Rain! ${data.usersRained} users blessed!` });
            }
        } catch (error) {
            console.error('Auto-pilot karma rain failed:', error);
        }
    };

    // Silent Prize Drop - no confirmation
    const triggerPrizeDropSilent = async () => {
        try {
            const res = await adminFetch('/api/admin/prize-drop', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setMessage({ type: 'success', text: `🎰 AUTO-PILOT: Golden Hour Drop! ${data.winner?.name} won!` });
            }
        } catch (error) {
            console.error('Auto-pilot prize drop failed:', error);
        }
    };

    // 🤖 AUTO-PILOT EFFECT - Schedule random events when enabled
    useEffect(() => {
        // Clear any existing timeouts
        autoPilotTimeouts.current.forEach(t => clearTimeout(t));
        autoPilotTimeouts.current = [];

        if (!autoPilotEnabled || !timerRunning || !timerEndTime) {
            return;
        }

        const remainingMs = timerEndTime - Date.now();
        if (remainingMs <= 0) return;

        // Calculate how many events to schedule based on timer duration
        // ~1 event per 3-5 minutes, but at least 1 event if timer > 2 min
        const remainingMinutes = remainingMs / 60000;
        let numEvents = Math.floor(remainingMinutes / 4); // 1 event every 4 minutes
        numEvents = Math.max(1, Math.min(numEvents, 10)); // Between 1-10 events

        // Event pool (weighted: Shuffle 30%, Karma Rain 30%, Purge 20%, Prize Drop 20%)
        const eventPool = [
            { type: 'shuffle', weight: 30 },
            { type: 'karma', weight: 30 },
            { type: 'purge', weight: 20 },
            { type: 'prize', weight: 20 },
        ];

        const pickRandomEvent = () => {
            const total = eventPool.reduce((sum, e) => sum + e.weight, 0);
            let rand = Math.random() * total;
            for (const event of eventPool) {
                rand -= event.weight;
                if (rand <= 0) return event.type;
            }
            return 'shuffle';
        };

        // Schedule events at random times throughout the session
        // Leave buffer at start (30s) and end (60s)
        const minDelay = 30000; // 30 seconds from now
        const maxDelay = remainingMs - 60000; // 1 minute before end

        if (maxDelay <= minDelay) return; // Not enough time

        for (let i = 0; i < numEvents; i++) {
            const delay = minDelay + Math.random() * (maxDelay - minDelay);
            const eventType = pickRandomEvent();

            const timeout = setTimeout(async () => {
                // Check if auto-pilot is still enabled (use ref to avoid stale closure)
                if (!autoPilotEnabledRef.current) return;

                // Minimum 60s between events
                if (Date.now() - lastAutoEventTime.current < 60000) return;

                lastAutoEventTime.current = Date.now();

                switch (eventType) {
                    case 'purge':
                        await triggerPurgeSilent();
                        break;
                    case 'shuffle':
                        await triggerShuffleSilent();
                        break;
                    case 'karma':
                        await triggerKarmaRainSilent();
                        break;
                    case 'prize':
                        await triggerPrizeDropSilent();
                        break;
                }
            }, delay);

            autoPilotTimeouts.current.push(timeout);
        }

        setMessage({ type: 'success', text: `🤖 Auto-Pilot: ${numEvents} surprise events scheduled!` });

        return () => {
            autoPilotTimeouts.current.forEach(t => clearTimeout(t));
            autoPilotTimeouts.current = [];
        };
    }, [autoPilotEnabled, timerRunning, timerEndTime]);

    // ============ PREDICTIONS HANDLERS ============

    // Reveal predictions and award karma
    const handleRevealPredictions = async () => {
        setIsRevealingPredictions(true);
        try {
            const res = await adminFetch('/api/predictions', {
                method: 'POST',
                body: JSON.stringify({ action: 'reveal' }),
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({
                    type: 'success',
                    text: `🎯 ${data.winners} predicted correctly! "${data.winningSong.name}" wins!`
                });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to reveal predictions' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to reveal predictions - network error' });
        } finally {
            setIsRevealingPredictions(false);
        }
    };

    // ============ VERSUS BATTLE HANDLERS ============

    // Fetch versus battle status periodically (for admin view with vote counts)
    const fetchVersusBattle = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res = await adminFetch('/api/admin/versus-battle');
            const data = await res.json();
            setVersusBattle(data);
            if (data.active && data.endTime) {
                setBattleCountdown(Math.max(0, data.endTime - Date.now()));
            }
        } catch (error) {
            console.error('Failed to fetch versus battle:', error);
            // Non-blocking - battle will just use stale data briefly
        }
    }, [isAuthenticated, adminPassword, adminId]);

    // Poll for battle status when battle is active
    useEffect(() => {
        if (!isAuthenticated) return;

        // Fetch immediately
        fetchVersusBattle();

        const interval = setInterval(fetchVersusBattle, 2000); // 2s poll for admin awareness
        return () => clearInterval(interval);
    }, [isAuthenticated, fetchVersusBattle]);

    const handleStartVersusBattle = async () => {
        if (songs.length < 2) {
            setMessage({ type: 'error', text: 'Need at least 2 songs for a battle!' });
            return;
        }

        setIsStartingBattle(true);
        try {
            const res = await adminFetch('/api/admin/versus-battle', {
                method: 'POST',
                // Default 45s battle
                body: JSON.stringify({ action: 'start', duration: 45 }),
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: '⚔️ VERSUS BATTLE STARTED!' });
                setVersusBattle(data);
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to start battle' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to start battle' });
        } finally {
            setIsStartingBattle(false);
        }
    };

    const handleCancelBattle = async () => {
        try {
            await adminFetch('/api/admin/versus-battle', {
                method: 'POST',
                body: JSON.stringify({ action: 'cancel' }),
            });
            setMessage({ type: 'success', text: 'Battle cancelled.' });
            fetchVersusBattle();
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to cancel battle' });
        }
    };

    // ============ SHOW CLOCK HANDLERS ============

    const fetchShowClock = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res = await adminFetch('/api/admin/show-clock');
            const data = await res.json();
            setShowClock(data);
            // If segments exist and we haven't loaded them into the editor yet
            if (data.segments && data.segments.length > 0 && showClockSegments.length === 0) {
                setShowClockSegments(data.segments);
            }
        } catch (error) {
            console.error('Failed to fetch show clock:', error);
        }
    }, [isAuthenticated, adminPassword, adminId]);

    // Poll show clock when expanded
    useEffect(() => {
        if (!isAuthenticated || !showClockExpanded) return;
        fetchShowClock();
        const interval = setInterval(fetchShowClock, 3000);
        return () => clearInterval(interval);
    }, [isAuthenticated, showClockExpanded, fetchShowClock]);

    const handleAddSegment = () => {
        if (showClockSegments.length >= BROADCAST.showClockMaxSegments) return;
        const newSeg: ShowSegmentLocal = {
            id: 'seg-' + Date.now(),
            name: '',
            durationMs: 10 * 60 * 1000, // 10 min default
            icon: BROADCAST.segmentIcons[showClockSegments.length % BROADCAST.segmentIcons.length],
            order: showClockSegments.length,
        };
        setShowClockSegments([...showClockSegments, newSeg]);
    };

    const handleRemoveSegment = (index: number) => {
        setShowClockSegments(showClockSegments.filter((_, i) => i !== index));
    };

    const handleUpdateSegment = (index: number, field: string, value: string | number) => {
        const updated = [...showClockSegments];
        (updated[index] as any)[field] = value;
        setShowClockSegments(updated);
    };

    const handleSaveShowClock = async () => {
        if (showClockSegments.length === 0) {
            setMessage({ type: 'error', text: 'Add at least one segment.' });
            return;
        }
        if (showClockSegments.some(s => !s.name.trim())) {
            setMessage({ type: 'error', text: 'All segments need a name.' });
            return;
        }
        setIsShowClockAction(true);
        try {
            const res = await adminFetch('/api/admin/show-clock', {
                method: 'POST',
                body: JSON.stringify({ action: 'saveSegments', segments: showClockSegments }),
            });
            const data = await res.json();
            if (res.ok) {
                setShowClock(data.showClock);
                setMessage({ type: 'success', text: `📺 Saved ${showClockSegments.length} segments!` });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to save segments' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save show clock' });
        } finally {
            setIsShowClockAction(false);
        }
    };

    const handleShowClockAction = async (action: string, body: Record<string, unknown> = {}) => {
        setIsShowClockAction(true);
        try {
            const res = await adminFetch('/api/admin/show-clock', {
                method: 'POST',
                body: JSON.stringify({ action, ...body }),
            });
            const data = await res.json();
            if (res.ok) {
                setShowClock(data.showClock);
                const msgs: Record<string, string> = {
                    start: '📺 Show clock started!',
                    advance: '⏭️ Advanced to next segment!',
                    extend: '⏱️ Extended by 2 minutes!',
                    stop: '⏹️ Show clock stopped.',
                    clear: '🗑️ Show clock cleared.',
                };
                setMessage({ type: 'success', text: msgs[action] || 'Done!' });
                if (action === 'clear') {
                    setShowClockSegments([]);
                    setShowClock(null);
                }
            } else {
                setMessage({ type: 'error', text: data.error || 'Show clock action failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Show clock action failed' });
        } finally {
            setIsShowClockAction(false);
        }
    };


    // LOGIN SCREEN
    if (!isAuthenticated) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <h1>🔐 Admin Access</h1>
                    <p>Enter your credentials to control the party</p>
                    <form onSubmit={handleLogin} className="password-form">
                        <input
                            type="password"
                            placeholder="Enter Admin Password"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            autoFocus
                        />
                        <button
                            type="submit"
                            className="spotify-btn"
                            style={{ marginTop: '20px', width: '100%', justifyContent: 'center' }}
                            disabled={isLoggingIn}
                        >
                            {isLoggingIn ? 'Verifying...' : 'Unlock Dashboard'}
                        </button>
                    </form>
                    {loginError && (
                        <div className="message error" style={{ marginTop: '20px', justifyContent: 'center' }}>
                            {loginError}
                        </div>
                    )}
                    <div className="admin-login-footer">
                        <Link href="/" className="back-to-voting-btn">
                            <span className="btn-icon">🎵</span>
                            <span className="btn-text">Back to Voting</span>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // MAIN DASHBOARD
    return (
        <div className="admin-container">
            {/* Header / Nav */}
            <div className="admin-header">
                <div className="header-left">
                    <div className="logo-header-admin">
                        <img src="/logo.png" alt="DJ Booth" className="header-logo-admin" />
                    </div>
                    <Link href="/" className="view-live-btn" target="_blank">
                        <span className="pulse-dot">●</span>
                        <span>View Live</span>
                        <span className="arrow">↗</span>
                    </Link>
                    {isEditingTitle ? (
                        <div className="title-edit">
                            <input
                                type="text"
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                className="title-input"
                                placeholder="Playlist Title"
                            />
                            <button className="save-btn" onClick={handleSaveTitle} disabled={isSavingTitle}>💾</button>
                        </div>
                    ) : (
                        <div className="playlist-title-display">
                            <h1>{playlistTitle}</h1>
                            <button className="admin-btn small" onClick={() => setIsEditingTitle(true)}>
                                ✏️ Edit
                            </button>
                        </div>
                    )}
                </div>

                <div className="header-right">
                    <div className="admin-status">
                        <span className="status-dot"></span>
                        {activeAdminCount > 1 ? `${activeAdminCount} Admins Online` : 'Admin Active'}
                    </div>
                </div>
            </div>

            {/* Compact Admin Control Strip - Timer + Stats + Quick Actions in one row */}
            <div className="admin-control-strip">
                {/* Timer Section - Compact */}
                <div className="timer-compact">
                    {timerRunning ? (
                        <>
                            <span className="timer-status-dot active" />
                            <span className={`timer-value-compact ${timerRemaining < 60000 ? 'urgent' : ''}`}>
                                {formatTime(timerRemaining)}
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="timer-status-dot inactive" />
                            <span className="timer-value-compact inactive">Stopped</span>
                        </>
                    )}
                    {/* Inline timer controls */}
                    <div className="timer-controls-inline">
                        <select
                            value={selectedDuration}
                            onChange={(e) => setSelectedDuration(Number(e.target.value))}
                            disabled={timerRunning}
                            className="duration-select-mini"
                        >
                            <option value={5}>5m</option>
                            <option value={10}>10m</option>
                            <option value={15}>15m</option>
                            <option value={30}>30m</option>
                            <option value={60}>1h</option>
                            <option value={120}>2h</option>
                            <option value={240}>4h</option>
                            <option value={480}>8h</option>
                            <option value={1440}>24h</option>
                            <option value={10080}>7d</option>
                        </select>
                        {!timerRunning ? (
                            <button className="timer-btn start" onClick={handleStartTimer} disabled={isTimerAction}>
                                {isTimerAction ? '...' : '▶'}
                            </button>
                        ) : (
                            <button className="timer-btn stop" onClick={handleStopTimer} disabled={isTimerAction}>
                                {isTimerAction ? '...' : '⏹'}
                            </button>
                        )}
                        <button className="timer-btn reset" onClick={handleResetTimer} disabled={isTimerAction} title="Reset Timer">
                            🔄
                        </button>
                    </div>
                </div>

                {/* Stats - Inline pills */}
                <div className="stats-inline">
                    <span className="stat-pill-mini" data-tooltip="Songs"><span className="val">{stats.totalSongs}</span>🎵</span>
                    <span className="stat-pill-mini" data-tooltip="Votes"><span className="val">{stats.totalVotes}</span>🗳️</span>
                    <span className="stat-pill-mini" data-tooltip="Users"><span className="val">{stats.uniqueVoters}</span>👥</span>
                    <span className="stat-pill-mini live" data-tooltip="Live Now"><span className="val">{activeUsers.length}</span>🟢</span>
                </div>

                {/* Quick Actions - Primary buttons */}
                <div className="quick-actions-inline">
                    <button
                        className={`action-btn-mini ${isLocked ? 'locked' : 'unlocked'}`}
                        onClick={handleToggleLock}
                        disabled={isTogglingLock}
                        title={isLocked ? 'Unlock playlist' : 'Lock playlist'}
                    >
                        {isTogglingLock ? '⏳' : isLocked ? '🔒' : '🔓'}
                    </button>
                    <button
                        className="action-btn-mini spotify"
                        onClick={handleExportSpotify}
                        disabled={songs.length === 0 || isExportingSpotify}
                        title="Export to Spotify"
                    >
                        {isExportingSpotify ? '⏳' : (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="#1DB954">
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* 🔒 CONFIRMATION MODAL */}
            {confirmModal.isOpen && (
                <div className="modal-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                }}>
                    <div className="confirm-modal" style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        border: '2px solid var(--orange-primary)',
                        borderRadius: '16px',
                        padding: '32px',
                        maxWidth: '400px',
                        width: '90%',
                        textAlign: 'center',
                        boxShadow: '0 0 40px rgba(255, 107, 53, 0.4)',
                    }}>
                        <h2 style={{ fontSize: '1.5rem', color: '#fff', marginBottom: '16px' }}>
                            {confirmModal.title}
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '24px', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                            {confirmModal.message}
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button className="admin-btn" onClick={closeConfirmModal} style={{ minWidth: '100px' }}>Cancel</button>
                            <button className="admin-btn danger" onClick={handleConfirmAction} style={{ minWidth: '120px' }}>{confirmModal.confirmText}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages - Always visible */}
            {message && (
                <div className={`message ${message.type}`}>
                    {message.type === 'success' ? '✓' : '✕'} {message.text}
                </div>
            )}

            {/* Export URL */}
            {exportUrl && (
                <div className="message success">
                    ✓ Created! <a href={exportUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 'bold' }}>Open →</a>
                </div>
            )}

            {/* TAB NAVIGATION - Mobile-first tabs */}
            <div className="admin-tabs">
                <button
                    className={`admin-tab ${activeTab === 'activity' ? 'active' : ''}`}
                    onClick={() => setActiveTab('activity')}
                >
                    <span className="tab-icon">🎙️</span>
                    <span className="tab-label">Live</span>
                    {recentActivity.length > 0 && <span className="tab-badge">{recentActivity.length}</span>}
                </button>
                <button
                    className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    <span className="tab-icon">👥</span>
                    <span className="tab-label">Users</span>
                    {activeUsers.length > 0 && <span className="tab-badge">{activeUsers.length}</span>}
                </button>
                <button
                    className={`admin-tab ${activeTab === 'playlist' ? 'active' : ''}`}
                    onClick={() => setActiveTab('playlist')}
                >
                    <span className="tab-icon">🎵</span>
                    <span className="tab-label">Playlist</span>
                    {songs.length > 0 && <span className="tab-badge">{songs.length}</span>}
                </button>
                <button
                    className={`admin-tab ${activeTab === 'tools' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tools')}
                >
                    <span className="tab-icon">⚙️</span>
                    <span className="tab-label">Tools</span>
                </button>
            </div>

            {/* TAB CONTENT */}
            <div className="admin-tab-content">

                {/* ACTIVITY TAB */}
                {activeTab === 'activity' && (
                    <div className="tab-panel activity-panel">
                        <div className="activity-log compact">
                            {recentActivity.length === 0 ? (
                                <p className="no-activity">Waiting for activity...</p>
                            ) : (
                                recentActivity.map(activity => {
                                    const timeStr = new Date(activity.timestamp).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true,
                                        timeZone: 'America/Chicago'
                                    });
                                    return (
                                        <div key={activity.id} className={`activity-log-item ${activity.type}`}>
                                            <span className="activity-type-icon">
                                                {activity.type === 'add' ? '💿' : activity.type === 'upvote' ? '👍' : '👎'}
                                            </span>
                                            <span className="activity-user">{activity.userName}</span>
                                            {activity.userLocation && <span className="activity-location" title={`From ${activity.userLocation}`}>📍{activity.userLocation}</span>}
                                            <span className="activity-song">"{activity.songName.length > 20 ? activity.songName.slice(0, 20) + '…' : activity.songName}"</span>
                                            <span className="activity-time">{timeStr}</span>
                                            <div className="activity-actions">
                                                <button className="delete-activity-btn" onClick={() => handleDeleteActivity(activity.id, activity.songName)} title="Remove">🗑️</button>
                                                {!activity.userName.toLowerCase().includes('admin') && (
                                                    <button className="quick-ban-btn" onClick={() => handleQuickBan(activity.visitorId, activity.userName)} title="Ban">❌</button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* USERS TAB */}
                {activeTab === 'users' && (
                    <div className="tab-panel users-panel">
                        {activeUsers.length === 0 ? (
                            <p className="no-users">No participants yet</p>
                        ) : (
                            <div className="users-grid compact">
                                {activeUsers.map(user => {
                                    const minutesAgo = user.lastActivity ? Math.floor((Date.now() - user.lastActivity) / 60000) : null;
                                    const isRecentlyActive = minutesAgo !== null && minutesAgo < 2;
                                    return (
                                        <div key={user.visitorId} className={`user-card-mini ${user.isBanned ? 'banned' : ''} ${isRecentlyActive ? 'active' : ''}`}>
                                            <div className="user-main">
                                                {isRecentlyActive && <span className="pulse-dot">●</span>}
                                                <span className="user-name">{user.name}</span>
                                                {user.karma > 0 && <span className="karma-badge">⭐{user.karma}</span>}
                                            </div>
                                            <div className="user-meta">
                                                <span>{user.songsAdded}🎵</span>
                                                {minutesAgo !== null && <span className="time-ago">{minutesAgo === 0 ? 'now' : `${minutesAgo}m`}</span>}
                                            </div>
                                            <div className="user-actions-mini">
                                                {!user.isBanned && (
                                                    <>
                                                        <select
                                                            className="karma-select-mini"
                                                            defaultValue=""
                                                            onChange={(e) => { if (e.target.value) { handleGrantKarma(user.visitorId, user.name, Number(e.target.value)); e.target.value = ''; } }}
                                                        >
                                                            <option value="" disabled>+⭐</option>
                                                            <option value="5">+5</option>
                                                            <option value="10">+10</option>
                                                            <option value="25">+25</option>
                                                        </select>
                                                        <button className="kick-btn-mini" onClick={() => handleBanUserDirect(user.visitorId, user.name)}>❌</button>
                                                    </>
                                                )}
                                                {user.isBanned && <span className="banned-tag">BANNED</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* PLAYLIST TAB */}
                {activeTab === 'playlist' && (
                    <div className="tab-panel playlist-panel">
                        {/* Add Song Search - Compact */}
                        <div className="search-inline" style={{ position: 'relative', marginBottom: '12px' }}>
                            <input
                                type="text"
                                placeholder="🔍 Add song..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                                onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                                className="search-input-compact"
                            />
                            {isSearching && <span className="search-spinner">...</span>}
                            {showSearchResults && searchResults.length > 0 && (
                                <div className="search-dropdown-compact">
                                    <div className="search-results-header-compact">
                                        🔍 SPOTIFY RESULTS <span className="header-hint">Click to add →</span>
                                    </div>
                                    {searchResults.slice(0, 5).map((track) => (
                                        <div key={track.id} className={`search-result-compact ${isSongInPlaylist(track.id) ? 'in-playlist' : 'can-add'}`} onClick={() => handleAdminAddSong(track)}>
                                            <img src={track.albumArt || '/placeholder.svg'} alt="" className="result-thumb" />
                                            <div className="result-info">
                                                <span className="result-name">{track.name}</span>
                                                <span className="result-artist">{track.artist}</span>
                                            </div>
                                            {isSongInPlaylist(track.id) ? <span className="in-list">✓ Added</span> : <span className="add-icon">+ ADD</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Song List - Compact */}
                        {songs.length === 0 ? (
                            <div className="empty-state">📦 No songs yet</div>
                        ) : (
                            <div className="song-list-compact">
                                {songs.map((song, index) => (
                                    <div key={song.id} className={`song-row-compact ${index < 3 ? 'top' : ''}`}>
                                        <span className="rank-mini">{index === 0 ? '👑' : `#${index + 1}`}</span>
                                        <img src={song.albumArt || '/placeholder.svg'} alt="" className="thumb-mini" />
                                        <div className="song-info-mini">
                                            <span className="song-name">{song.name.length > 25 ? song.name.slice(0, 25) + '…' : song.name}</span>
                                            <span className="song-artist">{song.artist}</span>
                                        </div>
                                        <div className="vote-controls-mini">
                                            <button className={`vote-mini down ${adminVotes[song.id] === -1 ? 'active' : ''}`} onClick={() => handleAdminVote(song.id, -1)}>👎</button>
                                            <span className={`score-mini ${song.score > 0 ? 'pos' : song.score < 0 ? 'neg' : ''}`}>{song.score > 0 ? '+' : ''}{song.score}</span>
                                            <button className={`vote-mini up ${adminVotes[song.id] === 1 ? 'active' : ''}`} onClick={() => handleAdminVote(song.id, 1)}>👍</button>
                                        </div>
                                        <button className="delete-mini" onClick={() => handleRemoveSong(song.id)} disabled={isDeletingSong === song.id}>
                                            {isDeletingSong === song.id ? '⏳' : '🗑️'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* TOOLS TAB */}
                {activeTab === 'tools' && (
                    <div className="tab-panel tools-panel">
                        {/* Import from Spotify */}
                        <div className="import-section">
                            <button
                                className="tool-btn import-spotify"
                                onClick={() => setShowImportPanel(!showImportPanel)}
                            >
                                <span className="tool-icon">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="#1DB954">
                                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                    </svg>
                                </span>
                                <span className="tool-name">Import Spotify Playlist</span>
                            </button>

                            {showImportPanel && (
                                <div className="import-panel">
                                    <p className="import-hint">Paste a Spotify playlist URL to import up to 100 tracks</p>
                                    <div className="import-input-row">
                                        <input
                                            type="text"
                                            placeholder="https://open.spotify.com/playlist/..."
                                            value={importUrl}
                                            onChange={(e) => setImportUrl(e.target.value)}
                                            className="import-input"
                                        />
                                        <button
                                            className="import-btn"
                                            disabled={isImporting || !importUrl.includes('spotify.com/playlist')}
                                            onClick={async () => {
                                                setIsImporting(true);
                                                try {
                                                    const res = await adminFetch('/api/admin/import-playlist', {
                                                        method: 'POST',
                                                        body: JSON.stringify({ playlistUrl: importUrl }),
                                                    });
                                                    const data = await res.json();
                                                    if (res.ok) {
                                                        setMessage({
                                                            type: 'success',
                                                            text: `✓ Imported ${data.imported} songs from "${data.playlistName}"${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`
                                                        });
                                                        setImportUrl('');
                                                        setShowImportPanel(false);
                                                        fetchPlaylist();
                                                    } else {
                                                        setMessage({ type: 'error', text: data.error || 'Import failed' });
                                                    }
                                                } catch (error) {
                                                    setMessage({ type: 'error', text: 'Import failed - network error' });
                                                } finally {
                                                    setIsImporting(false);
                                                }
                                            }}
                                        >
                                            {isImporting ? 'Importing...' : '🚀 Import'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* User Permissions */}
                        <div className="permissions-section">
                            <h4>User Permissions</h4>
                            <div className="permissions-toggles">
                                <label className="permission-toggle">
                                    <input
                                        type="checkbox"
                                        checked={permissionCanVote}
                                        onChange={(e) => handleTogglePermission('canVote', e.target.checked)}
                                    />
                                    <span className="toggle-label">
                                        <span className="toggle-icon">{permissionCanVote ? '✅' : '🚫'}</span>
                                        Allow Voting
                                    </span>
                                </label>
                                <label className="permission-toggle">
                                    <input
                                        type="checkbox"
                                        checked={permissionCanAddSongs}
                                        onChange={(e) => handleTogglePermission('canAddSongs', e.target.checked)}
                                    />
                                    <span className="toggle-label">
                                        <span className="toggle-icon">{permissionCanAddSongs ? '✅' : '🚫'}</span>
                                        Allow Song Adding
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* 📺 SHOW CLOCK - ESPN-Style Segment Ticker */}
                        <div className="show-clock-section">
                            <button
                                className={`tool-btn show-clock-toggle ${showClock?.isRunning ? 'active' : ''}`}
                                onClick={() => { setShowClockExpanded(!showClockExpanded); if (!showClockExpanded) fetchShowClock(); }}
                            >
                                <span className="tool-icon">📺</span>
                                <span className="tool-name">
                                    {showClock?.isRunning ? `LIVE — ${showClock.segments[showClock.activeSegmentIndex]?.icon} ${showClock.segments[showClock.activeSegmentIndex]?.name}` : 'Show Clock'}
                                </span>
                                <span className="expand-arrow">{showClockExpanded ? '▲' : '▼'}</span>
                            </button>

                            {showClockExpanded && (
                                <div className="show-clock-panel">
                                    {/* Live Controls — shown when running */}
                                    {showClock?.isRunning && (
                                        <div className="show-clock-live-controls">
                                            <div className="show-clock-live-status">
                                                <span className="live-badge">🔴 LIVE</span>
                                                <span className="current-segment">
                                                    {showClock.segments[showClock.activeSegmentIndex]?.icon}{' '}
                                                    {showClock.segments[showClock.activeSegmentIndex]?.name}
                                                </span>
                                                <span className="segment-progress">
                                                    Segment {showClock.activeSegmentIndex + 1}/{showClock.segments.length}
                                                </span>
                                            </div>
                                            <div className="show-clock-live-actions">
                                                <button className="tool-btn advance" onClick={() => handleShowClockAction('advance')} disabled={isShowClockAction}>
                                                    <span className="tool-icon">⏭️</span>
                                                    <span className="tool-name">Next</span>
                                                </button>
                                                <button className="tool-btn extend" onClick={() => handleShowClockAction('extend', { additionalMs: 120000 })} disabled={isShowClockAction}>
                                                    <span className="tool-icon">⏱️</span>
                                                    <span className="tool-name">+2 min</span>
                                                </button>
                                                <button className="tool-btn danger" onClick={() => handleShowClockAction('stop')} disabled={isShowClockAction}>
                                                    <span className="tool-icon">⏹️</span>
                                                    <span className="tool-name">Stop Show</span>
                                                </button>
                                            </div>
                                            {/* Mini segment timeline */}
                                            <div className="show-clock-timeline">
                                                {showClock.segments.map((seg, i) => (
                                                    <div key={seg.id} className={`timeline-segment ${i === showClock.activeSegmentIndex ? 'active' : i < showClock.activeSegmentIndex ? 'completed' : 'upcoming'}`}>
                                                        <span className="seg-icon">{seg.icon}</span>
                                                        <span className="seg-name">{seg.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Segment Builder — shown when NOT running */}
                                    {!showClock?.isRunning && (
                                        <div className="segment-builder">
                                            <div className="segment-builder-header">
                                                <h4>Build Your Rundown</h4>
                                                <span className="segment-count">{showClockSegments.length}/{BROADCAST.showClockMaxSegments}</span>
                                            </div>

                                            {showClockSegments.map((seg, i) => (
                                                <div key={seg.id} className="segment-row">
                                                    <span className="segment-number">{i + 1}</span>
                                                    {/* Icon selector */}
                                                    <select
                                                        className="segment-icon-select"
                                                        value={seg.icon}
                                                        onChange={(e) => handleUpdateSegment(i, 'icon', e.target.value)}
                                                    >
                                                        {BROADCAST.segmentIcons.map(icon => (
                                                            <option key={icon} value={icon}>{icon}</option>
                                                        ))}
                                                    </select>
                                                    {/* Name input */}
                                                    <input
                                                        type="text"
                                                        className="segment-name-input"
                                                        placeholder={['Intro', 'Voting Round', 'Q&A', 'Top 10 Reveal', 'Finale'][i] || 'Segment name'}
                                                        value={seg.name}
                                                        onChange={(e) => handleUpdateSegment(i, 'name', e.target.value)}
                                                        maxLength={50}
                                                    />
                                                    {/* Duration picker */}
                                                    <select
                                                        className="segment-duration-select"
                                                        value={seg.durationMs}
                                                        onChange={(e) => handleUpdateSegment(i, 'durationMs', Number(e.target.value))}
                                                    >
                                                        <option value={60000}>1 min</option>
                                                        <option value={300000}>5 min</option>
                                                        <option value={600000}>10 min</option>
                                                        <option value={900000}>15 min</option>
                                                        <option value={1200000}>20 min</option>
                                                        <option value={1500000}>25 min</option>
                                                        <option value={1800000}>30 min</option>
                                                    </select>
                                                    {/* Remove */}
                                                    <button className="segment-remove-btn" onClick={() => handleRemoveSegment(i)}>✕</button>
                                                </div>
                                            ))}

                                            {showClockSegments.length < BROADCAST.showClockMaxSegments && (
                                                <button className="add-segment-btn" onClick={handleAddSegment}>
                                                    + Add Segment
                                                </button>
                                            )}

                                            {showClockSegments.length > 0 && (
                                                <div className="segment-builder-footer">
                                                    <span className="total-duration">
                                                        Total: {Math.round(showClockSegments.reduce((a, s) => a + s.durationMs, 0) / 60000)} min
                                                    </span>
                                                    <div className="segment-builder-actions">
                                                        <button className="tool-btn save" onClick={handleSaveShowClock} disabled={isShowClockAction}>
                                                            <span className="tool-icon">💾</span>
                                                            <span className="tool-name">{isShowClockAction ? 'Saving...' : 'Save'}</span>
                                                        </button>
                                                        <button
                                                            className="tool-btn start-show"
                                                            onClick={() => handleShowClockAction('start')}
                                                            disabled={isShowClockAction || !showClock?.segments?.length}
                                                        >
                                                            <span className="tool-icon">▶️</span>
                                                            <span className="tool-name">{isShowClockAction ? 'Starting...' : 'Execute Show'}</span>
                                                        </button>
                                                        <button className="tool-btn danger-subtle" onClick={() => handleShowClockAction('clear')} disabled={isShowClockAction}>
                                                            <span className="tool-icon">🗑️</span>
                                                            <span className="tool-name">Clear</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Quick Tools */}
                        <div className="tools-grid">
                            <button
                                className={`tool-btn autopilot ${autoPilotEnabled ? 'active' : ''}`}
                                onClick={() => setAutoPilotEnabled(!autoPilotEnabled)}
                                disabled={!timerRunning}
                                title={timerRunning ? 'Toggle automatic surprise events' : 'Start a session first'}
                            >
                                <span className="tool-icon">🤖</span>
                                <span className="tool-name">{autoPilotEnabled ? 'Auto-Pilot ON' : 'Auto-Pilot'}</span>
                            </button>
                            <button className="tool-btn shuffle" onClick={handleShufflePlaylist} disabled={isShuffling || songs.length < 2}>
                                <span className="tool-icon">🔀</span>
                                <span className="tool-name">{isShuffling ? 'Shuffling...' : 'Shuffle'}</span>
                            </button>
                            <button className="tool-btn purge" onClick={handleStartDeleteWindow} disabled={isStartingDeleteWindow || deleteWindowActive || songs.length === 0}>
                                <span className="tool-icon">💀</span>
                                <span className="tool-name">{deleteWindowActive ? 'PURGE ON!' : 'The Purge'}</span>
                            </button>
                            <button className="tool-btn danger" onClick={handleWipeSession} disabled={isWiping}>
                                <span className="tool-icon">🗑️</span>
                                <span className="tool-name">{isWiping ? 'Wiping...' : 'Wipe All'}</span>
                            </button>
                            <button className="tool-btn karma-rain" onClick={handleKarmaRain} disabled={isRainingKarma}>
                                <span className="tool-icon">🌧️</span>
                                <span className="tool-name">{isRainingKarma ? 'Raining...' : 'Karma Rain'}</span>
                            </button>
                            <button className="tool-btn double-points" onClick={handleDoublePoints} disabled={isStartingDoublePoints || doublePointsActive}>
                                <span className="tool-icon">⚡</span>
                                <span className="tool-name">{doublePointsActive ? '2X ACTIVE!' : 'Double Points'}</span>
                            </button>
                            <button className="tool-btn predictions" onClick={handleRevealPredictions} disabled={isRevealingPredictions}>
                                <span className="tool-icon">🎯</span>
                                <span className="tool-name">{isRevealingPredictions ? 'Revealing...' : 'Reveal Predictions'}</span>
                            </button>
                            <button className="tool-btn prize-drop" onClick={handlePrizeDrop} disabled={isTriggeredPrizeDrop}>
                                <span className="tool-icon">🎰</span>
                                <span className="tool-name">{isTriggeredPrizeDrop ? 'Dropping...' : 'Prize Drop'}</span>
                            </button>

                            {/* 📺 STREAM PLATFORM SELECTOR */}
                            <div className="youtube-embed-control stream-config-panel">
                                <div className="control-label">
                                    <span className="tool-icon">📺</span>
                                    <span className="tool-name">Live Stream</span>
                                </div>

                                {/* Platform Toggle */}
                                <div className="stream-platform-toggle">
                                    <button
                                        className={`platform-btn ${streamPlatform === 'youtube' ? 'active youtube-active' : ''}`}
                                        onClick={() => {
                                            markStreamEditing();
                                            if (streamPlatform === 'youtube') {
                                                setStreamPlatform(null);
                                            } else {
                                                setStreamPlatform('youtube');
                                                if (!youtubeUrl) setYoutubeUrl('https://youtube.com/playlist?list=PLhHOzEAFc1RhNtCgvwyhmi25X2dJzODXX');
                                            }
                                        }}
                                    >
                                        ▶️ YouTube
                                    </button>
                                    <button
                                        className={`platform-btn ${streamPlatform === 'twitch' ? 'active twitch-active' : ''}`}
                                        onClick={() => {
                                            markStreamEditing();
                                            if (streamPlatform === 'twitch') {
                                                setStreamPlatform(null);
                                            } else {
                                                setStreamPlatform('twitch');
                                                if (!twitchChannel) setTwitchChannel('thecratehackers');
                                            }
                                        }}
                                    >
                                        🟣 Twitch
                                    </button>
                                </div>

                                {/* YouTube Input */}
                                {streamPlatform === 'youtube' && (
                                    <input
                                        type="text"
                                        className="youtube-url-input"
                                        value={youtubeUrl}
                                        onChange={(e) => { markStreamEditing(); setYoutubeUrl(e.target.value); }}
                                        placeholder="Default: Forgot About Pop playlist"
                                    />
                                )}

                                {/* Twitch Input */}
                                {streamPlatform === 'twitch' && (
                                    <input
                                        type="text"
                                        className="youtube-url-input twitch-channel-input"
                                        value={twitchChannel}
                                        onChange={(e) => { markStreamEditing(); setTwitchChannel(e.target.value); }}
                                        placeholder="Default: thecratehackers"
                                    />
                                )}

                                {/* Save / Clear buttons */}
                                <div className="stream-actions">
                                    <button
                                        className="tool-btn youtube-save"
                                        onClick={() => handleSaveStream()}
                                        disabled={isSavingStream}
                                    >
                                        <span className="tool-icon">💾</span>
                                        <span className="tool-name">{isSavingStream ? 'Saving...' : 'Save Stream'}</span>
                                    </button>
                                    {streamPlatform && (
                                        <button
                                            className="tool-btn danger-subtle"
                                            onClick={() => { setStreamPlatform(null); setYoutubeUrl(''); setTwitchChannel(''); handleSaveStream(null); }}
                                            disabled={isSavingStream}
                                        >
                                            <span className="tool-icon">🗑️</span>
                                            <span className="tool-name">Clear</span>
                                        </button>
                                    )}
                                </div>

                                {/* 👁️ Admin-only: hide stream on MY screen (prevents infinite mirror when broadcasting) */}
                                {streamPlatform && (
                                    <button
                                        className={`tool-btn stream-hide-toggle ${hideStreamLocally ? 'active danger-subtle' : ''}`}
                                        onClick={() => {
                                            const newVal = !hideStreamLocally;
                                            setHideStreamLocally(newVal);
                                            if (newVal) {
                                                persistSet('crate-admin-hide-stream', 'true');
                                            } else {
                                                persistRemove('crate-admin-hide-stream');
                                            }
                                        }}
                                    >
                                        <span className="tool-icon">{hideStreamLocally ? '👁️‍🗨️' : '🙈'}</span>
                                        <span className="tool-name">{hideStreamLocally ? 'Stream Hidden (My Screen)' : 'Hide Stream (My Screen)'}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
