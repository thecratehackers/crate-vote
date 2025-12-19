'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { APP_CONFIG } from '@/lib/config';

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
    timestamp: number;
}

export default function AdminPage() {
    const { data: session } = useSession();
    const [adminPassword, setAdminPassword] = useState('');
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
    const [isAddingSong, setIsAddingSong] = useState<string | null>(null);

    // Delete window (chaos mode) state
    const [isStartingDeleteWindow, setIsStartingDeleteWindow] = useState(false);
    const [deleteWindowActive, setDeleteWindowActive] = useState(false);
    const [deleteWindowEndTime, setDeleteWindowEndTime] = useState<number | null>(null);

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

    // Ref to prevent polling while confirmation dialogs are open
    const isConfirmDialogOpen = useRef(false);

    // Fetch playlist data (with admin heartbeat)
    const fetchPlaylist = useCallback(async () => {
        // Skip fetching if a confirmation dialog is open to prevent flickering
        if (isConfirmDialogOpen.current) return;

        try {
            const res = await fetch('/api/playlist', {
                headers: isAuthenticated ? {
                    'x-admin-key': adminPassword,
                    'x-admin-id': adminId,
                } : {},
            });
            const data = await res.json();
            setSongs(data.songs);
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
        } catch (error) {
            console.error('Failed to fetch playlist:', error);
        }
    }, [isAuthenticated, adminPassword, adminId, isEditingTitle]);

    // Fetch timer status
    const fetchTimer = useCallback(async () => {
        // Skip fetching if a confirmation dialog is open to prevent flickering
        if (isConfirmDialogOpen.current) return;

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
        }
    }, []);

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
    const handleBanUserDirect = async (visitorId: string, userName: string) => {
        if (isBanningUser === visitorId) return;
        isConfirmDialogOpen.current = true;
        const confirmed = confirm(`Ban ${userName}? This will remove them AND all their songs.`);
        isConfirmDialogOpen.current = false;
        if (!confirmed) return;

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
    const handleWipeSession = async () => {
        isConfirmDialogOpen.current = true;
        const confirmed = confirm('⚠️ WIPE ENTIRE SESSION?\n\nThis will delete ALL songs, reset the timer, and unban all users.\n\nThis cannot be undone!');
        isConfirmDialogOpen.current = false;
        if (!confirmed) {
            return;
        }
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
    };

    // Refresh audio features for all songs
    const handleRefreshFeatures = async () => {
        try {
            setMessage({ type: 'success', text: 'Refreshing audio features...' });
            const res = await adminFetch('/api/admin/refresh-features', {
                method: 'POST',
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                fetchPlaylist(); // Refresh to show updated features
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to refresh features' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to refresh features - network error' });
        }
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

    // Start THE PURGE - grants everyone ONE delete for 30 seconds
    const handleStartDeleteWindow = async () => {
        isConfirmDialogOpen.current = true;
        const confirmed = confirm('� START THE PURGE?\n\nThis grants EVERY USER the ability to PURGE ONE song for 30 seconds.\n\nAll crimes are legal - use wisely!');
        isConfirmDialogOpen.current = false;
        if (!confirmed) {
            return;
        }

        setIsStartingDeleteWindow(true);
        try {
            const res = await adminFetch('/api/admin/delete-window', {
                method: 'POST',
                body: JSON.stringify({ duration: 30 }),
            });

            if (res.ok) {
                const data = await res.json();
                setDeleteWindowActive(true);
                setDeleteWindowEndTime(data.endTime);
                setMessage({ type: 'success', text: '� THE PURGE HAS BEGUN! Everyone has 30 seconds to purge ONE song!' });

                // Auto-refresh when window ends
                setTimeout(() => {
                    setDeleteWindowActive(false);
                    setDeleteWindowEndTime(null);
                    fetchPlaylist();
                }, 30000);
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to start The Purge' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to start The Purge - network error' });
        } finally {
            setIsStartingDeleteWindow(false);
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
        }
    }, [isAuthenticated, adminPassword, adminId]);

    // Poll for battle status when battle is active
    useEffect(() => {
        if (!isAuthenticated) return;

        // Fetch immediately
        fetchVersusBattle();

        // Poll every 2 seconds during active battle
        const interval = setInterval(fetchVersusBattle, 2000);
        return () => clearInterval(interval);
    }, [isAuthenticated, fetchVersusBattle]);

    // Countdown timer for battle (just visual - don't auto-resolve from admin, let server handle it)
    useEffect(() => {
        if (!versusBattle.active || !versusBattle.endTime) return;

        const interval = setInterval(() => {
            const remaining = Math.max(0, versusBattle.endTime! - Date.now());
            setBattleCountdown(remaining);

            // When timer hits 0, fetch to get resolved state (but don't trigger resolve - let polling handle it)
            // This prevents race conditions from multiple clients trying to resolve
        }, 100);

        return () => clearInterval(interval);
    }, [versusBattle.active, versusBattle.endTime]);

    // Start a new versus battle
    const handleStartVersusBattle = async () => {
        setIsStartingBattle(true);
        try {
            const res = await adminFetch('/api/admin/versus-battle', {
                method: 'POST',
                body: JSON.stringify({ action: 'start' }),
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: `⚔️ VERSUS BATTLE! "${data.songA.name}" vs "${data.songB.name}"` });
                setVersusBattle({
                    active: true,
                    songA: data.songA,
                    songB: data.songB,
                    endTime: data.endTime,
                    phase: 'voting',
                    isLightningRound: false,
                });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to start battle' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to start battle - network error' });
        } finally {
            setIsStartingBattle(false);
        }
    };

    // Resolve the battle (when timer ends)
    const handleResolveBattle = async () => {
        // Prevent multiple simultaneous resolves
        if (isResolvingBattle.current) return;
        isResolvingBattle.current = true;

        try {
            const res = await adminFetch('/api/admin/versus-battle', {
                method: 'POST',
                body: JSON.stringify({ action: 'resolve' }),
            });
            const data = await res.json();

            if (res.ok) {
                if (data.isTie) {
                    // It's a tie - show option for lightning round
                    setMessage({ type: 'success', text: `⚡ TIE! ${data.votesA} vs ${data.votesB} — Start lightning round!` });
                    setVersusBattle(prev => ({ ...prev, phase: 'voting', votesA: data.votesA, votesB: data.votesB }));
                } else {
                    setMessage({ type: 'success', text: `🏆 Song ${data.winner} WINS! "${data.deletedSongName}" eliminated!` });
                    setVersusBattle({ active: false });
                    fetchPlaylist();
                }
            }
        } catch (error) {
            console.error('Failed to resolve battle:', error);
        } finally {
            isResolvingBattle.current = false;
        }
    };

    // Start lightning round
    const handleLightningRound = async () => {
        try {
            const res = await adminFetch('/api/admin/versus-battle', {
                method: 'POST',
                body: JSON.stringify({ action: 'lightning' }),
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: '⚡ LIGHTNING ROUND! 15 seconds!' });
                setVersusBattle(prev => ({
                    ...prev,
                    endTime: data.endTime,
                    phase: 'lightning',
                    isLightningRound: true,
                    votesA: 0,
                    votesB: 0,
                }));
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to start lightning round' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to start lightning round' });
        }
    };

    // Admin override - pick a winner
    const handleOverrideWinner = async (winner: 'A' | 'B') => {
        try {
            const res = await adminFetch('/api/admin/versus-battle', {
                method: 'POST',
                body: JSON.stringify({ action: 'override', winner }),
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: `👑 ADMIN OVERRIDE: Song ${winner} wins! "${data.deletedSongName}" eliminated!` });
                setVersusBattle({ active: false });
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to override' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to override - network error' });
        }
    };

    // Cancel battle
    const handleCancelBattle = async () => {
        try {
            const res = await adminFetch('/api/admin/versus-battle', {
                method: 'POST',
                body: JSON.stringify({ action: 'cancel' }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: '❌ Battle cancelled' });
                setVersusBattle({ active: false });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to cancel battle' });
        }
    };

    // Toggle lock
    const handleToggleLock = async () => {
        if (isTogglingLock) return;
        setIsTogglingLock(true);
        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({ action: isLocked ? 'unlock' : 'lock' }),
            });
            if (res.ok) {
                const data = await res.json();
                setIsLocked(data.isLocked);
                setMessage({ type: 'success', text: data.isLocked ? '✓ Playlist locked' : '✓ Playlist unlocked' });
            } else {
                setMessage({ type: 'error', text: 'Failed to toggle lock' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to toggle lock - network error' });
        } finally {
            setIsTogglingLock(false);
        }
    };

    // Export to Spotify (only if connected)
    const handleExportSpotify = async () => {
        if (!session) {
            setMessage({ type: 'success', text: 'Connecting to Spotify...' });
            signIn('spotify');
            return;
        }

        if (isExportingSpotify) return;
        setIsExportingSpotify(true);
        setMessage({ type: 'success', text: 'Creating Spotify playlist...' });

        try {
            // Strip emojis from playlist title for Spotify
            const cleanTitle = playlistTitle
                .split('')
                .filter(char => {
                    const code = char.charCodeAt(0);
                    return !(code >= 0x1F300 && code <= 0x1F9FF) &&
                        !(code >= 0x2600 && code <= 0x26FF) &&
                        !(code >= 0x2700 && code <= 0x27BF) &&
                        !(code >= 0xD83C && code <= 0xD83E);
                })
                .join('')
                .replace(/\s+/g, ' ')
                .trim();

            const res = await fetch('/api/playlist/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: cleanTitle || `${APP_CONFIG.name} Playlist`,
                    description: `Created with Hackathon | ${stats.totalSongs} songs | ${stats.uniqueVoters} voters`,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setExportUrl(data.playlistUrl);
                setMessage({ type: 'success', text: `✓ Playlist created with ${data.trackCount} tracks!` });
            } else {
                setMessage({ type: 'error', text: data.error || 'Export failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to export playlist - network error' });
        } finally {
            setIsExportingSpotify(false);
        }
    };

    // Export JSON download
    const handleExportJSON = async () => {
        if (isExportingJSON) return;
        setIsExportingJSON(true);
        try {
            const res = await fetch('/api/playlist/export');
            const data = await res.json();

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hackathon-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);

            setMessage({ type: 'success', text: '✓ Exported as JSON' });
        } catch (error) {
            setMessage({ type: 'error', text: 'Export failed - network error' });
        } finally {
            setIsExportingJSON(false);
        }
    };

    // Password login
    const handlePasswordLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (adminPassword.trim()) {
            setIsAuthenticated(true);
        }
    };

    // Show login screen if not authenticated
    if (!isAuthenticated) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <img src="/logo.png" alt="Hackathon" style={{ width: 80, height: 80, marginBottom: 16 }} />
                    <h1>Admin Panel</h1>
                    <p>Enter the admin password to access controls</p>

                    <form className="password-form" onSubmit={handlePasswordLogin} autoComplete="off">
                        <input
                            type="password"
                            placeholder="Admin password"
                            value={adminPassword}
                            onChange={(e) => { setAdminPassword(e.target.value); setLoginError(null); }}
                            autoFocus
                            autoComplete="new-password"
                            data-lpignore="true"
                            data-form-type="other"
                            disabled={isLoggingIn}
                        />
                        {loginError && <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: 8 }}>{loginError}</div>}
                        <button type="submit" className="admin-btn primary" disabled={isLoggingIn || !adminPassword.trim()}>
                            {isLoggingIn ? '⏳ Verifying...' : 'Enter Admin Panel'}
                        </button>
                    </form>

                    <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border-color)' }}>
                        <Link href="/" style={{ color: 'var(--orange-primary)', fontSize: '0.875rem' }}>
                            ← Back to voting
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            {/* Top bar */}
            <div className="top-bar">
                <Link href="/" className="admin-link">
                    ← Back to Voting
                </Link>
                {timerRunning && <span className="live-indicator">🔴 LIVE</span>}
            </div>

            <header className="header">
                <div className="logo-header-admin">
                    <Link href="/" title="Go to Voting Page">
                        <img src="/logo.png" alt="Hackathon" className="header-logo-admin clickable-logo" />
                    </Link>
                    <div>
                        <h1>
                            <span className="logo-text">Hackathon</span>
                        </h1>
                        <p>Admin Panel</p>
                    </div>
                </div>
                {/* 👥 ADMIN COUNT INDICATOR */}
                <div className="admin-count-indicator">
                    <span className="admin-dot"></span>
                    <span className="admin-count-text">
                        {activeAdminCount} Admin{activeAdminCount !== 1 ? 's' : ''} Online
                    </span>
                </div>
            </header>

            {/* 📝 PLAYLIST TITLE EDITOR */}
            <div className="title-editor-panel">
                <label>📝 Playlist Title (shown to users):</label>
                {isEditingTitle ? (
                    <div className="title-edit-row">
                        <input
                            type="text"
                            value={titleInput}
                            onChange={(e) => setTitleInput(e.target.value)}
                            placeholder="Enter playlist title..."
                            maxLength={100}
                            autoFocus
                            disabled={isSavingTitle}
                        />
                        <button className="admin-btn success small" onClick={handleSaveTitle} disabled={isSavingTitle}>
                            {isSavingTitle ? '⏳...' : '✓ Save'}
                        </button>
                        <button className="admin-btn small" onClick={() => {
                            setIsEditingTitle(false);
                            setTitleInput(playlistTitle);
                        }} disabled={isSavingTitle}>
                            ✕ Cancel
                        </button>
                    </div>
                ) : (
                    <div className="title-display-row">
                        <span className="current-title">{playlistTitle}</span>
                        <button className="admin-btn small" onClick={() => setIsEditingTitle(true)}>
                            ✏️ Edit
                        </button>
                    </div>
                )}
            </div>

            {/* 🔀 SHUFFLE PLAYLIST (if songs exist) */}
            {songs.length > 1 && (
                <div className="shuffle-panel">
                    <button
                        className="admin-btn shuffle-btn"
                        onClick={handleShufflePlaylist}
                        disabled={isShuffling}
                    >
                        {isShuffling ? '🔄 Shuffling...' : '🔀 Shuffle Playlist Order'}
                    </button>
                    <span className="shuffle-hint">Randomize the order of all {songs.length} songs</span>
                </div>
            )}

            {/* Timer Control Panel */}
            <div className="timer-control-panel">
                <div className="timer-display-large">
                    {timerRunning ? (
                        <>
                            <div className="timer-label">Session Active</div>
                            <div className={`timer-value-large ${timerRemaining < 60000 ? 'urgent' : ''}`}>
                                {formatTime(timerRemaining)}
                            </div>
                        </>
                    ) : (
                        <div className="timer-label">Session Inactive</div>
                    )}
                </div>

                <div className="timer-controls">
                    <div className="timer-duration-select">
                        <label>Duration:</label>
                        <select
                            value={selectedDuration}
                            onChange={(e) => setSelectedDuration(Number(e.target.value))}
                            disabled={timerRunning}
                        >
                            <option value={5}>5 min</option>
                            <option value={10}>10 min</option>
                            <option value={15}>15 min</option>
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>1 hour</option>
                            <option value={120}>2 hours</option>
                            <option value={360}>6 hours</option>
                            <option value={720}>12 hours</option>
                            <option value={1440}>24 hours</option>
                            <option value={10080}>7 days</option>
                        </select>
                    </div>

                    <div className="timer-buttons">
                        {!timerRunning ? (
                            <button className="admin-btn success" onClick={handleStartTimer} disabled={isTimerAction}>
                                {isTimerAction ? '⏳ Starting...' : '▶️ Start Session'}
                            </button>
                        ) : (
                            <button className="admin-btn danger" onClick={handleStopTimer} disabled={isTimerAction}>
                                {isTimerAction ? '⏳ Stopping...' : '⏹️ Stop Session'}
                            </button>
                        )}
                        <button className="admin-btn" onClick={handleResetTimer} disabled={isTimerAction}>
                            {isTimerAction ? '⏳...' : '🔄 Reset Timer'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-panel">
                <div className="stat-card">
                    <div className="value">{stats.totalSongs}</div>
                    <div className="label">Songs</div>
                </div>
                <div className="stat-card">
                    <div className="value">{stats.totalVotes}</div>
                    <div className="label">Total Votes</div>
                </div>
                <div className="stat-card">
                    <div className="value">{stats.uniqueVoters}</div>
                    <div className="label">Unique Voters</div>
                </div>
            </div>

            {/* Admin controls */}
            <div className="admin-bar">
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button className={`admin-btn ${isLocked ? 'success' : ''}`} onClick={handleToggleLock} disabled={isTogglingLock}>
                        {isTogglingLock ? '⏳...' : isLocked ? '🔓 Unlock Playlist' : '🔒 Lock Playlist'}
                    </button>
                    <button
                        className="admin-btn chaos-btn"
                        onClick={handleStartDeleteWindow}
                        disabled={isStartingDeleteWindow || deleteWindowActive || songs.length === 0}
                    >
                        {deleteWindowActive ? '� THE PURGE ACTIVE!' : isStartingDeleteWindow ? '⏳ Starting...' : '� The Purge'}
                    </button>
                    <button
                        className="admin-btn versus-btn"
                        onClick={handleStartVersusBattle}
                        disabled={isStartingBattle || versusBattle.active || songs.length < 5 || deleteWindowActive}
                        style={{ background: versusBattle.active ? '#ff6b35' : 'linear-gradient(135deg, #ff6b35, #f7931e)' }}
                        title={songs.length < 5 ? 'Need at least 5 songs (top 3 protected, need 2+ to battle)' : deleteWindowActive ? 'Wait for The Purge to end' : ''}
                    >
                        {versusBattle.active ? '⚔️ BATTLE ACTIVE!' : isStartingBattle ? '⏳ Starting...' : '⚔️ Versus Battle'}
                    </button>
                    <button className="admin-btn danger" onClick={handleWipeSession} disabled={isWiping}>
                        {isWiping ? '⏳ Wiping...' : '🗑️ Wipe Session'}
                    </button>
                    <button className="admin-btn spotify-green" onClick={handleExportSpotify} disabled={songs.length === 0 || isExportingSpotify}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ marginRight: 6 }}>
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        {isExportingSpotify ? 'Exporting...' : 'Export to Spotify'}
                    </button>
                </div>
            </div>

            {/* ⚔️ VERSUS BATTLE PANEL - Shows when battle is active */}
            {versusBattle.active && versusBattle.songA && versusBattle.songB && (
                <div className="versus-battle-panel" style={{
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    border: '2px solid #ff6b35',
                    borderRadius: '16px',
                    padding: '24px',
                    marginBottom: '24px',
                    boxShadow: '0 0 30px rgba(255, 107, 53, 0.3)',
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                        <h2 style={{
                            fontSize: '1.5rem',
                            color: '#ff6b35',
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '2px',
                        }}>
                            {versusBattle.isLightningRound ? '⚡ LIGHTNING ROUND ⚡' : '⚔️ VERSUS BATTLE ⚔️'}
                        </h2>
                        <div style={{
                            fontSize: '2.5rem',
                            fontWeight: 'bold',
                            color: battleCountdown <= 5000 ? '#ff4444' : '#fff',
                            marginTop: '8px',
                            fontFamily: 'monospace',
                        }}>
                            {Math.ceil(battleCountdown / 1000)}s
                        </div>
                    </div>

                    {/* Song Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 1fr',
                        gap: '20px',
                        alignItems: 'center',
                        marginBottom: '20px',
                    }}>
                        {/* Song A */}
                        <div style={{
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            padding: '16px',
                            textAlign: 'center',
                        }}>
                            <img
                                src={versusBattle.songA.albumArt}
                                alt=""
                                style={{ width: '80px', height: '80px', borderRadius: '8px', marginBottom: '12px' }}
                            />
                            <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>
                                {versusBattle.songA.name}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                                {versusBattle.songA.artist}
                            </div>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 'bold',
                                color: '#4ade80',
                                marginTop: '12px'
                            }}>
                                {versusBattle.votesA ?? 0} votes
                            </div>
                        </div>

                        {/* VS */}
                        <div style={{
                            fontSize: '2rem',
                            fontWeight: 'bold',
                            color: '#ff6b35',
                            textShadow: '0 0 20px rgba(255, 107, 53, 0.5)',
                        }}>
                            VS
                        </div>

                        {/* Song B */}
                        <div style={{
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            padding: '16px',
                            textAlign: 'center',
                        }}>
                            <img
                                src={versusBattle.songB.albumArt}
                                alt=""
                                style={{ width: '80px', height: '80px', borderRadius: '8px', marginBottom: '12px' }}
                            />
                            <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>
                                {versusBattle.songB.name}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                                {versusBattle.songB.artist}
                            </div>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 'bold',
                                color: '#4ade80',
                                marginTop: '12px'
                            }}>
                                {versusBattle.votesB ?? 0} votes
                            </div>
                        </div>
                    </div>

                    {/* Admin Controls */}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            className="admin-btn"
                            onClick={handleLightningRound}
                            style={{ background: '#8b5cf6' }}
                        >
                            ⚡ Lightning Round (15s)
                        </button>
                        {battleCountdown <= 0 && (
                            <button
                                className="admin-btn primary"
                                onClick={handleResolveBattle}
                                style={{ background: '#22c55e' }}
                            >
                                ✅ Resolve Battle
                            </button>
                        )}
                        <button
                            className="admin-btn success"
                            onClick={() => handleOverrideWinner('A')}
                        >
                            👑 Song A Wins
                        </button>
                        <button
                            className="admin-btn success"
                            onClick={() => handleOverrideWinner('B')}
                        >
                            👑 Song B Wins
                        </button>
                        <button
                            className="admin-btn danger"
                            onClick={handleCancelBattle}
                        >
                            ❌ Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Messages */}
            {message && (
                <div className={`message ${message.type}`}>
                    {message.type === 'success' ? '✓' : '✕'} {message.text}
                </div>
            )}

            {/* Export URL */}
            {exportUrl && (
                <div className="message success">
                    ✓ Playlist created!{' '}
                    <a href={exportUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 'bold' }}>
                        Open in Spotify →
                    </a>
                </div>
            )}

            {/* 📢 LIVE ACTIVITY FEED - For admin commentary */}
            <div className="live-activity-section">
                <h3>📢 Live Activity Feed</h3>
                <div className="activity-log">
                    {recentActivity.length === 0 ? (
                        <p className="no-activity">No recent activity. Waiting for users...</p>
                    ) : (
                        recentActivity.map(activity => {
                            const timeAgo = Math.floor((Date.now() - activity.timestamp) / 1000);
                            const timeStr = timeAgo < 5 ? 'just now' :
                                timeAgo < 60 ? `${timeAgo}s ago` :
                                    `${Math.floor(timeAgo / 60)}m ago`;

                            return (
                                <div key={activity.id} className={`activity-log-item ${activity.type}`}>
                                    <span className="activity-type-icon">
                                        {activity.type === 'add' ? '💿' : activity.type === 'upvote' ? '👍' : '👎'}
                                    </span>
                                    <span className="activity-user">{activity.userName}</span>
                                    <span className="activity-action">
                                        {activity.type === 'add' ? 'added' : activity.type === 'upvote' ? 'upvoted' : 'downvoted'}
                                    </span>
                                    <span className="activity-song">"{activity.songName}"</span>
                                    <span className="activity-time">{timeStr}</span>
                                    {/* Activity action buttons - appear on hover */}
                                    <div className="activity-actions">
                                        {/* Delete just this activity */}
                                        <button
                                            className="delete-activity-btn"
                                            onClick={() => handleDeleteActivity(activity.id, activity.songName)}
                                            title="Remove from activity feed"
                                        >
                                            🗑️
                                        </button>
                                        {/* Quick ban button - hidden for admins */}
                                        {!activity.userName.toLowerCase().includes('admin') && (
                                            <button
                                                className="quick-ban-btn"
                                                onClick={() => handleQuickBan(activity.visitorId, activity.userName)}
                                                title={`Ban ${activity.userName} instantly`}
                                            >
                                                ❌
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Active Users Section */}
            <div className="active-users-section">
                <h3>👥 Active Participants ({activeUsers.length})</h3>
                {activeUsers.length === 0 ? (
                    <p className="no-users">No participants yet. Start a session!</p>
                ) : (
                    <div className="users-grid">
                        {activeUsers.map(user => {
                            const minutesAgo = user.lastActivity ? Math.floor((Date.now() - user.lastActivity) / 60000) : null;
                            const isRecentlyActive = minutesAgo !== null && minutesAgo < 2;

                            return (
                                <div key={user.visitorId} className={`user-card ${user.isBanned ? 'banned' : ''} ${isRecentlyActive ? 'recently-active' : ''}`}>
                                    <div className="user-info">
                                        <span className="user-name">
                                            {isRecentlyActive && <span className="active-dot">●</span>}
                                            {user.name}
                                            {user.name.toLowerCase().includes('admin') && <span className="admin-badge">ADMIN</span>}
                                        </span>
                                        <span className="user-songs">{user.songsAdded} song{user.songsAdded !== 1 ? 's' : ''}</span>
                                        {user.karma > 0 && <span className="user-karma">⭐ {user.karma}</span>}
                                        {minutesAgo !== null && (
                                            <span className={`user-activity ${isRecentlyActive ? 'recent' : ''}`}>
                                                {minutesAgo === 0 ? 'just now' : minutesAgo === 1 ? '1m ago' : `${minutesAgo}m ago`}
                                            </span>
                                        )}
                                    </div>
                                    <div className="user-actions">
                                        {!user.isBanned && (
                                            <div className="karma-dropdown-wrapper">
                                                <select
                                                    className="karma-select"
                                                    defaultValue=""
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            handleGrantKarma(user.visitorId, user.name, Number(e.target.value));
                                                            e.target.value = '';
                                                        }
                                                    }}
                                                    title="Grant Karma"
                                                >
                                                    <option value="" disabled>+⭐</option>
                                                    <option value="5">+5 (1 song)</option>
                                                    <option value="10">+10 (2 songs)</option>
                                                    <option value="25">+25 (5 songs)</option>
                                                    <option value="50">+50 (10 songs)</option>
                                                </select>
                                            </div>
                                        )}
                                        {!user.isBanned ? (
                                            <button
                                                className="kick-btn"
                                                onClick={() => handleBanUserDirect(user.visitorId, user.name)}
                                                title="Kick user"
                                            >
                                                ❌
                                            </button>
                                        ) : (
                                            <span className="banned-label">BANNED</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Admin Song Search */}
            <div className="admin-search-section">
                <h3>➕ Add Songs (Unlimited)</h3>
                <div className="search-compact" style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="🔍 Search songs to add..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                        onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                        }}
                    />
                    {isSearching && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>...</span>}

                    {showSearchResults && searchResults.length > 0 && (
                        <div className="search-dropdown" style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            right: 0,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                            zIndex: 100,
                            maxHeight: '300px',
                            overflowY: 'auto',
                        }}>
                            {searchResults.slice(0, 5).map((track) => (
                                <div key={track.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 14px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid var(--border-color)',
                                }} onClick={() => handleAdminAddSong(track)}>
                                    <img src={track.albumArt || '/placeholder.svg'} alt="" style={{ width: 40, height: 40, borderRadius: 4 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--orange-primary)' }}>{track.artist}</div>
                                    </div>
                                    {isSongInPlaylist(track.id) ? (
                                        <span style={{ color: 'var(--text-muted)' }}>✓</span>
                                    ) : (
                                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>+</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Playlist - Admin GOD MODE */}
            <div className="admin-playlist">
                <h3>📦 Playlist ({songs.length} tracks)</h3>
                {songs.length === 0 ? (
                    <div className="playlist-empty">
                        <div className="icon">�</div>
                        <p>No songs yet. Use the search above to add songs!</p>
                    </div>
                ) : (
                    <div className="song-list-admin">
                        {songs.map((song, index) => (
                            <div key={song.id} className={`song-row-admin ${index < 3 ? 'top-song' : ''}`}>
                                {/* Rank */}
                                <span className={`rank-badge ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}>
                                    {index === 0 ? '👑' : `#${index + 1}`}
                                </span>

                                {/* Album Art */}
                                <img src={song.albumArt || '/placeholder.svg'} alt={song.album} className="album-thumb" />

                                {/* Song Info */}
                                <div className="song-info-admin">
                                    <span className="song-title">{song.name}</span>
                                    <span className="song-artist">{song.artist}</span>
                                    <span className="song-added-by">Added by {song.addedByName || 'Anonymous'}</span>
                                </div>

                                {/* Voting - matching homepage green/red style */}
                                <div className="vote-inline admin-votes">
                                    <button
                                        className={`thumb-btn up ${adminVotes[song.id] === 1 ? 'active' : ''}`}
                                        onClick={() => handleAdminVote(song.id, 1)}
                                        title="Upvote (admin)"
                                    >
                                        👍
                                    </button>
                                    <span className={`vote-score ${song.score > 0 ? 'positive' : song.score < 0 ? 'negative' : ''}`}>
                                        {song.score > 0 ? '+' : ''}{song.score}
                                    </span>
                                    <button
                                        className={`thumb-btn down ${adminVotes[song.id] === -1 ? 'active' : ''}`}
                                        onClick={() => handleAdminVote(song.id, -1)}
                                        title="Downvote (admin)"
                                    >
                                        👎
                                    </button>
                                </div>

                                {/* DELETE - Admin only, always visible */}
                                <button
                                    className={`admin-delete-btn ${isDeletingSong === song.id ? 'deleting' : ''}`}
                                    onClick={() => handleRemoveSong(song.id)}
                                    title="Delete song permanently"
                                    disabled={isDeletingSong === song.id}
                                >
                                    {isDeletingSong === song.id ? '⏳' : '🗑️'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div >
    );
}
