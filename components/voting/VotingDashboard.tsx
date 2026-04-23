'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getVisitorId } from '@/lib/fingerprint';
import './VotingDashboard.css';

// ----------------------------------------------------------------------------
// Types (locally-scoped — mirror the API response shape)
// ----------------------------------------------------------------------------

export interface DashboardSong {
    id: string;
    spotifyUri: string;
    name: string;
    artist: string;
    album?: string;
    albumArt?: string;
    addedBy: string;
    addedByName: string;
    addedByLocation?: string;
    remixTag?: string;
    addedAt: number;
    upvotes: string[];
    downvotes: string[];
    score: number;
    showId?: string;
    tabId?: string;
}

export interface DashboardTab {
    id: string;
    slug: string;
    name: string;
    description?: string;
    themeColor?: string;
    isMainTab: boolean;
}

export interface DashboardShow {
    id: string;
    tabId: string;
    showNumber: number;
    title: string;
    description?: string;
    status: 'draft' | 'active' | 'archived';
    startedAt: number | null;
    archivedAt: number | null;
    createdAt: number;
    locked: boolean;
}

export interface DashboardSnapshot {
    archivedAt: number;
    ranking: Array<{ rank: number; songId: string; name: string; artist: string; score: number }>;
}

interface VotingDashboardProps {
    tab: DashboardTab;
    show: DashboardShow;
    initialSongs: DashboardSong[];
    initialUserVotes: { upvotedSongIds: string[]; downvotedSongIds: string[] };
    snapshot?: DashboardSnapshot | null;
    canVote: boolean;
    canAddSongs: boolean;
    pollIntervalMs?: number;
}

// ----------------------------------------------------------------------------
// Voting Dashboard
// ----------------------------------------------------------------------------

