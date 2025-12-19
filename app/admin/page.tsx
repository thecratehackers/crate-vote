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
            setMessage({ type: 'error', text: 'Failed to load playlist - check your connection' });
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
            // Show error only occasionally to avoid spam
            if (Math.random() < 0.1) {
                setMessage({ type: 'error', text: 'Timer sync failed - retrying...' });
            }
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
    const handleStartDeleteWindow = () => {
        showConfirmModal(
            '💀 START THE PURGE?',
            'This grants EVERY USER the ability to PURGE ONE song for 30 seconds.\n\nAll crimes are legal - use wisely!',
            async () => {
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
                        setMessage({ type: 'success', text: '💀 THE PURGE HAS BEGUN! Everyone has 30 seconds to purge ONE song!' });

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
            },
            'Start The Purge'
        );
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
            setMessage({ type: 'error', text: 'Failed to resolve battle - try again' });
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

    // Password login - verify with server before proceeding
    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adminPassword.trim() || isLoggingIn) return;

        setIsLoggingIn(true);
        setLoginError(null);

        try {
            // Verify password by making a test request
            const res = await fetch('/api/playlist', {
                headers: {
                    'x-admin-key': adminPassword,
                    'x-admin-id': adminId,
                },
            });

            if (res.ok) {
                setIsAuthenticated(true);
            } else if (res.status === 401) {
                setLoginError('Invalid password');
            } else {
                setLoginError('Server error - please try again');
            }
        } catch (error) {
            setLoginError('Connection failed - check your network');
        } finally {
            setIsLoggingIn(false);
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

            {/* Compact Stats Bar - Always visible */}
            <div className="admin-stats-bar">
                <div className="stat-mini" data-tooltip="Total tracks in playlist">
                    <span className="stat-value">{stats.totalSongs}</span>
                    <span className="stat-label">🎵</span>
                </div>
                <div className="stat-mini" data-tooltip="Total votes cast">
                    <span className="stat-value">{stats.totalVotes}</span>
                    <span className="stat-label">🗳️</span>
                </div>
                <div className="stat-mini" data-tooltip="Unique participants">
                    <span className="stat-value">{stats.uniqueVoters}</span>
                    <span className="stat-label">👥</span>
                </div>
                <div className="stat-mini" data-tooltip="Active users now">
                    <span className="stat-value">{activeUsers.length}</span>
                    <span className="stat-label">🟢</span>
                </div>
            </div>

            {/* Quick Actions - Always visible, most used features */}
            <div className="admin-quick-actions">
                <button className={`quick-action-btn ${isLocked ? 'locked' : ''}`} onClick={handleToggleLock} disabled={isTogglingLock}>
                    {isTogglingLock ? '⏳' : isLocked ? '🔓' : '🔒'}
                </button>
                <button className="quick-action-btn spotify" onClick={handleExportSpotify} disabled={songs.length === 0 || isExportingSpotify} title="Export to Spotify">
                    {isExportingSpotify ? '⏳' : '🎶'}
                </button>
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
                    <span className="tab-icon">📢</span>
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
                                    const timeAgo = Math.floor((Date.now() - activity.timestamp) / 1000);
                                    const timeStr = timeAgo < 5 ? 'now' : timeAgo < 60 ? `${timeAgo}s` : `${Math.floor(timeAgo / 60)}m`;
                                    return (
                                        <div key={activity.id} className={`activity-log-item ${activity.type}`}>
                                            <span className="activity-type-icon">
                                                {activity.type === 'add' ? '💿' : activity.type === 'upvote' ? '👍' : '👎'}
                                            </span>
                                            <span className="activity-user">{activity.userName}</span>
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
                                            <button className={`vote-mini up ${adminVotes[song.id] === 1 ? 'active' : ''}`} onClick={() => handleAdminVote(song.id, 1)}>👍</button>
                                            <span className={`score-mini ${song.score > 0 ? 'pos' : song.score < 0 ? 'neg' : ''}`}>{song.score > 0 ? '+' : ''}{song.score}</span>
                                            <button className={`vote-mini down ${adminVotes[song.id] === -1 ? 'active' : ''}`} onClick={() => handleAdminVote(song.id, -1)}>👎</button>
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
                        <div className="tools-grid">
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
                            <button className="tool-btn export" onClick={handleExportJSON} disabled={isExportingJSON}>
                                <span className="tool-icon">📁</span>
                                <span className="tool-name">Export JSON</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
