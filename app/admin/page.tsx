'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { APP_CONFIG, BROADCAST } from '@/lib/config';
import { persistGet, persistSet, persistRemove } from '@/lib/persist';
import TabsShowsDashboard from './TabsShowsDashboard';
import PrizeHQ from './PrizeHQ';
import DanceGame from './DanceGame';
import './admin.css';

interface Song {
    id: string;
    spotifyUri: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    addedBy: string;        // Visitor ID (fingerprint)
    addedByName: string;
    addedAt: number;
    upvotes?: string[];
    downvotes?: string[];
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

interface CrateCrackAdminStatus {
    active: boolean;
    roundId: string | null;
    gameType: 'request_evader' | 'crate_man' | 'missile_wedding' | 'bpm_sort';
    startedAt: number | null;
    endTime: number | null;
    remaining: number;
    durationSeconds: number;
    prompt: string;
    cards: { id: string; title: string; hint: string }[];
    defaultRewardLabel: string;
    rareRewardsArmed: boolean;
    attempts: number;
    completions: number;
    rareRewards: { type: string; label: string; armed: boolean }[];
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
type AdminTab = 'activity' | 'users' | 'playlist' | 'purge' | 'queue' | 'ones' | 'crateCrack' | 'dance' | 'prize' | 'tools' | 'shows';

interface HostGuideContent {
    title: string;
    viewerRules: string[];
    hostScript: string;
    howToRun: string[];
}

const purgeHostGuide: HostGuideContent = {
    title: 'The Purge Host Guide',
    viewerRules: [
        'The top 3 songs are safe.',
        'Everything under the top 3 can be deleted.',
        'Each person gets one delete.',
        'You have 60 seconds.',
        'If the host says stop, the round is over.',
    ],
    hostScript:
        'The Purge is open. Top 3 songs are safe. Everything under that line can get deleted. You get one shot. Pick carefully. When the clock hits zero, the crate is locked again.',
    howToRun: [
        'Press Start 60s Purge.',
        'Read the script out loud while the timer starts.',
        'Watch Live Deletions for names and songs.',
        'Use Hand Tablet To Volunteer only when someone on camera is choosing.',
        'Use Undo Last Purge only if something clearly went wrong.',
    ],
};

const queueHostGuide: HostGuideContent = {
    title: 'The Queue Host Guide',
    viewerRules: [
        'This is a 60-second review round.',
        'Only songs with zero votes get spotlighted.',
        'Zero votes does not mean bad. It means nobody checked it yet.',
        'Vote up if it belongs in the crate.',
        'Vote down if it needs to go.',
    ],
    hostScript:
        'The Queue is live. These are the songs nobody has touched yet. Not bad songs. Just unchecked songs. Give them ears now. Vote up if they belong. Vote down if they do not.',
    howToRun: [
        'Press Start 60s Queue.',
        'Call out that zero-vote songs are getting reviewed.',
        'Watch Current Queue Targets for what needs attention.',
        'Use Live Vote Feed to shout out people voting.',
        'Let the timer end or press End Early when the room is done.',
    ],
};

const onesHostGuide: HostGuideContent = {
    title: '1s and 0s Host Guide',
    viewerRules: [
        'A volunteer chooses between two artists.',
        'There are 3 rounds.',
        'Tap PLAY to hear a short clip.',
        'Pick the artist you would keep in the crate.',
        'The bomb can wipe one artist, but only once.',
    ],
    hostScript:
        'This is 1s and 0s. Two artists come up. The player hears the clips and picks who survives. Three rounds. One bomb. If the bomb gets used, that artist gets nuked from the crate.',
    howToRun: [
        'Press 1s and 0s.',
        'Type the volunteer name if you have it.',
        'Press Start Game.',
        'Tap PLAY for each artist clip.',
        'Tap the artist card to pick, or arm and fire the nuke when the player calls bomb.',
        'After round 3, press Show Damage Report.',
    ],
};

function HostGuide({ guide }: { guide: HostGuideContent }) {
    return (
        <section className="host-guide-card">
            <div className="host-guide-header">
                <span>Host Script</span>
                <h3>{guide.title}</h3>
            </div>
            <div className="host-guide-grid">
                <div className="host-guide-block viewer">
                    <h4>Rules For The Screen</h4>
                    <ul>
                        {guide.viewerRules.map(rule => (
                            <li key={rule}>{rule}</li>
                        ))}
                    </ul>
                </div>
                <div className="host-guide-block script">
                    <h4>Say This</h4>
                    <p>{guide.hostScript}</p>
                </div>
                <div className="host-guide-block run">
                    <h4>How To Run It</h4>
                    <ul>
                        {guide.howToRun.map(step => (
                            <li key={step}>{step}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}

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
    const [timerMode, setTimerMode] = useState<'preset' | 'custom'>('preset');
    const [customEndTime, setCustomEndTime] = useState(''); // HH:MM format
    const [customEndDate, setCustomEndDate] = useState(''); // YYYY-MM-DD format

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

    // 📡 DEMO NIGHT - Content-only mode (disables voting)
    const [demoNightEnabled, setDemoNightEnabled] = useState(false);
    const [demoNightHeadline, setDemoNightHeadline] = useState('Demo Night');
    const [demoNightDescription, setDemoNightDescription] = useState('');
    const [demoNightLinkUrl, setDemoNightLinkUrl] = useState('');
    const [demoNightLinkLabel, setDemoNightLinkLabel] = useState('Download');
    const [isSavingDemoNight, setIsSavingDemoNight] = useState(false);
    const demoNightLoaded = useRef(false);

    // Delete window (chaos mode) state
    const [isStartingDeleteWindow, setIsStartingDeleteWindow] = useState(false);
    const [deleteWindowActive, setDeleteWindowActive] = useState(false);
    const [deleteWindowEndTime, setDeleteWindowEndTime] = useState<number | null>(null);
    const [deleteWindowRemaining, setDeleteWindowRemaining] = useState(0);
    const [isStoppingDeleteWindow, setIsStoppingDeleteWindow] = useState(false);
    const [isUndoingPurge, setIsUndoingPurge] = useState(false);
    const [purgeVolunteerMode, setPurgeVolunteerMode] = useState(false);
    const [purgeDeletingSongId, setPurgeDeletingSongId] = useState<string | null>(null);
    interface PurgeDeletionEventLocal {
        id: string;
        songId: string;
        songName: string;
        artist: string;
        albumArt: string;
        deletedBy: string;
        deletedByName: string;
        source: 'purge';
        timestamp: number;
        restoredAt?: number;
        restoredBy?: string;
    }
    const [purgeDeletions, setPurgeDeletions] = useState<PurgeDeletionEventLocal[]>([]);
    const [purgeDeletedCount, setPurgeDeletedCount] = useState(0);

    // The Queue game state
    const [isStartingQueueWindow, setIsStartingQueueWindow] = useState(false);
    const [isStoppingQueueWindow, setIsStoppingQueueWindow] = useState(false);
    const [queueWindowActive, setQueueWindowActive] = useState(false);
    const [queueWindowEndTime, setQueueWindowEndTime] = useState<number | null>(null);
    const [queueWindowRemaining, setQueueWindowRemaining] = useState(0);

    // Crate Games side quest state
    const [crateCrackStatus, setCrateCrackStatus] = useState<CrateCrackAdminStatus>({
        active: false,
        roundId: null,
        gameType: 'request_evader',
        startedAt: null,
        endTime: null,
        remaining: 0,
        durationSeconds: 60,
        prompt: '',
        cards: [],
        defaultRewardLabel: '14 Free Days',
        rareRewardsArmed: false,
        attempts: 0,
        completions: 0,
        rareRewards: [],
    });
    const [isStartingCrateCrack, setIsStartingCrateCrack] = useState(false);
    const [isStoppingCrateCrack, setIsStoppingCrateCrack] = useState(false);
    const [crateCrackGameType, setCrateCrackGameType] = useState<'request_evader' | 'crate_man' | 'missile_wedding' | 'bpm_sort'>('request_evader');
    const [crateCrackDuration, setCrateCrackDuration] = useState(60);
    const [crateCrackRewardLabel, setCrateCrackRewardLabel] = useState('14 Free Days');
    const [crateCrackRewardUrl, setCrateCrackRewardUrl] = useState('https://www.cratehackers.com/14daytrial');
    const [armCrateAnnual, setArmCrateAnnual] = useState(false);
    const [armBangerAnnual, setArmBangerAnnual] = useState(false);
    const [armLifetime, setArmLifetime] = useState(false);
    const [crateAnnualCode, setCrateAnnualCode] = useState('CRATEYEAR');
    const [bangerAnnualCode, setBangerAnnualCode] = useState('BANGERYEAR');
    const [lifetimeCode, setLifetimeCode] = useState('LIFETIMECRATE');

    // Import playlist state
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [showImportPanel, setShowImportPanel] = useState(false);

    // Leads export state (download signup list as CSV, optionally by date range)
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');
    const [isExportingLeads, setIsExportingLeads] = useState(false);

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

    const applyPurgeStatus = (data: {
        active?: boolean;
        endTime?: number | null;
        remaining?: number;
        recentDeletions?: PurgeDeletionEventLocal[];
        deletedCount?: number;
    }) => {
        setDeleteWindowActive(!!data.active);
        setDeleteWindowEndTime(data.endTime ?? null);
        setDeleteWindowRemaining(data.remaining ?? 0);
        if (data.recentDeletions) setPurgeDeletions(data.recentDeletions);
        if (typeof data.deletedCount === 'number') setPurgeDeletedCount(data.deletedCount);
    };

    const applyQueueStatus = (data: {
        active?: boolean;
        endTime?: number | null;
        remaining?: number;
    }) => {
        setQueueWindowActive(!!data.active);
        setQueueWindowEndTime(data.endTime ?? null);
        setQueueWindowRemaining(data.remaining ?? 0);
    };

    const applyCrateCrackStatus = (data: Partial<CrateCrackAdminStatus>) => {
        setCrateCrackStatus(prev => ({
            ...prev,
            ...data,
            active: !!data.active,
            remaining: data.remaining ?? 0,
        }));
    };

    const fetchPurgeStatus = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res = await fetch('/api/admin/delete-window', {
                headers: {
                    'x-admin-key': adminPassword,
                    'x-admin-id': adminId,
                },
            });
            if (!res.ok) return;
            const data = await res.json();
            applyPurgeStatus(data);
        } catch (error) {
            console.error('Failed to fetch purge status:', error);
        }
    }, [isAuthenticated, adminPassword, adminId]);

    const fetchQueueStatus = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res = await fetch('/api/admin/queue-window', {
                headers: {
                    'x-admin-key': adminPassword,
                    'x-admin-id': adminId,
                },
            });
            if (!res.ok) return;
            const data = await res.json();
            applyQueueStatus(data);
        } catch (error) {
            console.error('Failed to fetch queue status:', error);
        }
    }, [isAuthenticated, adminPassword, adminId]);

    const fetchCrateCrackStatus = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res = await fetch('/api/admin/crate-crack', {
                headers: {
                    'x-admin-key': adminPassword,
                    'x-admin-id': adminId,
                },
            });
            if (!res.ok) return;
            const data = await res.json();
            applyCrateCrackStatus(data);
        } catch (error) {
            console.error('Failed to fetch Crate Games status:', error);
        }
    }, [isAuthenticated, adminPassword, adminId]);

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
            // Sync demo night config ONLY on initial load (prevents overwriting active edits)
            if (!demoNightLoaded.current) {
                demoNightLoaded.current = true;
                if (data.demoNight) {
                    setDemoNightEnabled(data.demoNight.enabled || false);
                    setDemoNightHeadline(data.demoNight.headline || 'Demo Night');
                    setDemoNightDescription(data.demoNight.description || '');
                    setDemoNightLinkUrl(data.demoNight.linkUrl || '');
                    setDemoNightLinkLabel(data.demoNight.linkLabel || 'Download');
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

    // Artist Versus state (admin-hosted game-show segment)
    interface ArtistVersusContestantLocal {
        name: string;
        albumArt: string;
        sampleSongName: string;
        songCount: number;
        previewUrl?: string | null;
    }
    interface ArtistVersusAudioCueLocal {
        cueId: string;
        side: 'A' | 'B';
        artistName: string;
        songName: string;
        previewUrl: string;
        startedAt: number;
        durationMs: number;
    }
    interface ArtistVersusRoundLocal {
        roundNumber: 1 | 2 | 3;
        artistA: ArtistVersusContestantLocal;
        artistB: ArtistVersusContestantLocal;
        outcome: 'pick' | 'bomb' | null;
        winner: 'A' | 'B' | null;
        nukedArtist: 'A' | 'B' | null;
        nukedSongIds?: string[];
        nukedArtistName?: string;
        completedAt?: number;
    }
    interface ArtistVersusStateLocal {
        active: boolean;
        phase: 'lobby' | 'round' | 'awaitingNext' | 'damageReport';
        currentRound: 0 | 1 | 2 | 3;
        rounds: ArtistVersusRoundLocal[];
        bombUsed: boolean;
        playerName: string | null;
        startedAt: number;
        audioCue: ArtistVersusAudioCueLocal | null;
    }
    const initialArtistVersus: ArtistVersusStateLocal = {
        active: false,
        phase: 'lobby',
        currentRound: 0,
        rounds: [],
        bombUsed: false,
        playerName: null,
        startedAt: 0,
        audioCue: null,
    };
    const [artistVersus, setArtistVersus] = useState<ArtistVersusStateLocal>(initialArtistVersus);
    const [showArtistVersusLobby, setShowArtistVersusLobby] = useState(false);
    const [artistVersusPlayerInput, setArtistVersusPlayerInput] = useState('');
    const [isArtistVersusBusy, setIsArtistVersusBusy] = useState(false);
    const [bombArmedSide, setBombArmedSide] = useState<'A' | 'B' | null>(null);  // Two-tap arm-and-fire
    const [previewingSide, setPreviewingSide] = useState<'A' | 'B' | null>(null);  // Which side's preview is currently playing
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const previewStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const PREVIEW_DURATION_MS = 7000;  // 7s — middle of the 5-10s ask
    // Per-round cache of resolved preview URLs. Populated eagerly when a round
    // starts (Spotify URL if available, else iTunes lookup). The click handler
    // reads from this cache so audio.play() can run synchronously and preserve
    // the browser's user-gesture permission (Safari/Chrome autoplay policy).
    // 'loading' = still resolving, null = no preview found anywhere.
    type PreviewCacheEntry = string | 'loading' | null;
    const [previewUrlCache, setPreviewUrlCache] = useState<{ A: PreviewCacheEntry; B: PreviewCacheEntry }>({ A: 'loading', B: 'loading' });

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
            fetchPurgeStatus();
            fetchQueueStatus();
            fetchCrateCrackStatus();
        }
    }, [isAuthenticated, fetchPlaylist, fetchTimer, fetchPurgeStatus, fetchQueueStatus, fetchCrateCrackStatus]);

    // REAL-TIME POLLING - refresh every 3 seconds
    useEffect(() => {
        if (!isAuthenticated) return;

        const interval = setInterval(() => {
            fetchPlaylist();
            fetchTimer();
        }, 3000);

        return () => clearInterval(interval);
    }, [isAuthenticated, fetchPlaylist, fetchTimer]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const interval = setInterval(fetchPurgeStatus, deleteWindowActive ? 1000 : 3000);
        return () => clearInterval(interval);
    }, [isAuthenticated, deleteWindowActive, fetchPurgeStatus]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const interval = setInterval(fetchQueueStatus, queueWindowActive ? 1000 : 3000);
        return () => clearInterval(interval);
    }, [isAuthenticated, queueWindowActive, fetchQueueStatus]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const interval = setInterval(fetchCrateCrackStatus, crateCrackStatus.active ? 1000 : 3000);
        return () => clearInterval(interval);
    }, [isAuthenticated, crateCrackStatus.active, fetchCrateCrackStatus]);

    useEffect(() => {
        if (!deleteWindowActive || !deleteWindowEndTime) {
            setDeleteWindowRemaining(0);
            return;
        }

        const tick = () => {
            const remaining = Math.max(0, deleteWindowEndTime - Date.now());
            setDeleteWindowRemaining(remaining);
            if (remaining <= 0) {
                setDeleteWindowActive(false);
                setDeleteWindowEndTime(null);
            }
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [deleteWindowActive, deleteWindowEndTime]);

    useEffect(() => {
        if (!queueWindowActive || !queueWindowEndTime) {
            setQueueWindowRemaining(0);
            return;
        }

        const tick = () => {
            const remaining = Math.max(0, queueWindowEndTime - Date.now());
            setQueueWindowRemaining(remaining);
            if (remaining <= 0) {
                setQueueWindowActive(false);
            }
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [queueWindowActive, queueWindowEndTime]);

    useEffect(() => {
        if (!crateCrackStatus.active || !crateCrackStatus.endTime) return;

        const tick = () => {
            const remaining = Math.max(0, crateCrackStatus.endTime! - Date.now());
            setCrateCrackStatus(prev => ({
                ...prev,
                remaining,
                active: remaining > 0,
            }));
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [crateCrackStatus.active, crateCrackStatus.endTime]);

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

    const getTotalVotes = useCallback((song: Song) => {
        const upvotes = Array.isArray(song.upvotes) ? song.upvotes.length : 0;
        const downvotes = Array.isArray(song.downvotes) ? song.downvotes.length : 0;
        return upvotes + downvotes;
    }, []);

    const queueTargets = useMemo(() => {
        if (songs.length === 0) return [];

        return songs
            .filter(song => getTotalVotes(song) === 0)
            .sort((a, b) => a.addedAt - b.addedAt);
    }, [getTotalVotes, songs]);

    const queueVoteActivity = useMemo(() => {
        return recentActivity
            .filter(activity => activity.type === 'upvote' || activity.type === 'downvote')
            .slice(0, 12);
    }, [recentActivity]);

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
    const calculateCustomDuration = (): { durationMs: number; label: string } | null => {
        if (!customEndTime) return null;
        const [hours, minutes] = customEndTime.split(':').map(Number);
        const now = new Date();
        let target: Date;

        if (customEndDate) {
            // Use the explicitly selected date
            const [year, month, day] = customEndDate.split('-').map(Number);
            target = new Date(year, month - 1, day, hours, minutes, 0, 0);
        } else {
            // No date selected — assume today, or tomorrow if past
            target = new Date();
            target.setHours(hours, minutes, 0, 0);
            if (target.getTime() <= now.getTime()) {
                target.setDate(target.getDate() + 1);
            }
        }

        const durationMs = target.getTime() - now.getTime();
        if (durationMs <= 0) {
            return null; // Target is in the past
        }

        const timeStr = target.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const isToday = target.toDateString() === now.toDateString();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const isTomorrow = target.toDateString() === tomorrow.toDateString();

        let dateLabel: string;
        if (isToday) {
            dateLabel = `today at ${timeStr}`;
        } else if (isTomorrow) {
            dateLabel = `tomorrow at ${timeStr}`;
        } else {
            const dayName = target.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            dateLabel = `${dayName} at ${timeStr}`;
        }
        return { durationMs, label: dateLabel };
    };

    const handleStartTimer = async () => {
        let durationMs: number;
        let durationText: string;

        if (timerMode === 'custom') {
            const calc = calculateCustomDuration();
            if (!calc) {
                setMessage({ type: 'error', text: 'Please enter a target end time.' });
                return;
            }
            durationMs = calc.durationMs;
            durationText = `Countdown ends at ${calc.label}`;
        } else {
            durationMs = selectedDuration * 60 * 1000;
            if (selectedDuration >= 1440) {
                const days = selectedDuration / 1440;
                durationText = `${days} day${days > 1 ? 's' : ''}`;
            } else if (selectedDuration >= 60) {
                const hours = selectedDuration / 60;
                durationText = `${hours} hour${hours > 1 ? 's' : ''}`;
            } else {
                durationText = `${selectedDuration} minutes`;
            }
        }

        setIsTimerAction(true);
        try {
            const res = await adminFetch('/api/timer', {
                method: 'POST',
                body: JSON.stringify({ action: 'start', duration: durationMs }),
            });
            const data = await res.json();
            if (res.ok) {
                setTimerRunning(data.running);
                setTimerEndTime(data.endTime);
                setMessage({ type: 'success', text: `✓ Session started! ${durationText}` });
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
                // Use BOTH sessionStorage (tab-scoped) and localStorage (persistent across tabs/sessions)
                try { sessionStorage.setItem('crate-admin-key', adminPassword); } catch (e) { }
                try { localStorage.setItem('crate-admin-key', adminPassword); } catch (e) { }
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

    // Save Demo Night config
    const handleSaveDemoNight = async (enabledOverride?: boolean) => {
        const isEnabled = enabledOverride !== undefined ? enabledOverride : demoNightEnabled;
        setIsSavingDemoNight(true);
        try {
            const res = await adminFetch('/api/playlist', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'setDemoNight',
                    demoNightEnabled: isEnabled,
                    demoNightHeadline: demoNightHeadline.trim() || 'Demo Night',
                    demoNightDescription: demoNightDescription.trim(),
                    demoNightLinkUrl: demoNightLinkUrl.trim(),
                    demoNightLinkLabel: demoNightLinkLabel.trim() || 'Download',
                }),
            });
            if (res.ok) {
                setMessage({
                    type: 'success',
                    text: isEnabled ? '📡 Demo Night is LIVE! Voting disabled.' : '📡 Demo Night OFF — voting restored.'
                });
            } else {
                setMessage({ type: 'error', text: 'Failed to save Demo Night config' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save Demo Night config' });
        } finally {
            setIsSavingDemoNight(false);
        }
    };

    // Legacy compat: save just YouTube
    const handleSaveYouTube = async () => {
        setStreamPlatform('youtube');
        markStreamEditing(); // Mark as editing when platform is changed
        handleSaveStream('youtube');
    };

    // Download the signup list as CSV. With no dates it grabs everyone; with a
    // from/to it filters by signup date. Uses adminFetch so the admin key rides along,
    // then turns the response into a file download.
    const handleExportLeads = async () => {
        if (exportFrom && exportTo && exportFrom > exportTo) {
            setMessage({ type: 'error', text: 'Start date must be before end date.' });
            return;
        }

        setIsExportingLeads(true);
        try {
            const qs = new URLSearchParams({ format: 'csv' });
            if (exportFrom) qs.set('from', exportFrom);
            if (exportTo) qs.set('to', exportTo);

            const res = await adminFetch(`/api/admin/leads?${qs.toString()}`);
            if (!res.ok) {
                setMessage({ type: 'error', text: 'Export failed — check your admin access.' });
                return;
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const rangeTag = exportFrom || exportTo ? `-${exportFrom || 'start'}_to_${exportTo || 'now'}` : '';
            a.download = `crate-leads${rangeTag}-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setMessage({ type: 'success', text: '✓ Leads CSV downloaded' });
        } catch (err) {
            setMessage({ type: 'error', text: 'Export failed — network error.' });
        } finally {
            setIsExportingLeads(false);
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
                        applyPurgeStatus(data);
                        setMessage({ type: 'success', text: '💀 THE PURGE HAS BEGUN! Everyone has 60 seconds to purge ONE song!' });
                        setActiveTab('purge');
                        fetchPlaylist();
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

    const handleStopDeleteWindow = async () => {
        setIsStoppingDeleteWindow(true);
        try {
            const res = await adminFetch('/api/admin/delete-window', {
                method: 'POST',
                body: JSON.stringify({ action: 'stop' }),
            });
            const data = await res.json();
            if (res.ok) {
                applyPurgeStatus(data);
                setMessage({ type: 'success', text: 'The Purge has been stopped.' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to stop The Purge' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to stop The Purge - network error' });
        } finally {
            setIsStoppingDeleteWindow(false);
        }
    };

    const handleStartQueueWindow = () => {
        showConfirmModal(
            'START THE QUEUE?',
            'This starts a 60-second zero-vote review. The public screen will gray out everything except songs with no votes.',
            async () => {
                setIsStartingQueueWindow(true);
                try {
                    const res = await adminFetch('/api/admin/queue-window', {
                        method: 'POST',
                        body: JSON.stringify({ duration: 60 }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                        applyQueueStatus(data);
                        setMessage({ type: 'success', text: '📡 THE QUEUE IS LIVE! Members have 60 seconds to inspect every zero-vote song.' });
                        setActiveTab('queue');
                        fetchPlaylist();
                    } else {
                        setMessage({ type: 'error', text: data.error || 'Failed to start The Queue' });
                    }
                } catch (error) {
                    setMessage({ type: 'error', text: 'Failed to start The Queue - network error' });
                } finally {
                    setIsStartingQueueWindow(false);
                }
            },
            'Start The Queue'
        );
    };

    const handleStopQueueWindow = async () => {
        setIsStoppingQueueWindow(true);
        try {
            const res = await adminFetch('/api/admin/queue-window', {
                method: 'POST',
                body: JSON.stringify({ action: 'stop' }),
            });
            const data = await res.json();
            if (res.ok) {
                applyQueueStatus(data);
                setMessage({ type: 'success', text: 'The Queue has been stopped.' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to stop The Queue' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to stop The Queue - network error' });
        } finally {
            setIsStoppingQueueWindow(false);
        }
    };

    const handleStartCrateCrack = () => {
        const armedRewards = [armCrateAnnual, armBangerAnnual, armLifetime].filter(Boolean).length;
        showConfirmModal(
            'START CRATE GAMES?',
            `This launches a ${crateCrackDuration}-second full-screen side quest for everyone on the public page.\n\nDefault reward: ${crateCrackRewardLabel}\nRare rewards armed: ${armedRewards}`,
            async () => {
                setIsStartingCrateCrack(true);
                try {
                    const res = await adminFetch('/api/admin/crate-crack', {
                        method: 'POST',
                        body: JSON.stringify({
                            durationSeconds: crateCrackDuration,
                            gameType: crateCrackGameType,
                            defaultRewardLabel: crateCrackRewardLabel,
                            defaultRewardUrl: crateCrackRewardUrl,
                            armCrateAnnual,
                            armBangerAnnual,
                            armLifetime,
                            crateAnnualCode,
                            bangerAnnualCode,
                            lifetimeCode,
                        }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                        applyCrateCrackStatus(data);
                        setMessage({ type: 'success', text: 'Crate Games is live. Players have 60 seconds to win the promo.' });
                        setActiveTab('crateCrack');
                    } else {
                        setMessage({ type: 'error', text: data.error || 'Failed to start Crate Games' });
                    }
                } catch (error) {
                    setMessage({ type: 'error', text: 'Failed to start Crate Games - network error' });
                } finally {
                    setIsStartingCrateCrack(false);
                }
            },
            'Start Crate Games'
        );
    };

    const handleStopCrateCrack = async () => {
        setIsStoppingCrateCrack(true);
        try {
            const res = await adminFetch('/api/admin/crate-crack', {
                method: 'POST',
                body: JSON.stringify({ action: 'stop' }),
            });
            const data = await res.json();
            if (res.ok) {
                applyCrateCrackStatus(data);
                setMessage({ type: 'success', text: 'Crate Games has been stopped.' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to stop Crate Games' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to stop Crate Games - network error' });
        } finally {
            setIsStoppingCrateCrack(false);
        }
    };

    const handleUndoLastPurge = async () => {
        setIsUndoingPurge(true);
        try {
            const res = await adminFetch('/api/admin/delete-window', {
                method: 'POST',
                body: JSON.stringify({ action: 'undo' }),
            });
            const data = await res.json();
            if (res.ok) {
                applyPurgeStatus(data);
                setMessage({ type: 'success', text: `Restored "${data.restored?.songName || 'last purged song'}".` });
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: data.error || 'Nothing to undo' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to undo purge - network error' });
        } finally {
            setIsUndoingPurge(false);
        }
    };

    const handleVolunteerPurgeDelete = async (song: Song) => {
        if (!deleteWindowActive || purgeDeletingSongId) return;
        setPurgeDeletingSongId(song.id);
        try {
            const res = await adminFetch('/api/admin/delete-window', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'delete',
                    songId: song.id,
                    deletedByName: 'Volunteer',
                }),
            });
            const data = await res.json();
            if (res.ok) {
                applyPurgeStatus(data);
                setMessage({ type: 'success', text: `Purged "${song.name}".` });
                fetchPlaylist();
            } else {
                setMessage({ type: 'error', text: data.error || 'Could not purge song' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to purge song - network error' });
        } finally {
            setPurgeDeletingSongId(null);
        }
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
                const data = await res.json();
                applyPurgeStatus(data);
                setMessage({ type: 'success', text: '💀 AUTO-PILOT: THE PURGE HAS BEGUN!' });
                setActiveTab('purge');
                fetchPlaylist();
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

    // ============ ARTIST VERSUS HANDLERS ============

    const fetchArtistVersus = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const res = await adminFetch('/api/admin/artist-versus');
            if (!res.ok) return;
            const data = await res.json();
            setArtistVersus(data);
        } catch (error) {
            console.error('Failed to fetch artist versus:', error);
        }
    }, [isAuthenticated, adminPassword, adminId]);

    // Poll artist versus state every 1s when authenticated
    useEffect(() => {
        if (!isAuthenticated) return;
        fetchArtistVersus();
        const interval = setInterval(fetchArtistVersus, 1000);
        return () => clearInterval(interval);
    }, [isAuthenticated, fetchArtistVersus]);

    // Reset bomb-armed state when round changes
    useEffect(() => {
        setBombArmedSide(null);
    }, [artistVersus.currentRound, artistVersus.phase]);

    // ============ ARTIST VERSUS PREVIEW PLAYER ============
    // Stops the currently playing preview (if any) and clears the auto-stop timer.
    const stopArtistVersusPreview = useCallback(() => {
        if (previewStopTimeoutRef.current) {
            clearTimeout(previewStopTimeoutRef.current);
            previewStopTimeoutRef.current = null;
        }
        if (previewAudioRef.current) {
            try {
                previewAudioRef.current.pause();
                previewAudioRef.current.src = '';
            } catch (e) { /* ignore */ }
            previewAudioRef.current = null;
        }
        setPreviewingSide(null);
    }, []);

    // Eagerly resolve a working preview URL for both contestants when the
    // round starts. Tries Spotify first (no API call), then falls back to
    // iTunes lookup. Caches the result so the click handler can play
    // synchronously (critical for browser autoplay policies — Safari/Chrome
    // require audio.play() in the same task as the user click).
    //
    // Track which round we've already prefetched so the polling cycle (which
    // refreshes artistVersus state every 1s with a new rounds[] reference)
    // doesn't re-trigger the prefetch and reset the cache mid-tap.
    const prefetchedRoundRef = useRef<number>(0);
    useEffect(() => {
        if (!artistVersus.active || artistVersus.phase !== 'round') {
            prefetchedRoundRef.current = 0;
            return;
        }
        if (prefetchedRoundRef.current === artistVersus.currentRound) return;

        const round = artistVersus.rounds[artistVersus.currentRound - 1];
        if (!round) return;

        prefetchedRoundRef.current = artistVersus.currentRound;
        let cancelled = false;
        setPreviewUrlCache({ A: 'loading', B: 'loading' });

        const resolvePreview = async (
            contestant: ArtistVersusContestantLocal
        ): Promise<string | null> => {
            if (contestant.previewUrl) return contestant.previewUrl;
            try {
                const res = await fetch('/api/preview-lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        artist: contestant.name,
                        songName: contestant.sampleSongName,
                    }),
                });
                if (!res.ok) return null;
                const data = await res.json();
                return data.previewUrl || null;
            } catch (e) {
                console.warn('Preview lookup failed for', contestant.name, e);
                return null;
            }
        };

        resolvePreview(round.artistA).then(url => {
            if (!cancelled) setPreviewUrlCache(prev => ({ ...prev, A: url }));
        });
        resolvePreview(round.artistB).then(url => {
            if (!cancelled) setPreviewUrlCache(prev => ({ ...prev, B: url }));
        });

        return () => { cancelled = true; };
    }, [artistVersus.active, artistVersus.phase, artistVersus.currentRound, artistVersus.rounds]);

    // Click handler — fully SYNCHRONOUS up through audio.play() so the
    // browser keeps the user-gesture permission and doesn't block playback.
    const handleArtistVersusPreview = useCallback((side: 'A' | 'B') => {
        if (previewingSide === side) {
            stopArtistVersusPreview();
            artistVersusAction({ action: 'stopPreview' });
            return;
        }
        stopArtistVersusPreview();

        const cached = previewUrlCache[side];
        if (cached === 'loading') {
            setMessage({ type: 'error', text: 'Preview still loading — tap again in a sec.' });
            return;
        }
        if (!cached) {
            setMessage({ type: 'error', text: 'No preview available for this artist.' });
            return;
        }

        try {
            const audio = new Audio(cached);
            audio.volume = 0.85;
            previewAudioRef.current = audio;
            setPreviewingSide(side);
            artistVersusAction({ action: 'preview', side, durationMs: PREVIEW_DURATION_MS });
            audio.play().catch(err => {
                console.warn('Preview playback rejected:', err);
                stopArtistVersusPreview();
                artistVersusAction({ action: 'stopPreview' });
                setMessage({ type: 'error', text: 'Browser blocked playback. Try again.' });
            });
            previewStopTimeoutRef.current = setTimeout(() => {
                stopArtistVersusPreview();
            }, PREVIEW_DURATION_MS);
            audio.addEventListener('ended', stopArtistVersusPreview);
        } catch (e) {
            console.warn('Preview init failed:', e);
            stopArtistVersusPreview();
        }
    }, [previewingSide, stopArtistVersusPreview, previewUrlCache]);

    // Auto-stop preview when the round changes, phase changes, or the panel cancels
    useEffect(() => {
        stopArtistVersusPreview();
    }, [artistVersus.currentRound, artistVersus.phase, artistVersus.active, stopArtistVersusPreview]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopArtistVersusPreview();
    }, [stopArtistVersusPreview]);

    const artistVersusAction = async (
        body: Record<string, unknown>,
        successMsg?: string
    ): Promise<boolean> => {
        setIsArtistVersusBusy(true);
        try {
            const res = await adminFetch('/api/admin/artist-versus', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || '1s and 0s action failed' });
                return false;
            }
            if (data.state) setArtistVersus(data.state);
            if (successMsg) setMessage({ type: 'success', text: successMsg });
            return true;
        } catch (error) {
            setMessage({ type: 'error', text: '1s and 0s action failed - network error' });
            return false;
        } finally {
            setIsArtistVersusBusy(false);
        }
    };

    const handleStartArtistVersus = async () => {
        const playerName = artistVersusPlayerInput.trim();
        const ok = await artistVersusAction(
            { action: 'start', playerName: playerName || undefined },
            playerName ? `🎲 ${playerName} is up!` : '🎲 1s and 0s started!'
        );
        if (ok) {
            setShowArtistVersusLobby(false);
            setArtistVersusPlayerInput('');
        }
    };

    const handleArtistVersusPick = async (choice: 'A' | 'B') => {
        if (isArtistVersusBusy || artistVersus.phase !== 'round') return;
        const round = artistVersus.rounds[artistVersus.currentRound - 1];
        if (!round) return;
        const winnerName = choice === 'A' ? round.artistA.name : round.artistB.name;
        await artistVersusAction(
            { action: 'pick', choice },
            `Pick: ${winnerName}`
        );
    };

    const handleArtistVersusBombArm = (side: 'A' | 'B') => {
        if (isArtistVersusBusy || artistVersus.bombUsed || artistVersus.phase !== 'round') return;
        setBombArmedSide(side);
    };

    const handleArtistVersusBombFire = async (side: 'A' | 'B') => {
        if (isArtistVersusBusy || artistVersus.bombUsed || artistVersus.phase !== 'round') return;
        if (bombArmedSide !== side) return;
        const round = artistVersus.rounds[artistVersus.currentRound - 1];
        if (!round) return;
        const targetName = side === 'A' ? round.artistA.name : round.artistB.name;
        const ok = await artistVersusAction(
            { action: 'bomb', target: side },
            `BOOM. ${targetName} nuked.`
        );
        if (ok) {
            setBombArmedSide(null);
            // Refresh playlist since songs were just deleted
            fetchPlaylist();
        }
    };

    const handleArtistVersusNext = async () => {
        await artistVersusAction({ action: 'next' });
    };

    const handleArtistVersusEnd = async () => {
        await artistVersusAction({ action: 'end' }, 'Damage report shown.');
    };

    const handleArtistVersusCancel = async () => {
        const confirmed = window.confirm('Cancel 1s and 0s? Note: Cancelling does NOT un-nuke any bombed artists.');
        if (!confirmed) return;
        const ok = await artistVersusAction({ action: 'cancel' }, '1s and 0s cancelled.');
        if (ok) {
            setArtistVersus(initialArtistVersus);
            setBombArmedSide(null);
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
                        <button
                            className={`timer-mode-toggle ${timerMode === 'custom' ? 'active' : ''}`}
                            onClick={() => setTimerMode(timerMode === 'preset' ? 'custom' : 'preset')}
                            disabled={timerRunning}
                            title={timerMode === 'preset' ? 'Switch to end time' : 'Switch to presets'}
                        >
                            {timerMode === 'preset' ? '🕒' : '⏱️'}
                        </button>
                        {timerMode === 'preset' ? (
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
                        ) : (
                            <div className="custom-time-inline-label">
                                {customEndDate && customEndTime ? (() => {
                                    const calc = calculateCustomDuration();
                                    return calc ? (
                                        <span className="end-time-hint">📅 {calc.label}</span>
                                    ) : (
                                        <span className="end-time-hint end-time-error">⚠ Past date</span>
                                    );
                                })() : (
                                    <span className="end-time-hint" style={{ opacity: 0.5 }}>Set date & time ↓</span>
                                )}
                            </div>
                        )}
                        {!timerRunning ? (
                            <button className="timer-btn start" onClick={handleStartTimer} disabled={isTimerAction || (timerMode === 'custom' && !customEndTime) || (timerMode === 'custom' && !!customEndTime && !calculateCustomDuration())}>
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

            {/* 📅 SCHEDULE SESSION PANEL — drops down when custom timer mode is active */}
            {timerMode === 'custom' && !timerRunning && (
                <div className="schedule-panel">
                    <div className="schedule-panel-header">
                        <span className="schedule-panel-title">📅 Schedule Session End</span>
                        <span className="schedule-panel-subtitle">Pick a date & time — today, next week, or next month</span>
                    </div>

                    {/* Quick date shortcuts */}
                    <div className="schedule-shortcuts">
                        {(() => {
                            const today = new Date();
                            const shortcuts: { label: string; date: Date }[] = [];

                            // Today
                            shortcuts.push({ label: 'Today', date: new Date(today) });

                            // Tomorrow
                            const tmrw = new Date(today);
                            tmrw.setDate(tmrw.getDate() + 1);
                            shortcuts.push({ label: 'Tomorrow', date: tmrw });

                            // Next 5 weekdays from day-after-tomorrow
                            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                            for (let i = 2; i <= 6; i++) {
                                const d = new Date(today);
                                d.setDate(d.getDate() + i);
                                shortcuts.push({ label: dayNames[d.getDay()], date: d });
                            }

                            // Next week (same day)
                            const nextWeek = new Date(today);
                            nextWeek.setDate(nextWeek.getDate() + 7);
                            shortcuts.push({ label: 'Next Week', date: nextWeek });

                            // Next month (same day)
                            const nextMonth = new Date(today);
                            nextMonth.setMonth(nextMonth.getMonth() + 1);
                            shortcuts.push({ label: 'Next Month', date: nextMonth });

                            return shortcuts.map((s, i) => {
                                const dateStr = s.date.toISOString().split('T')[0];
                                const isActive = customEndDate === dateStr;
                                return (
                                    <button
                                        key={i}
                                        className={`schedule-shortcut-btn ${isActive ? 'active' : ''}`}
                                        onClick={() => {
                                            setCustomEndDate(dateStr);
                                            if (!customEndTime) setCustomEndTime('20:00');
                                        }}
                                    >
                                        {s.label}
                                        <span className="shortcut-date-sub">
                                            {s.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                    </button>
                                );
                            });
                        })()}
                    </div>

                    {/* Date + Time pickers */}
                    <div className="schedule-pickers">
                        <div className="schedule-picker-group">
                            <label className="schedule-label">📆 Date</label>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="schedule-date-input"
                                min={new Date().toISOString().split('T')[0]}
                            />
                        </div>
                        <div className="schedule-picker-group">
                            <label className="schedule-label">🕐 Time</label>
                            <input
                                type="time"
                                value={customEndTime}
                                onChange={(e) => setCustomEndTime(e.target.value)}
                                className="schedule-time-input"
                            />
                        </div>
                    </div>

                    {/* Live preview */}
                    {customEndDate && customEndTime && (() => {
                        const calc = calculateCustomDuration();
                        if (!calc) return (
                            <div className="schedule-preview error">
                                ⚠️ That date/time is in the past. Pick a future time.
                            </div>
                        );

                        // Calculate human-readable duration
                        const totalMins = Math.round(calc.durationMs / 60000);
                        const days = Math.floor(totalMins / 1440);
                        const hrs = Math.floor((totalMins % 1440) / 60);
                        const mins = totalMins % 60;
                        let durationStr = '';
                        if (days > 0) durationStr += `${days}d `;
                        if (hrs > 0) durationStr += `${hrs}h `;
                        if (mins > 0) durationStr += `${mins}m`;
                        if (!durationStr) durationStr = '< 1m';

                        return (
                            <div className="schedule-preview">
                                <span className="schedule-preview-main">
                                    Session ends <strong>{calc.label}</strong>
                                </span>
                                <span className="schedule-preview-duration">
                                    ⏱ {durationStr.trim()} from now
                                </span>
                            </div>
                        );
                    })()}
                </div>
            )}

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
                    className={`admin-tab ${activeTab === 'purge' ? 'active' : ''}`}
                    onClick={() => setActiveTab('purge')}
                >
                    <span className="tab-icon">💀</span>
                    <span className="tab-label">Purge</span>
                    {(deleteWindowActive || purgeDeletedCount > 0) && (
                        <span className="tab-badge">{deleteWindowActive ? Math.ceil(deleteWindowRemaining / 1000) : purgeDeletedCount}</span>
                    )}
                </button>
                <button
                    className={`admin-tab ${activeTab === 'queue' ? 'active' : ''}`}
                    onClick={() => setActiveTab('queue')}
                >
                    <span className="tab-icon">📡</span>
                    <span className="tab-label">Queue</span>
                    {(queueWindowActive || queueTargets.length > 0) && (
                        <span className="tab-badge">{queueWindowActive ? Math.ceil(queueWindowRemaining / 1000) : queueTargets.length}</span>
                    )}
                </button>
                <button
                    className={`admin-tab ${activeTab === 'ones' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ones')}
                >
                    <span className="tab-icon">🎲</span>
                    <span className="tab-label">1s and 0s</span>
                    {artistVersus.active && <span className="tab-badge">LIVE</span>}
                </button>
                <button
                    className={`admin-tab ${activeTab === 'crateCrack' ? 'active' : ''}`}
                    onClick={() => setActiveTab('crateCrack')}
                >
                    <span className="tab-icon">🎮</span>
                    <span className="tab-label">Crate Games</span>
                    {crateCrackStatus.active && <span className="tab-badge">LIVE</span>}
                </button>
                <button
                    className={`admin-tab ${activeTab === 'dance' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dance')}
                >
                    <span className="tab-icon">💃</span>
                    <span className="tab-label">Dance</span>
                </button>
                <button
                    className={`admin-tab ${activeTab === 'prize' ? 'active' : ''}`}
                    onClick={() => setActiveTab('prize')}
                >
                    <span className="tab-icon">🎰</span>
                    <span className="tab-label">Prize</span>
                </button>
                <button
                    className={`admin-tab ${activeTab === 'tools' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tools')}
                >
                    <span className="tab-icon">⚙️</span>
                    <span className="tab-label">Tools</span>
                </button>
                <button
                    className={`admin-tab ${activeTab === 'shows' ? 'active' : ''}`}
                    onClick={() => setActiveTab('shows')}
                >
                    <span className="tab-icon">🗂️</span>
                    <span className="tab-label">Shows</span>
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

                {/* PURGE TAB */}
                {activeTab === 'purge' && (
                    <div className="tab-panel purge-panel">
                        <HostGuide guide={purgeHostGuide} />
                        <div className={`purge-command-center ${deleteWindowActive ? 'active' : ''} ${purgeVolunteerMode ? 'volunteer-mode' : ''}`}>
                            <div className="purge-command-header">
                                <div>
                                    <div className="purge-command-kicker">GAME SHOW MODE</div>
                                    <h2>{deleteWindowActive ? 'The Purge Is Live' : 'The Purge Command Center'}</h2>
                                    <p>
                                        {purgeVolunteerMode
                                            ? 'Volunteer handoff is active. This screen only allows purge deletes.'
                                            : 'Host view for narrating the chaos, tracking kills, and keeping master control.'}
                                    </p>
                                </div>
                                <div className={`purge-command-timer ${deleteWindowRemaining < 10000 && deleteWindowActive ? 'urgent' : ''}`}>
                                    <span>{deleteWindowActive ? formatTime(deleteWindowRemaining) : 'READY'}</span>
                                    <small>{deleteWindowActive ? 'remaining' : 'standby'}</small>
                                </div>
                            </div>

                            {!purgeVolunteerMode && (
                                <>
                                    <div className="purge-command-actions">
                                        <button
                                            className="purge-master-btn start"
                                            onClick={handleStartDeleteWindow}
                                            disabled={isStartingDeleteWindow || deleteWindowActive || songs.length === 0}
                                        >
                                            {isStartingDeleteWindow ? 'Starting...' : 'Start 60s Purge'}
                                        </button>
                                        <button
                                            className="purge-master-btn stop"
                                            onClick={handleStopDeleteWindow}
                                            disabled={isStoppingDeleteWindow || !deleteWindowActive}
                                        >
                                            {isStoppingDeleteWindow ? 'Stopping...' : 'End Early'}
                                        </button>
                                        <button
                                            className="purge-master-btn undo"
                                            onClick={handleUndoLastPurge}
                                            disabled={isUndoingPurge || purgeDeletions.every(item => item.restoredAt)}
                                        >
                                            {isUndoingPurge ? 'Restoring...' : 'Undo Last Purge'}
                                        </button>
                                        <button
                                            className="purge-master-btn volunteer"
                                            onClick={() => setPurgeVolunteerMode(true)}
                                            disabled={!deleteWindowActive}
                                        >
                                            Hand Tablet To Volunteer
                                        </button>
                                    </div>

                                    <div className="purge-command-stats">
                                        <div>
                                            <strong>{purgeDeletedCount}</strong>
                                            <span>songs purged</span>
                                        </div>
                                        <div>
                                            <strong>{songs.length}</strong>
                                            <span>songs remain</span>
                                        </div>
                                        <div>
                                            <strong>{Math.max(0, songs.length - 3)}</strong>
                                            <span>eligible targets</span>
                                        </div>
                                    </div>

                                    <div className="purge-narration-card">
                                        <strong>Host read:</strong>
                                        <span>
                                            {deleteWindowActive
                                                ? `The Purge is live. Top 3 songs are protected. Everything below them is on the chopping block for ${Math.ceil(deleteWindowRemaining / 1000)} more seconds.`
                                                : 'When you start The Purge, the public page lights up and eligible users get one shot to delete a song.'}
                                        </span>
                                    </div>
                                </>
                            )}

                            {purgeVolunteerMode && (
                                <div className="purge-volunteer-shell">
                                    <div className="purge-volunteer-topbar">
                                        <button className="purge-exit-volunteer" onClick={() => setPurgeVolunteerMode(false)}>
                                            Return To Host Controls
                                        </button>
                                        <div className="purge-volunteer-warning">
                                            Delete-only mode. Top 3 are locked.
                                        </div>
                                    </div>
                                    {!deleteWindowActive ? (
                                        <div className="purge-volunteer-empty">The Purge is not active. Hand control back to the host.</div>
                                    ) : (
                                        <div className="purge-volunteer-grid">
                                            {songs.map((song, index) => {
                                                const battleLocked = !!(versusBattle.active && (versusBattle.songA?.id === song.id || versusBattle.songB?.id === song.id));
                                                const protectedSong = index < 3;
                                                const disabled = protectedSong || battleLocked || purgeDeletingSongId === song.id;
                                                return (
                                                    <div key={song.id} className={`purge-target-card ${protectedSong ? 'protected' : ''} ${battleLocked ? 'battle-locked' : ''}`}>
                                                        <img src={song.albumArt || '/placeholder.svg'} alt="" />
                                                        <div className="purge-target-info">
                                                            <span className="purge-target-rank">#{index + 1}</span>
                                                            <strong>{song.name}</strong>
                                                            <span>{song.artist}</span>
                                                            <small>Score {song.score > 0 ? '+' : ''}{song.score}</small>
                                                        </div>
                                                        <button
                                                            className="purge-target-delete"
                                                            onClick={() => handleVolunteerPurgeDelete(song)}
                                                            disabled={disabled}
                                                        >
                                                            {purgeDeletingSongId === song.id
                                                                ? 'Purging...'
                                                                : protectedSong
                                                                    ? 'Top 3 Locked'
                                                                    : battleLocked
                                                                        ? 'Battle Locked'
                                                                        : 'Purge This Song'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!purgeVolunteerMode && (
                                <div className="purge-feed-card">
                                    <div className="purge-feed-header">
                                        <h3>Live Deletions</h3>
                                        <span>{purgeDeletions.length} recent</span>
                                    </div>
                                    {purgeDeletions.length === 0 ? (
                                        <div className="purge-feed-empty">No purges yet. Start the round and watch the feed light up.</div>
                                    ) : (
                                        <div className="purge-feed-list">
                                            {purgeDeletions.slice(0, 12).map(event => {
                                                const timeStr = new Date(event.timestamp).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                    hour12: true,
                                                    timeZone: 'America/Chicago'
                                                });
                                                return (
                                                    <div key={event.id} className={`purge-feed-row ${event.restoredAt ? 'restored' : ''}`}>
                                                        <img src={event.albumArt || '/placeholder.svg'} alt="" />
                                                        <div>
                                                            <strong>{event.songName}</strong>
                                                            <span>{event.artist}</span>
                                                            <small>{event.restoredAt ? 'Restored by host' : `Purged by ${event.deletedByName}`} at {timeStr}</small>
                                                        </div>
                                                        <span className="purge-feed-status">{event.restoredAt ? 'RESTORED' : 'PURGED'}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* QUEUE TAB */}
                {activeTab === 'queue' && (
                    <div className="tab-panel queue-panel">
                        <HostGuide guide={queueHostGuide} />
                        <div className={`queue-command-center ${queueWindowActive ? 'active' : ''}`}>
                            <div className="purge-command-header queue-command-header">
                                <div>
                                    <div className="purge-command-kicker queue-command-kicker">GAME SHOW MODE</div>
                                    <h2>{queueWindowActive ? 'The Queue Is Live' : 'The Queue Command Center'}</h2>
                                    <p>
                                        Host-triggered zero-vote review. For 60 seconds, the public screen grays out the crate and lights up every song with no votes.
                                    </p>
                                </div>
                                <div className={`purge-command-timer queue-command-timer ${queueWindowRemaining < 10000 && queueWindowActive ? 'urgent' : ''}`}>
                                    <span>{queueWindowActive ? formatTime(queueWindowRemaining) : 'READY'}</span>
                                    <small>{queueWindowActive ? 'remaining' : 'standby'}</small>
                                </div>
                            </div>

                            <div className="purge-command-actions queue-command-actions">
                                <button
                                    className="purge-master-btn queue-start"
                                    onClick={handleStartQueueWindow}
                                    disabled={isStartingQueueWindow || queueWindowActive || queueTargets.length === 0}
                                >
                                    {isStartingQueueWindow ? 'Starting...' : 'Start 60s Queue'}
                                </button>
                                <button
                                    className="purge-master-btn queue-stop"
                                    onClick={handleStopQueueWindow}
                                    disabled={isStoppingQueueWindow || !queueWindowActive}
                                >
                                    {isStoppingQueueWindow ? 'Stopping...' : 'End Early'}
                                </button>
                            </div>

                            <div className="purge-command-stats queue-command-stats">
                                <div>
                                    <strong>{queueTargets.length}</strong>
                                    <span>zero-vote songs</span>
                                </div>
                                <div>
                                    <strong>{songs.reduce((sum, song) => sum + getTotalVotes(song), 0)}</strong>
                                    <span>votes logged</span>
                                </div>
                                <div>
                                    <strong>{songs.length}</strong>
                                    <span>songs scanned</span>
                                </div>
                            </div>

                            <div className="purge-narration-card queue-narration-card">
                                <strong>Host read:</strong>
                                <span>
                                    {queueWindowActive
                                        ? `The Queue is live. These are not bad songs. They are uninspected packets. Put ears on them before the round ends. ${Math.ceil(queueWindowRemaining / 1000)} seconds.`
                                        : 'Start The Queue when songs are getting ignored. The public page will spotlight every track with zero votes.'}
                                </span>
                            </div>

                            <div className="queue-target-list">
                                <div className="purge-feed-header">
                                    <h3>Current Queue Targets</h3>
                                    <span>{queueTargets.length} packets</span>
                                </div>
                                {queueTargets.length === 0 ? (
                                    <div className="purge-feed-empty">No zero-vote songs right now. Every packet has at least one vote.</div>
                                ) : (
                                    <div className="queue-target-grid">
                                        {queueTargets.map(song => (
                                            <div key={song.id} className="queue-target-card">
                                                <img src={song.albumArt || '/placeholder.svg'} alt="" />
                                                <div className="queue-target-info">
                                                    <strong>{song.name}</strong>
                                                    <span>{song.artist}</span>
                                                    <small>{getTotalVotes(song)} votes received</small>
                                                </div>
                                                <span className="queue-target-badge">NEEDS REVIEW</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="queue-vote-feed">
                                <div className="purge-feed-header">
                                    <h3>Live Vote Feed</h3>
                                    <span>{queueVoteActivity.length} recent votes</span>
                                </div>
                                {queueVoteActivity.length === 0 ? (
                                    <div className="purge-feed-empty">No votes yet. Start The Queue and watch for shout-outs here.</div>
                                ) : (
                                    <div className="queue-vote-feed-list">
                                        {queueVoteActivity.map(activity => {
                                            const timeStr = new Date(activity.timestamp).toLocaleTimeString('en-US', {
                                                hour: 'numeric',
                                                minute: '2-digit',
                                                second: '2-digit',
                                                hour12: true,
                                                timeZone: 'America/Chicago'
                                            });
                                            const isUpvote = activity.type === 'upvote';
                                            return (
                                                <div key={activity.id} className={`queue-vote-feed-row ${activity.type}`}>
                                                    <span className="queue-vote-feed-icon">{isUpvote ? '👍' : '👎'}</span>
                                                    <div>
                                                        <strong>{activity.userName}</strong>
                                                        <span>{isUpvote ? 'voted up' : 'voted down'} "{activity.songName}"</span>
                                                        <small>{activity.userLocation ? `${activity.userLocation} · ` : ''}{timeStr}</small>
                                                    </div>
                                                    <span className="queue-vote-feed-status">{isUpvote ? 'UP' : 'DOWN'}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 1s AND 0s TAB */}
                {activeTab === 'ones' && (
                    <div className="tab-panel ones-panel">
                        <HostGuide guide={onesHostGuide} />
                        {/* 🎲 1s AND 0s - Admin-hosted artist-vs-artist game-show segment */}
                        <div className={`artist-versus-section ${(showArtistVersusLobby || artistVersus.active) ? 'host-mode' : ''}`}>
                            {!artistVersus.active && !showArtistVersusLobby && (
                                <button
                                    className="tool-btn artist-versus-launcher"
                                    onClick={() => setShowArtistVersusLobby(true)}
                                >
                                    <span className="tool-icon">🎲</span>
                                    <span className="tool-name">1s and 0s</span>
                                </button>
                            )}

                            {!artistVersus.active && showArtistVersusLobby && (
                                <div className="artist-versus-lobby">
                                    <div className="av-lobby-kicker">HOST MODE</div>
                                    <div className="av-lobby-title">1s and 0s — Volunteer Up</div>
                                    <div className="av-lobby-hint">Type the volunteer's first name if you have it. Leave it blank when you need to move fast.</div>
                                    <input
                                        type="text"
                                        className="av-lobby-input"
                                        value={artistVersusPlayerInput}
                                        onChange={(e) => setArtistVersusPlayerInput(e.target.value)}
                                        placeholder="Player first name"
                                        maxLength={30}
                                        autoFocus
                                    />
                                    <div className="av-lobby-actions">
                                        <button
                                            className="tool-btn av-lobby-start"
                                            onClick={handleStartArtistVersus}
                                            disabled={isArtistVersusBusy}
                                        >
                                            <span className="tool-name">{isArtistVersusBusy ? 'Starting...' : 'Start Game'}</span>
                                        </button>
                                        <button
                                            className="tool-btn danger-subtle"
                                            onClick={() => { setShowArtistVersusLobby(false); setArtistVersusPlayerInput(''); }}
                                            disabled={isArtistVersusBusy}
                                        >
                                            <span className="tool-name">Cancel</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {artistVersus.active && (
                                <div className="artist-versus-host">
                                    <div className="av-host-header">
                                        <div className="av-host-title">
                                            1s and 0s Host Mode
                                            {artistVersus.playerName && <span className="av-host-player"> — {artistVersus.playerName}</span>}
                                            <div className="av-host-control-hint">Tap play for the clip. Tap the artist card to pick. Bomb is still a two-tap safety.</div>
                                        </div>
                                        <div className="av-host-meta">
                                            <span className="av-host-round">
                                                {artistVersus.phase === 'damageReport'
                                                    ? 'COMPLETE'
                                                    : `R${artistVersus.currentRound}/3`}
                                            </span>
                                            <span className={`av-host-bomb ${artistVersus.bombUsed ? 'used' : 'armed'}`}>
                                                💣 {artistVersus.bombUsed ? 'USED' : 'READY'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Active round — pick / bomb controls */}
                                    {artistVersus.phase === 'round' && artistVersus.rounds[artistVersus.currentRound - 1] && (() => {
                                        const round = artistVersus.rounds[artistVersus.currentRound - 1];
                                        return (
                                            <div className="av-host-arena">
                                                {(['A', 'B'] as const).map(side => {
                                                    const contestant = side === 'A' ? round.artistA : round.artistB;
                                                    const isArmed = bombArmedSide === side;
                                                    const isPreviewing = previewingSide === side;
                                                    const cached = previewUrlCache[side];
                                                    const isLoadingPreview = cached === 'loading';
                                                    const noPreview = cached === null;
                                                    return (
                                                        <div key={side} className={`av-host-side ${isArmed ? 'armed' : ''}`}>
                                                            <div className="av-host-side-label">SIDE {side}</div>
                                                            <div className="av-host-art-wrap">
                                                                <button
                                                                    className="av-host-pick-btn"
                                                                    onClick={() => handleArtistVersusPick(side)}
                                                                    disabled={isArtistVersusBusy}
                                                                >
                                                                    <img src={contestant.albumArt} alt="" className="av-host-art" />
                                                                    <div className="av-host-name">{contestant.name}</div>
                                                                    <div className="av-host-sub">"{contestant.sampleSongName}"</div>
                                                                    <div className="av-host-sub-count">{contestant.songCount} songs</div>
                                                                    <div className="av-host-pick-copy">PICK {contestant.name}</div>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`av-host-preview-btn ${isPreviewing ? 'playing' : ''} ${isLoadingPreview ? 'loading' : ''} ${noPreview ? 'no-preview' : ''}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleArtistVersusPreview(side);
                                                                    }}
                                                                    disabled={noPreview}
                                                                    title={
                                                                        noPreview ? 'No preview available' :
                                                                            isLoadingPreview ? 'Loading preview...' :
                                                                                isPreviewing ? 'Stop preview' : 'Play 7-second preview'
                                                                    }
                                                                    aria-label={isPreviewing ? `Stop ${contestant.name} preview` : `Preview ${contestant.name}`}
                                                                >
                                                                    <span className="av-host-preview-symbol">{isPreviewing ? 'STOP' : isLoadingPreview ? '...' : noPreview ? 'NO CLIP' : 'PLAY'}</span>
                                                                </button>
                                                            </div>
                                                            {!isArmed ? (
                                                                <button
                                                                    className="av-host-bomb-btn arm"
                                                                    onClick={() => handleArtistVersusBombArm(side)}
                                                                    disabled={isArtistVersusBusy || artistVersus.bombUsed}
                                                                    title={artistVersus.bombUsed ? 'Bomb already used' : 'Arm nuke'}
                                                                >
                                                                    ARM NUKE
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className="av-host-bomb-btn fire"
                                                                    onClick={() => handleArtistVersusBombFire(side)}
                                                                    disabled={isArtistVersusBusy}
                                                                >
                                                                    FIRE — NUKE {contestant.name.toUpperCase()}
                                                                </button>
                                                            )}
                                                            <div className="av-host-nuke-hint">
                                                                {artistVersus.bombUsed ? 'Bomb already used this game.' : isArmed ? 'Tap FIRE only when you are sure.' : 'Arm first. Fire second.'}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}

                                    {/* Awaiting next round */}
                                    {artistVersus.phase === 'awaitingNext' && (
                                        <div className="av-host-between">
                                            <div className="av-host-result">
                                                Round {artistVersus.currentRound} resolved.
                                                {(() => {
                                                    const r = artistVersus.rounds[artistVersus.currentRound - 1];
                                                    if (!r) return null;
                                                    if (r.outcome === 'pick') {
                                                        const w = r.winner === 'A' ? r.artistA.name : r.artistB.name;
                                                        const l = r.winner === 'A' ? r.artistB.name : r.artistA.name;
                                                        return ` ${w} over ${l}.`;
                                                    }
                                                    if (r.outcome === 'bomb') {
                                                        return ` ${r.nukedArtistName} NUKED (${r.nukedSongIds?.length || 0} songs wiped).`;
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                            <button
                                                className="tool-btn av-host-next"
                                                onClick={handleArtistVersusNext}
                                                disabled={isArtistVersusBusy}
                                            >
                                                <span className="tool-icon">⏭️</span>
                                                <span className="tool-name">Next Round</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Damage report after round 3 (or admin-ended) */}
                                    {artistVersus.phase === 'damageReport' && (
                                        <div className="av-host-damage">
                                            <div className="av-host-damage-title">DAMAGE REPORT</div>
                                            {artistVersus.rounds.map(r => (
                                                <div key={r.roundNumber} className={`av-host-damage-row ${r.outcome === 'bomb' ? 'nuked' : ''}`}>
                                                    <span>R{r.roundNumber}</span>
                                                    <span>
                                                        {r.outcome === 'pick'
                                                            ? `${r.winner === 'A' ? r.artistA.name : r.artistB.name} over ${r.winner === 'A' ? r.artistB.name : r.artistA.name}`
                                                            : r.outcome === 'bomb'
                                                                ? `NUKED ${r.nukedArtistName} (${r.nukedSongIds?.length || 0} songs wiped)`
                                                                : 'incomplete'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Action buttons - end / cancel */}
                                    <div className="av-host-actions">
                                        {artistVersus.phase === 'awaitingNext' && artistVersus.currentRound === 3 && (
                                            <button
                                                className="tool-btn av-host-end"
                                                onClick={handleArtistVersusEnd}
                                                disabled={isArtistVersusBusy}
                                            >
                                                <span className="tool-icon">🏁</span>
                                                <span className="tool-name">Show Damage Report</span>
                                            </button>
                                        )}
                                        <button
                                            className="tool-btn danger-subtle"
                                            onClick={handleArtistVersusCancel}
                                            disabled={isArtistVersusBusy}
                                        >
                                            <span className="tool-icon">✕</span>
                                            <span className="tool-name">{artistVersus.phase === 'damageReport' ? 'Close' : 'Cancel'}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* CRATE GAMES TAB */}
                {activeTab === 'crateCrack' && (
                    <div className="tab-panel crate-crack-panel">
                        <div className={`crate-crack-command-center ${crateCrackStatus.active ? 'active' : ''}`}>
                            <div className="purge-command-header crate-crack-command-header">
                                <div>
                                    <div className="purge-command-kicker crate-crack-kicker">SIDE QUEST</div>
                                    <h2>{crateCrackStatus.active ? 'Crate Games Is Live' : 'Crate Games'}</h2>
                                    <p>
                                        Launch a 60-second full-screen mini-game. Players sort the record stack and earn the default promo when they finish.
                                    </p>
                                </div>
                                <div className={`purge-command-timer crate-crack-timer ${crateCrackStatus.remaining < 10000 && crateCrackStatus.active ? 'urgent' : ''}`}>
                                    <span>{crateCrackStatus.active ? formatTime(crateCrackStatus.remaining) : 'READY'}</span>
                                    <small>{crateCrackStatus.active ? 'remaining' : 'standby'}</small>
                                </div>
                            </div>

                            <div className="crate-crack-grid">
                                <section className="admin-card crate-crack-card crate-crack-sales-card">
                                    <h3>Sales Game</h3>
                                    <p className="admin-sub">Pick the mini-game that appears on every player screen.</p>
                                    <label>
                                        Mini-Game
                                        <select value={crateCrackGameType} onChange={(e) => setCrateCrackGameType(e.target.value as typeof crateCrackGameType)}>
                                            <option value="request_evader">Request Evader Arcade</option>
                                            <option value="crate_man">Crate-Man</option>
                                            <option value="missile_wedding">Missile Command: Wedding Edition</option>
                                            <option value="bpm_sort">Sort By BPM</option>
                                        </select>
                                    </label>
                                    <div className="crate-crack-sales-note">
                                        <strong>
                                            {crateCrackGameType === 'request_evader'
                                                ? 'Arcade promo game.'
                                                : crateCrackGameType === 'crate_man'
                                                    ? 'Maze promo game.'
                                                    : crateCrackGameType === 'missile_wedding'
                                                        ? 'Wedding defense game.'
                                                        : 'Decision game.'}
                                        </strong>
                                        <span>
                                            {crateCrackGameType === 'request_evader'
                                                ? 'Players dodge phone requests, grab DJ power-ups, and survive for the promo reveal.'
                                                : crateCrackGameType === 'crate_man'
                                                    ? 'Players eat records, dodge copyright lawyers, and grab White Labels for invincibility.'
                                                    : crateCrackGameType === 'missile_wedding'
                                                        ? 'Players protect dance floor energy from speeches, cake cutting, and drunk uncle.'
                                                        : 'Players sort a tiny crate. Finishers get the promo reveal.'}
                                        </span>
                                    </div>
                                </section>

                                <section className="admin-card crate-crack-card">
                                    <h3>Default Reward</h3>
                                    <p className="admin-sub">Everyone who completes the side quest gets this direct redeem link.</p>
                                    <label>
                                        Reward Label
                                        <input value={crateCrackRewardLabel} onChange={(e) => setCrateCrackRewardLabel(e.target.value)} />
                                    </label>
                                    <label>
                                        Claim URL
                                        <input value={crateCrackRewardUrl} onChange={(e) => setCrateCrackRewardUrl(e.target.value)} />
                                    </label>
                                    <label>
                                        Timer Seconds
                                        <input
                                            type="number"
                                            min={15}
                                            max={180}
                                            value={crateCrackDuration}
                                            onChange={(e) => setCrateCrackDuration(Number(e.target.value) || 60)}
                                        />
                                    </label>
                                </section>

                                <section className="admin-card crate-crack-card">
                                    <h3>Rare Rewards</h3>
                                    <p className="admin-sub">These are impossible unless you arm them before launch.</p>
                                    <label className="crate-crack-toggle">
                                        <input type="checkbox" checked={armCrateAnnual} onChange={(e) => setArmCrateAnnual(e.target.checked)} />
                                        Annual Crate Hackers
                                    </label>
                                    {armCrateAnnual && <input value={crateAnnualCode} onChange={(e) => setCrateAnnualCode(e.target.value)} placeholder="Annual code" />}

                                    <label className="crate-crack-toggle">
                                        <input type="checkbox" checked={armBangerAnnual} onChange={(e) => setArmBangerAnnual(e.target.checked)} />
                                        Annual Banger Button
                                    </label>
                                    {armBangerAnnual && <input value={bangerAnnualCode} onChange={(e) => setBangerAnnualCode(e.target.value)} placeholder="Annual code" />}

                                    <label className="crate-crack-toggle danger">
                                        <input type="checkbox" checked={armLifetime} onChange={(e) => setArmLifetime(e.target.checked)} />
                                        Lifetime Offer
                                    </label>
                                    {armLifetime && <input value={lifetimeCode} onChange={(e) => setLifetimeCode(e.target.value)} placeholder="Lifetime code" />}
                                </section>
                            </div>

                            <div className="purge-command-actions crate-crack-actions">
                                <button
                                    className="purge-master-btn start"
                                    onClick={handleStartCrateCrack}
                                    disabled={isStartingCrateCrack || crateCrackStatus.active}
                                >
                                    {isStartingCrateCrack ? 'Starting...' : 'Launch 60s Crate Games'}
                                </button>
                                <button
                                    className="purge-master-btn stop"
                                    onClick={handleStopCrateCrack}
                                    disabled={isStoppingCrateCrack || !crateCrackStatus.active}
                                >
                                    {isStoppingCrateCrack ? 'Stopping...' : 'End Early'}
                                </button>
                            </div>

                            <div className="purge-command-stats crate-crack-stats">
                                <div>
                                    <strong>{crateCrackStatus.attempts}</strong>
                                    <span>attempts</span>
                                </div>
                                <div>
                                    <strong>{crateCrackStatus.completions}</strong>
                                    <span>completed</span>
                                </div>
                                <div>
                                    <strong>{crateCrackStatus.rareRewardsArmed ? 'ARMED' : 'OFF'}</strong>
                                    <span>rare rewards</span>
                                </div>
                            </div>

                            <div className="purge-narration-card crate-crack-narration">
                                <strong>Host read:</strong>
                                <span>
                                    {crateCrackStatus.active
                                        ? `Crate Games is live. Win the mini-game before the clock dies. ${Math.ceil(crateCrackStatus.remaining / 1000)} seconds.`
                                        : 'When you launch Crate Games, every player gets a short side quest on top of the voting screen.'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* PRIZE TAB */}
                {activeTab === 'dance' && (
                    <div className="tab-panel dance-panel">
                        <DanceGame
                            adminKey={adminPassword}
                            adminId={adminId}
                            onMessage={setMessage}
                        />
                    </div>
                )}

                {activeTab === 'prize' && (
                    <div className="tab-panel prize-panel">
                        <PrizeHQ
                            adminKey={adminPassword}
                            adminId={adminId}
                            onMessage={setMessage}
                        />
                    </div>
                )}

                {/* TOOLS TAB */}
                {activeTab === 'tools' && (
                    <div className="tab-panel tools-panel">
                        {/* Export signups / mailing list */}
                        <div className="leads-export-section">
                            <div className="leads-export-head">
                                <span className="tool-icon">📧</span>
                                <div>
                                    <h3 className="leads-export-title">Export Signups (CSV)</h3>
                                    <p className="leads-export-hint">
                                        Real emails of everyone who signed up. Ready for a Kartra import.
                                        Leave dates blank to grab the full list.
                                    </p>
                                </div>
                            </div>
                            <div className="leads-export-controls">
                                <label className="leads-date-field">
                                    <span>From</span>
                                    <input
                                        type="date"
                                        value={exportFrom}
                                        max={exportTo || undefined}
                                        onChange={(e) => setExportFrom(e.target.value)}
                                    />
                                </label>
                                <label className="leads-date-field">
                                    <span>To</span>
                                    <input
                                        type="date"
                                        value={exportTo}
                                        min={exportFrom || undefined}
                                        onChange={(e) => setExportTo(e.target.value)}
                                    />
                                </label>
                                {(exportFrom || exportTo) && (
                                    <button
                                        className="leads-clear-btn"
                                        onClick={() => { setExportFrom(''); setExportTo(''); }}
                                        disabled={isExportingLeads}
                                    >
                                        Clear dates
                                    </button>
                                )}
                                <button
                                    className="tool-btn leads-export-btn"
                                    onClick={handleExportLeads}
                                    disabled={isExportingLeads}
                                >
                                    <span className="tool-icon">⬇️</span>
                                    <span className="tool-name">
                                        {isExportingLeads
                                            ? 'Preparing…'
                                            : (exportFrom || exportTo) ? 'Download Range CSV' : 'Download All CSV'}
                                    </span>
                                </button>
                            </div>
                        </div>

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

                        {/* 📡 DEMO NIGHT MODE */}
                        <div className="youtube-embed-control stream-config-panel" style={{ marginBottom: '16px' }}>
                            <div className="control-label">
                                <span className="tool-icon">📡</span>
                                <span className="tool-name">Demo Night</span>
                            </div>

                            {/* Master Toggle */}
                            <button
                                className={`platform-btn demo-night-toggle ${demoNightEnabled ? 'active demo-night-active' : ''}`}
                                onClick={() => {
                                    const newState = !demoNightEnabled;
                                    setDemoNightEnabled(newState);
                                    // Auto-save the toggle immediately
                                    handleSaveDemoNight(newState);
                                }}
                                disabled={isSavingDemoNight}
                            >
                                {demoNightEnabled ? '🟢 Demo Night ON' : '⚫ Demo Night OFF'}
                            </button>

                            {/* Config fields (shown when enabled) */}
                            {demoNightEnabled && (
                                <>
                                    <input
                                        type="text"
                                        className="youtube-url-input"
                                        value={demoNightHeadline}
                                        onChange={(e) => setDemoNightHeadline(e.target.value)}
                                        placeholder="Headline (e.g. Demo Night)"
                                        maxLength={100}
                                    />
                                    <input
                                        type="text"
                                        className="youtube-url-input"
                                        value={demoNightDescription}
                                        onChange={(e) => setDemoNightDescription(e.target.value)}
                                        placeholder="Description (e.g. Grab your free sample pack)"
                                        maxLength={300}
                                    />
                                    <input
                                        type="text"
                                        className="youtube-url-input"
                                        value={demoNightLinkUrl}
                                        onChange={(e) => setDemoNightLinkUrl(e.target.value)}
                                        placeholder="Link URL (Dropbox, Google Drive, etc.)"
                                        maxLength={500}
                                    />
                                    <input
                                        type="text"
                                        className="youtube-url-input"
                                        value={demoNightLinkLabel}
                                        onChange={(e) => setDemoNightLinkLabel(e.target.value)}
                                        placeholder="Button label (e.g. Download Sample Pack)"
                                        maxLength={60}
                                    />
                                    <div className="stream-actions">
                                        <button
                                            className="tool-btn youtube-save"
                                            onClick={() => handleSaveDemoNight()}
                                            disabled={isSavingDemoNight}
                                        >
                                            <span className="tool-icon">💾</span>
                                            <span className="tool-name">{isSavingDemoNight ? 'Saving...' : 'Save Config'}</span>
                                        </button>
                                        <button
                                            className="tool-btn danger-subtle"
                                            onClick={() => {
                                                setDemoNightEnabled(false);
                                                setDemoNightHeadline('Demo Night');
                                                setDemoNightDescription('');
                                                setDemoNightLinkUrl('');
                                                setDemoNightLinkLabel('Download');
                                                handleSaveDemoNight(false);
                                            }}
                                            disabled={isSavingDemoNight}
                                        >
                                            <span className="tool-icon">🗑️</span>
                                            <span className="tool-name">Clear</span>
                                        </button>
                                    </div>
                                </>
                            )}
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

                {/* SHOWS TAB - Multi-tab + show archive management */}
                {activeTab === 'shows' && (
                    <div className="tab-panel shows-panel">
                        <TabsShowsDashboard adminKey={adminPassword} />
                    </div>
                )}
            </div>
        </div>
    );
}
