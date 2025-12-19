'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';

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
    addedAt: number;
    score: number;
    // Audio features for DJs
    popularity: number;
    bpm: number | null;
    energy: number | null;
    valence: number | null;
    danceability: number | null;
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
    const [userStatus, setUserStatus] = useState<UserStatus>({ songsRemaining: 5, songsAdded: 0, deletesRemaining: 5, deletesUsed: 0, upvotesRemaining: 5, upvotesUsed: 0, downvotesRemaining: 5, downvotesUsed: 0 });
    const [isLocked, setIsLocked] = useState(false);
    const [visitorId, setVisitorId] = useState<string | null>(null);
    const [isBanned, setIsBanned] = useState(false);

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
    const [playlistTitle, setPlaylistTitle] = useState('Hackathon Playlist');
    const [playlistStats, setPlaylistStats] = useState<{ current: number; max: number; canAdd: boolean }>({ current: 0, max: 100, canAdd: true });
    const [viewerCount, setViewerCount] = useState<number>(0);

    // Delete window (chaos mode) state
    const [deleteWindow, setDeleteWindow] = useState<{ active: boolean; endTime: number | null; remaining: number; canDelete: boolean }>({
        active: false, endTime: null, remaining: 0, canDelete: false
    });
    const [deleteWindowRemaining, setDeleteWindowRemaining] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);

    // Sort songs by score (like Reddit) - use useMemo to re-sort whenever scores change
    const sortedSongs = useMemo(() => {
        return [...songs].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.addedAt - b.addedAt; // Older first for ties
        });
    }, [songs]);

    // Username state - simple name entry
    const [username, setUsername] = useState<string | null>(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [showUsernameModal, setShowUsernameModal] = useState(false);

    // Audio preview state
    const [playingSongId, setPlayingSongId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 🎉 DOPAMINE FEATURES - Engagement state
    const [previousRanks, setPreviousRanks] = useState<Record<string, number>>({});
    const [showConfetti, setShowConfetti] = useState(false);
    const [confettiMessage, setConfettiMessage] = useState('');
    const [voteAnimation, setVoteAnimation] = useState<{ songId: string; type: 'up' | 'down' } | null>(null);
    const [recentlyMoved, setRecentlyMoved] = useState<Record<string, 'up' | 'down' | 'new'>>({});
    const [showKarmaTooltip, setShowKarmaTooltip] = useState(false);

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

    // Toggle audio preview
    const togglePreview = (songId: string, previewUrl: string | null) => {
        if (!previewUrl) {
            setMessage({ type: 'error', text: 'No preview available for this track' });
            return;
        }

        if (playingSongId === songId) {
            // Stop playing
            audioRef.current?.pause();
            setPlayingSongId(null);
        } else {
            // Start playing new song
            if (audioRef.current) {
                audioRef.current.pause();
            }
            audioRef.current = new Audio(previewUrl);
            audioRef.current.volume = 0.5;
            audioRef.current.play();
            audioRef.current.onended = () => setPlayingSongId(null);
            setPlayingSongId(songId);
        }
    };

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            audioRef.current?.pause();
        };
    }, []);

    // Initialize fingerprint and load saved username
    useEffect(() => {
        async function init() {
            // Get fingerprint
            const { getVisitorId } = await import('@/lib/fingerprint');
            const id = await getVisitorId();
            setVisitorId(id);

            // Load saved username from localStorage
            const savedName = localStorage.getItem('crate-username');
            if (savedName) {
                setUsername(savedName);
            } else {
                setShowUsernameModal(true);
            }
        }
        init();
    }, []);

    // Client-side profanity filter for usernames
    const BLOCKED_WORDS = new Set([
        'fuck', 'fucking', 'shit', 'ass', 'asshole', 'bitch', 'damn', 'crap',
        'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut', 'bastard', 'piss',
        'nigga', 'nigger', 'faggot', 'fag', 'retard', 'retarded'
    ]);

    const containsBadWord = (text: string): boolean => {
        const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
        return words.some(word => BLOCKED_WORDS.has(word));
    };

    // Save username
    const handleSetUsername = () => {
        const name = usernameInput.trim();
        if (name.length > 0) {
            // Check for profanity
            if (containsBadWord(name)) {
                alert('Please choose an appropriate username.');
                return;
            }
            setUsername(name);
            localStorage.setItem('crate-username', name);
            setShowUsernameModal(false);
        }
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
            const res = await fetch('/api/songs', {
                headers: { 'x-visitor-id': visitorId },
            });
            const data = await res.json();
            const newSongs: Song[] = data.songs;

            // 🎉 DOPAMINE: Track rank changes
            const newRanks: Record<string, number> = {};
            const rankChanges: Record<string, 'up' | 'down' | 'new'> = {};

            // Sort to get current ranks
            const sorted = [...newSongs].sort((a, b) => {
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
        } catch (error) {
            console.error('Failed to fetch playlist:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [visitorId]);

    // Fetch timer status
    const fetchTimer = useCallback(async () => {
        try {
            const res = await fetch('/api/timer', {
                headers: visitorId ? { 'x-visitor-id': visitorId } : {},
            });
            const data: TimerStatus = await res.json();
            setTimerRunning(data.running);
            setTimerEndTime(data.endTime);
            setIsBanned(data.isBanned);

            if (data.running && data.endTime) {
                setTimerRemaining(Math.max(0, data.endTime - Date.now()));
            } else {
                setTimerRemaining(0);
            }
        } catch (error) {
            console.error('Failed to fetch timer:', error);
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

    // 💡 Periodic karma tips in activity feed
    useEffect(() => {
        const karmaTips = [
            '💡 TIP: Get your song in the Top 3 to earn +5 karma!',
            '✨ TIP: Spend 5 karma to add an extra song!',
            '🏆 TIP: Click the Karma ring to learn more!',
        ];
        let tipIndex = 0;

        const tipInterval = setInterval(() => {
            const tip: ActivityItem = {
                id: `tip-${Date.now()}`,
                type: 'add',
                userName: 'System',
                songName: karmaTips[tipIndex % karmaTips.length],
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
                `🎵 ${sortedSongs.length} songs and counting!`,
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
                // Silent fail
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
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
                const data = await res.json();
                setSearchResults(data.tracks || []);
                setShowResults(true);
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [searchQuery]);

    // Add song
    const handleAddSong = async (track: SearchResult) => {
        if (!visitorId || !username) return;

        try {
            const res = await fetch('/api/songs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-visitor-id': visitorId,
                },
                body: JSON.stringify({ ...track, addedByName: username }),
            });

            const data = await res.json();

            if (!res.ok) {
                setMessage({ type: 'error', text: data.error });
                return;
            }

            setMessage({ type: 'success', text: `Added "${track.name}"!` });
            setSearchQuery('');
            setShowResults(false);
            fetchPlaylist();
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to add song' });
        }
    };

    // Vote on song - NEW MODEL: user gets ONE upvote and ONE downvote total
    const handleVote = async (songId: string, vote: 1 | -1) => {
        if (!visitorId || isBanned) return;

        // 🎉 DOPAMINE: Trigger vote animation
        setVoteAnimation({ songId, type: vote === 1 ? 'up' : 'down' });
        setTimeout(() => setVoteAnimation(null), 600);

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
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                if (data.error?.includes('banned')) {
                    setIsBanned(true);
                    setMessage({ type: 'error', text: 'You have been banned' });
                } else if (data.error?.includes('not found') || data.error?.includes('locked')) {
                    // Song was deleted or playlist was locked - refresh to sync
                    fetchPlaylist();
                }
            }
        } catch (error) {
            console.error('Vote failed:', error);
            // On network error, refresh to ensure sync
            fetchPlaylist();
        }
    };

    // Manual refresh
    const handleRefresh = () => {
        fetchPlaylist(true);
        fetchTimer();
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
    const isSessionActive = timerRunning && timerRemaining > 0;
    const canParticipate = !isBanned && !isLocked && !!username && isSessionActive;

    // Loading state
    if (isLoading || !visitorId) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto' }} />
                    <p style={{ marginTop: 16 }}>Loading...</p>
                </div>
            </div>
        );
    }

    // Username modal
    if (showUsernameModal) {
        return (
            <div className="modal-overlay">
                <div className="modal-card welcome-modal">
                    <img src="/logo.png" alt="Logo" className="welcome-logo" />
                    <h2>Welcome to the Hackathon!</h2>
                    <p>What should we call you?</p>
                    <input
                        type="text"
                        placeholder="Your name"
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSetUsername()}
                        autoFocus
                        maxLength={20}
                    />
                    <button onClick={handleSetUsername} disabled={!usernameInput.trim()}>
                        Let's Go! 🎵
                    </button>

                    <Link href="/admin" className="admin-link-modal">
                        ⚙️ Admin Panel
                    </Link>

                    <div className="rules-section">
                        <div className="rules-row">
                            <span title="Add up to 5 songs">🎵 5 songs</span>
                            <span title="5 upvotes, 5 downvotes">👍👎 10 votes</span>
                            <span title="Top 3 songs earn karma">🏆 Earn karma</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Export to Spotify - redirect to export page for OAuth flow
    const handleExport = () => {
        window.location.href = '/export';
    };

    return (
        <div className="stream-layout">
            {/* 🎉 CONFETTI CELEBRATION OVERLAY */}
            {showConfetti && (
                <div className="confetti-overlay">
                    <div className="confetti-message">{confettiMessage}</div>
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
                    <span className="brand-name">Hackathon</span>
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
                            {/* Songs remaining */}
                            <span className="stat-counter songs" title={`${userStatus.songsRemaining} songs left to add`}>
                                💿 {userStatus.songsRemaining}
                            </span>
                            {/* Upvotes remaining */}
                            <span className="stat-counter upvotes" title={`${userStatus.upvotesRemaining} upvotes left`}>
                                👍 {userStatus.upvotesRemaining}
                            </span>
                            {/* Downvotes remaining */}
                            <span className="stat-counter downvotes" title={`${userStatus.downvotesRemaining} downvotes left`}>
                                👎 {userStatus.downvotesRemaining}
                            </span>
                            {/* Karma - only show if > 0 */}
                            {karmaBonuses.karma > 0 && (
                                <span className="stat-counter karma" title="Your karma">
                                    ✨ {karmaBonuses.karma}
                                </span>
                            )}
                        </div>
                    )}
                    <span className="stat-pill capacity">
                        {playlistStats.current}/{playlistStats.max}
                    </span>
                    {username && (
                        <button
                            className="user-pill"
                            onClick={() => { setUsernameInput(username); setShowUsernameModal(true); }}
                            title="Click to edit your name or see rules"
                        >
                            🎧 {username} <span className="edit-hint">✏️</span>
                        </button>
                    )}
                </div>
            </header>

            {/* 🔔 ACTIVITY FEED - Below header, in content flow */}
            {toastQueue.length > 0 && (
                <div className="activity-ticker">
                    {toastQueue.slice(0, 2).map((activity: ActivityItem) => (
                        <span key={activity.id} className={`ticker-item ${activity.type}`}>
                            {activity.userName === 'System' ? activity.songName : (
                                <>
                                    {activity.type === 'add' && `🎵 ${activity.userName} added "${activity.songName}"`}
                                    {activity.type === 'upvote' && `👍 ${activity.userName} upvoted`}
                                    {activity.type === 'downvote' && `👎 ${activity.userName} downvoted`}
                                </>
                            )}
                        </span>
                    ))}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                VOTING CLOSED BANNER (when session not active)
               ═══════════════════════════════════════════════════════════ */}
            {
                !timerRunning && !isBanned && (
                    <div className="voting-closed-banner">
                        <div className="closed-message">
                            ⏳ <strong>Next session coming soon!</strong> Grab the playlist while you wait.
                        </div>
                        <div className="closed-actions">
                            <button onClick={handleExport} className="action-btn spotify-btn">
                                <img src="/spotify-logo.png" alt="Spotify" className="spotify-logo-icon" /> Export to Spotify
                            </button>
                        </div>
                    </div>
                )
            }

            {/* 🎵 PLAYLIST TITLE BAR - Always visible, below closed banner */}
            <div className="playlist-title-bar">
                <span className="playlist-title-text">🎵 {playlistTitle}</span>
            </div>

            {/* 🔥 CHAOS MODE BANNER - Delete window active */}
            {deleteWindow.active && (
                <div className="chaos-banner">
                    <div className="chaos-content">
                        <span className="chaos-icon">💣</span>
                        <span className="chaos-title">DELETE WINDOW OPEN!</span>
                        <span className="chaos-countdown">{Math.ceil(deleteWindowRemaining / 1000)}s</span>
                    </div>
                    <div className="chaos-message">
                        {deleteWindow.canDelete
                            ? '🗑️ You can DELETE one song! Tap the trash icon on any song.'
                            : '✓ You already used your delete this window.'}
                    </div>
                </div>
            )}

            {isBanned && <div className="banned-banner">🚫 You've been banned from this session</div>}

            {/* ═══════════════════════════════════════════════════════════
                SEARCH BAR - Only when session active
               ═══════════════════════════════════════════════════════════ */}
            {
                canParticipate && (userStatus.songsRemaining > 0 || karmaBonuses.bonusSongAdds > 0) && (
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
                                {searchResults.slice(0, 5).map((track) => (
                                    <div
                                        key={track.id}
                                        className="search-result-row"
                                        onMouseDown={() => !isSongInPlaylist(track.id) && handleAddSong(track)}
                                    >
                                        <img src={track.albumArt || '/placeholder.svg'} alt="" />
                                        <div className="result-info">
                                            <span className="result-name">{track.name}</span>
                                            <span className="result-artist">{track.artist}</span>
                                        </div>
                                        {isSongInPlaylist(track.id) ? (
                                            <span className="already-added">✓</span>
                                        ) : (
                                            <span className="add-btn-stream">+</span>
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
                        {timerRunning ? 'No songs yet! Be the first to add one.' : 'Waiting for next session to start...'}
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
                            >
                                {/* Rank */}
                                <span className={`rank-badge ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}>
                                    {index === 0 ? '👑' : `#${index + 1}`}
                                </span>

                                {/* Album Art - smaller */}
                                <img src={song.albumArt || '/placeholder.svg'} alt="" className="album-thumb" />

                                {/* Song Info - super compact */}
                                <div className="song-info-stream">
                                    <span className="song-title">{song.name}</span>
                                    <span className="song-artist">{song.artist} <span className="by-user">• {song.addedByName}{isMyComment && ' (you)'}</span></span>
                                </div>

                                {/* Voting - inline thumbs up/down with score */}
                                <div className="vote-inline">
                                    <button
                                        className={`thumb-btn up ${hasUpvoted ? 'active' : ''}`}
                                        onClick={() => handleVote(song.id, 1)}
                                        disabled={!canParticipate}
                                        title="Upvote"
                                    >
                                        👍
                                    </button>
                                    <span className={`vote-score ${song.score > 0 ? 'positive' : song.score < 0 ? 'negative' : ''}`}>
                                        {song.score > 0 ? '+' : ''}{song.score}
                                    </span>
                                    <button
                                        className={`thumb-btn down ${hasDownvoted ? 'active' : ''}`}
                                        onClick={() => handleVote(song.id, -1)}
                                        disabled={!canParticipate}
                                        title="Downvote"
                                    >
                                        👎
                                    </button>
                                </div>

                                {/* 🔥 CHAOS DELETE - Only visible during delete window */}
                                {deleteWindow.active && deleteWindow.canDelete && (
                                    <button
                                        className="chaos-delete-btn"
                                        onClick={() => handleWindowDelete(song.id)}
                                        disabled={isDeleting}
                                        title="DELETE this song!"
                                    >
                                        🗑️
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