export default function VotingDashboard({
    tab,
    show,
    initialSongs,
    initialUserVotes,
    snapshot,
    canVote,
    canAddSongs,
    pollIntervalMs = 8000,
}: VotingDashboardProps) {
    const [songs, setSongs] = useState<DashboardSong[]>(initialSongs);
    const [userVotes, setUserVotes] = useState(initialUserVotes);
    const [voting, setVoting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [visitorId, setVisitorId] = useState<string>('');
    const [showSnapshot, setShowSnapshot] = useState(false);
    const voteCooldown = useRef<Record<string, number>>({});

    // Acquire visitor ID once on mount
    useEffect(() => {
        getVisitorId().then(setVisitorId).catch(() => setVisitorId(''));
    }, []);

    // Poll for fresh state
    useEffect(() => {
        if (!visitorId) return;
        let cancelled = false;

        const fetchState = async () => {
            try {
                const res = await fetch(`/api/shows/${show.id}`, {
                    headers: { 'x-visitor-id': visitorId },
                });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                setSongs(data.songs || []);
                if (data.userVotes) setUserVotes(data.userVotes);
            } catch {
                // Silent - polling errors are normal under network strain
            }
        };

        const interval = setInterval(fetchState, pollIntervalMs);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [show.id, visitorId, pollIntervalMs]);

    const handleVote = useCallback(
        async (songId: string, direction: 1 | -1) => {
            if (!canVote || !visitorId) return;

            const now = Date.now();
            const last = voteCooldown.current[songId] || 0;
            if (now - last < 1500) return;
            voteCooldown.current[songId] = now;

            setVoting(songId);
            setError(null);

            try {
                const res = await fetch(
                    `/api/shows/${show.id}/songs/${songId}/vote`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-visitor-id': visitorId,
                        },
                        body: JSON.stringify({ vote: direction }),
                    }
                );
                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Vote failed.');
                    return;
                }
                if (data.freshState) {
                    setSongs(data.freshState.songs);
                    setUserVotes(data.freshState.userVotes);
                }
            } catch {
                setError('Network error. Please try again.');
            } finally {
                setVoting(null);
            }
        },
        [canVote, visitorId, show.id]
    );

    const upvotedSet = useMemo(
        () => new Set(userVotes.upvotedSongIds),
        [userVotes.upvotedSongIds]
    );
    const downvotedSet = useMemo(
        () => new Set(userVotes.downvotedSongIds),
        [userVotes.downvotedSongIds]
    );

    const themeStyle = tab.themeColor
        ? ({ '--tab-accent': tab.themeColor } as React.CSSProperties)
        : undefined;

    return (
        <div className="vd-root" style={themeStyle}>
            <header className="vd-header">
                <div className="vd-header-left">
                    <Link href="/" className="vd-back">
                        ← All Tabs
                    </Link>
                    <div className="vd-tab-meta">
                        <h1 className="vd-tab-name">{tab.name}</h1>
                        {tab.description && (
                            <p className="vd-tab-desc">{tab.description}</p>
                        )}
                    </div>
                </div>
                <div className="vd-header-right">
                    <ShowStatusBadge show={show} />
                </div>
            </header>

            <div className="vd-show-bar">
                <div className="vd-show-title">
                    <span className="vd-show-number">#{show.showNumber}</span>
                    <span>{show.title}</span>
                </div>
                <div className="vd-show-meta">
                    {show.startedAt && (
                        <span title={new Date(show.startedAt).toLocaleString()}>
                            Started {formatRelativeDate(show.startedAt)}
                        </span>
                    )}
                    {show.archivedAt && (
                        <span title={new Date(show.archivedAt).toLocaleString()}>
                            · Archived {formatRelativeDate(show.archivedAt)}
                        </span>
                    )}
                </div>
                <div className="vd-show-links">
                    <Link href={`/tab/${tab.slug}/archive`} className="vd-link">
                        View Archive →
                    </Link>
                </div>
            </div>

            {snapshot && (
                <div className="vd-snapshot-toggle">
                    <button
                        className={`vd-tab-btn ${!showSnapshot ? 'active' : ''}`}
                        onClick={() => setShowSnapshot(false)}
                    >
                        Live Ranking
                    </button>
                    <button
                        className={`vd-tab-btn ${showSnapshot ? 'active' : ''}`}
                        onClick={() => setShowSnapshot(true)}
                    >
                        Final Ranking ({formatRelativeDate(snapshot.archivedAt)})
                    </button>
                </div>
            )}

            {error && <div className="vd-error">{error}</div>}

            {!canVote && show.status === 'archived' && (
                <div className="vd-notice">
                    Voting is disabled on this archived show.
                </div>
            )}

            {showSnapshot && snapshot ? (
                <SnapshotList snapshot={snapshot} />
            ) : (
                <div className="vd-songs">
                    {songs.length === 0 ? (
                        <div className="vd-empty">
                            <p>No songs in this show yet.</p>
                            {canAddSongs && (
                                <p className="vd-empty-sub">
                                    Songs can be added from the main Hackathons experience.
                                </p>
                            )}
                        </div>
                    ) : (
                        songs.map((song, idx) => (
                            <SongRow
                                key={song.id}
                                rank={idx + 1}
                                song={song}
                                upvoted={upvotedSet.has(song.id)}
                                downvoted={downvotedSet.has(song.id)}
                                voting={voting === song.id}
                                canVote={canVote}
                                onVote={handleVote}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function ShowStatusBadge({ show }: { show: DashboardShow }) {
    const label =
        show.status === 'active' ? 'LIVE' :
        show.status === 'archived' ? 'ARCHIVED' :
        'DRAFT';
    return (
        <span className={`vd-status vd-status-${show.status}`}>{label}</span>
    );
}

function SongRow({
    rank,
    song,
    upvoted,
    downvoted,
    voting,
    canVote,
    onVote,
}: {
    rank: number;
    song: DashboardSong;
    upvoted: boolean;
    downvoted: boolean;
    voting: boolean;
    canVote: boolean;
    onVote: (songId: string, direction: 1 | -1) => void;
}) {
    return (
        <div className={`vd-song ${rank <= 3 ? 'vd-song-top' : ''}`}>
            <div className="vd-rank">{rank === 1 ? '👑' : rank}</div>
            {song.albumArt ? (
                <img className="vd-art" src={song.albumArt} alt="" loading="lazy" />
            ) : (
                <div className="vd-art vd-art-placeholder">♪</div>
            )}
            <div className="vd-song-info">
                <div className="vd-song-name" title={song.name}>{song.name}</div>
                <div className="vd-song-artist">{song.artist}</div>
                <div className="vd-song-meta">
                    <span>by {song.addedByName}</span>
                    {song.addedByLocation && <span>· {song.addedByLocation}</span>}
                    {song.remixTag && <span className="vd-remix">· {song.remixTag}</span>}
                </div>
            </div>
            <div className="vd-vote">
                <button
                    className={`vd-vote-btn vd-vote-down ${downvoted ? 'active' : ''}`}
                    onClick={() => onVote(song.id, -1)}
                    disabled={!canVote || voting}
                    aria-label="Downvote"
                >
                    ▼
                </button>
                <span className={`vd-score ${song.score > 0 ? 'positive' : song.score < 0 ? 'negative' : ''}`}>
                    {song.score > 0 ? `+${song.score}` : song.score}
                </span>
                <button
                    className={`vd-vote-btn vd-vote-up ${upvoted ? 'active' : ''}`}
                    onClick={() => onVote(song.id, 1)}
                    disabled={!canVote || voting}
                    aria-label="Upvote"
                >
                    ▲
                </button>
            </div>
        </div>
    );
}

function SnapshotList({ snapshot }: { snapshot: DashboardSnapshot }) {
    return (
        <div className="vd-songs">
            <div className="vd-snapshot-header">
                Final ranking captured {formatRelativeDate(snapshot.archivedAt)}.
                Live votes since then are tracked separately.
            </div>
            {snapshot.ranking.map((entry) => (
                <div key={entry.songId} className={`vd-song ${entry.rank <= 3 ? 'vd-song-top' : ''}`}>
                    <div className="vd-rank">{entry.rank === 1 ? '👑' : entry.rank}</div>
                    <div className="vd-art vd-art-placeholder">♪</div>
                    <div className="vd-song-info">
                        <div className="vd-song-name">{entry.name}</div>
                        <div className="vd-song-artist">{entry.artist}</div>
                    </div>
                    <div className="vd-vote">
                        <span className={`vd-score ${entry.score > 0 ? 'positive' : entry.score < 0 ? 'negative' : ''}`}>
                            {entry.score > 0 ? `+${entry.score}` : entry.score}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function formatRelativeDate(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (diff < min) return 'just now';
    if (diff < hour) return `${Math.floor(diff / min)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
    return new Date(timestamp).toLocaleDateString();
}
