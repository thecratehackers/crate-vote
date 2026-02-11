'use client';

import { useState, useEffect } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface ExportTrack {
    id: string;
    spotifyUri: string;
    name: string;
    artist: string;
    albumArt: string;
    score: number;
}

export default function ExportPage() {
    const { data: session, status } = useSession();
    const searchParams = useSearchParams();
    const [tracks, setTracks] = useState<ExportTrack[]>([]);
    const [playlistTitle, setPlaylistTitle] = useState('Hackathon Playlist');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [exportTarget, setExportTarget] = useState<'spotify' | 'tidal' | null>(null);
    const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
    const [exportedService, setExportedService] = useState<'spotify' | 'tidal' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasAttemptedExport, setHasAttemptedExport] = useState(false);

    // Crate Hackers sync state
    const [crateHackersSyncing, setCrateHackersSyncing] = useState(false);
    const [crateHackersSynced, setCrateHackersSynced] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    // TIDAL state
    const [tidalConnected, setTidalConnected] = useState(false);
    const [tidalLoading, setTidalLoading] = useState(true);
    const [tidalExportStats, setTidalExportStats] = useState<{
        trackCount: number;
        totalAttempted: number;
        missingTracks?: { name: string; artist: string }[];
    } | null>(null);

    // Strip emojis from text for playlist names
    const stripEmojis = (text: string): string => {
        return text
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
    };

    // Fetch the current playlist and title
    useEffect(() => {
        async function fetchPlaylist() {
            try {
                const res = await fetch('/api/playlist/export');
                const data = await res.json();
                setTracks(data.tracks || []);
                if (data.playlistTitle) {
                    setPlaylistTitle(data.playlistTitle);
                }
            } catch (err) {
                setError('Failed to load playlist');
            } finally {
                setLoading(false);
            }
        }
        fetchPlaylist();
    }, []);

    // Check TIDAL connection status
    useEffect(() => {
        async function checkTidal() {
            try {
                const res = await fetch('/api/tidal/status');
                const data = await res.json();
                setTidalConnected(data.connected);
            } catch {
                setTidalConnected(false);
            } finally {
                setTidalLoading(false);
            }
        }
        checkTidal();

        // Check if just returned from TIDAL OAuth
        if (searchParams.get('tidal_connected') === 'true') {
            setTidalConnected(true);
        }
        if (searchParams.get('tidal_error')) {
            setError(`TIDAL connection failed: ${searchParams.get('tidal_error')}`);
        }
    }, [searchParams]);

    // NOTE: We intentionally do NOT auto-export when returning from Spotify auth.
    // Users should always explicitly confirm which account to save to.

    // Auto-export to TIDAL when returning from TIDAL auth
    useEffect(() => {
        if (searchParams.get('tidal_connected') === 'true' && !loading && tracks.length > 0 && !playlistUrl) {
            doTidalExport();
        }
    }, [tidalConnected, loading, tracks, searchParams]);

    // === SPOTIFY EXPORT ===
    const handleSpotifyExport = async () => {
        if (!session) {
            setIsConnecting(true);
            signIn('spotify');
            return;
        }
        await doSpotifyExport();
    };

    const handleSpotifyConnect = () => {
        setIsConnecting(true);
        signIn('spotify', { callbackUrl: '/export' });
    };

    const handleSpotifyExportAuto = async () => {
        await doSpotifyExport();
    };

    const doSpotifyExport = async () => {
        setExporting(true);
        setExportTarget('spotify');
        setError(null);

        try {
            const cleanTitle = stripEmojis(playlistTitle);
            const res = await fetch('/api/playlist/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: cleanTitle,
                    description: `Collaborative playlist from DJ Booth | ${tracks.length} songs`,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Export failed');
            }

            setPlaylistUrl(data.playlistUrl);
            setExportedService('spotify');

            // Sign out of the Spotify session after export so the next
            // export always prompts the user to pick an account.
            signOut({ redirect: false });
        } catch (err: any) {
            setError(err.message || 'Failed to export playlist');
        } finally {
            setExporting(false);
            setExportTarget(null);
        }
    };

    // === TIDAL EXPORT ===
    const handleTidalConnect = () => {
        // Redirect to our TIDAL OAuth endpoint
        window.location.href = '/api/tidal/auth';
    };

    const handleTidalDisconnect = async () => {
        await fetch('/api/tidal/status', { method: 'DELETE' });
        setTidalConnected(false);
    };

    const doTidalExport = async () => {
        setExporting(true);
        setExportTarget('tidal');
        setError(null);

        try {
            const cleanTitle = stripEmojis(playlistTitle);
            const res = await fetch('/api/playlist/export-tidal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: cleanTitle,
                    description: `Collaborative playlist from Crate Hackers | ${tracks.length} crowd-approved songs 🎧`,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'TIDAL export failed');
            }

            setPlaylistUrl(data.playlistUrl);
            setExportedService('tidal');
            setTidalExportStats({
                trackCount: data.trackCount,
                totalAttempted: data.totalAttempted,
                missingTracks: data.missingTracks,
            });
        } catch (err: any) {
            setError(err.message || 'Failed to export to TIDAL');
        } finally {
            setExporting(false);
            setExportTarget(null);
        }
    };

    // === CRATE HACKERS SYNC ===
    const handleCrateHackersSync = () => {
        setCrateHackersSyncing(true);
        // Open the Crate Hackers My Crates page in a new tab
        window.open('https://x.cratehackers.com/#/my-crates/spotify', '_blank', 'noopener,noreferrer');
        // Brief "syncing" animation, then show success
        setTimeout(() => {
            setCrateHackersSyncing(false);
            setCrateHackersSynced(true);
        }, 1800);
    };

    // ─── LOADING STATE ──────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="export-page">
                <div className="loading">Loading playlist...</div>
            </div>
        );
    }

    // ─── EXPORTING STATE ────────────────────────────────────────────────────────

    if (exporting) {
        const targetName = exportTarget === 'tidal' ? 'TIDAL' : 'Spotify';
        const targetColor = exportTarget === 'tidal' ? '#00FFFF' : '#1DB954';
        return (
            <div className="export-page">
                <div className="exporting-card">
                    <div className="spinner" style={{ borderTopColor: targetColor }} />
                    <h2>Creating your {targetName} playlist...</h2>
                    <p>
                        {exportTarget === 'tidal'
                            ? `Matching ${tracks.length} songs across platforms`
                            : `Adding ${tracks.length} crowd-approved songs to your library`}
                    </p>
                </div>
            </div>
        );
    }

    // ─── SUCCESS STATE ──────────────────────────────────────────────────────────

    if (playlistUrl && exportedService) {
        const isTidal = exportedService === 'tidal';
        const serviceColor = isTidal ? '#00FFFF' : '#1DB954';
        const serviceName = isTidal ? 'TIDAL' : 'Spotify';

        return (
            <div className="export-page">
                <div className="success-card">
                    <div className="success-header">
                        <img src="/logo.png" alt="Crate Hackers" className="success-logo" />
                        <div className="success-checkmark" style={{
                            background: isTidal
                                ? 'linear-gradient(135deg, #00FFFF, #0080FF)'
                                : 'linear-gradient(135deg, #1DB954, #1ed760)',
                        }}>✓</div>
                    </div>
                    <h1>Crate Created!</h1>
                    <p className="success-subtitle">
                        <strong>
                            {tidalExportStats
                                ? `${tidalExportStats.trackCount} of ${tidalExportStats.totalAttempted}`
                                : tracks.length} crowd-approved songs
                        </strong> are now in your {serviceName}
                    </p>
                    {tidalExportStats?.missingTracks && tidalExportStats.missingTracks.length > 0 && (
                        <div className="missing-tracks-note">
                            <p>⚠️ {tidalExportStats.missingTracks.length} songs weren&apos;t available on TIDAL:</p>
                            <ul>
                                {tidalExportStats.missingTracks.slice(0, 5).map((t, i) => (
                                    <li key={i}>{t.artist} — {t.name}</li>
                                ))}
                                {tidalExportStats.missingTracks.length > 5 && (
                                    <li>...and {tidalExportStats.missingTracks.length - 5} more</li>
                                )}
                            </ul>
                        </div>
                    )}
                    <div className="success-actions">
                        <a href={playlistUrl} target="_blank" rel="noopener noreferrer"
                            className="service-link" style={{ background: serviceColor }}>
                            {isTidal ? (
                                <TidalIcon size={22} />
                            ) : (
                                <img src="/spotify-logo.png" alt="" className="spotify-btn-icon" />
                            )}
                            Open in {serviceName}
                        </a>
                        <Link href="/" className="back-to-home-btn">
                            <svg className="back-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            <span className="btn-text">Back to Voting</span>
                        </Link>
                    </div>
                </div>

                <style jsx>{`
                    .export-page {
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .success-card {
                        background: var(--bg-secondary);
                        border: 1px solid var(--border-color);
                        border-radius: 20px;
                        padding: 48px 40px;
                        text-align: center;
                        max-width: 440px;
                        width: 100%;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    }
                    .success-header {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 16px;
                        margin-bottom: 24px;
                    }
                    .success-logo {
                        width: 60px;
                        height: 60px;
                        object-fit: contain;
                    }
                    .success-checkmark {
                        width: 60px;
                        height: 60px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 32px;
                        font-weight: bold;
                        color: white;
                        animation: pop 0.4s ease-out;
                        box-shadow: 0 4px 16px rgba(0, 255, 255, 0.3);
                    }
                    @keyframes pop {
                        0% { transform: scale(0); opacity: 0; }
                        70% { transform: scale(1.15); }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    .success-card h1 {
                        font-size: 1.75rem;
                        font-weight: 700;
                        margin-bottom: 12px;
                        color: var(--text-primary);
                    }
                    .success-subtitle {
                        color: var(--text-secondary);
                        font-size: 1rem;
                        margin-bottom: 28px;
                        line-height: 1.5;
                    }
                    .success-subtitle strong {
                        color: var(--orange-primary);
                    }
                    .missing-tracks-note {
                        background: rgba(251, 191, 36, 0.1);
                        border: 1px solid rgba(251, 191, 36, 0.3);
                        border-radius: 10px;
                        padding: 12px 16px;
                        margin-bottom: 20px;
                        text-align: left;
                        font-size: 0.85rem;
                        color: var(--text-secondary);
                    }
                    .missing-tracks-note p {
                        margin: 0 0 8px;
                        color: #fbbf24;
                        font-weight: 600;
                    }
                    .missing-tracks-note ul {
                        margin: 0;
                        padding-left: 18px;
                        color: var(--text-muted);
                    }
                    .missing-tracks-note li {
                        margin-bottom: 2px;
                    }
                    .success-actions {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        align-items: center;
                    }
                    .service-link {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        color: ${isTidal ? '#000' : '#fff'};
                        padding: 14px 28px;
                        border-radius: 50px;
                        text-decoration: none;
                        font-weight: 600;
                        font-size: 1rem;
                        transition: all 0.2s;
                        width: 100%;
                        max-width: 280px;
                    }
                    .service-link:hover {
                        transform: scale(1.02);
                        box-shadow: 0 4px 16px ${isTidal ? 'rgba(0, 255, 255, 0.4)' : 'rgba(29, 185, 84, 0.4)'};
                    }
                    .spotify-btn-icon {
                        width: 22px;
                        height: 22px;
                    }
                    .back-to-home-btn {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 14px 28px;
                        background: rgba(211, 119, 29, 0.08);
                        border: 1px solid rgba(211, 119, 29, 0.35);
                        border-radius: 12px;
                        color: #d3771d;
                        font-weight: 600;
                        font-size: 0.95rem;
                        text-decoration: none;
                        transition: all 0.25s ease;
                        width: 100%;
                        max-width: 280px;
                        backdrop-filter: blur(8px);
                        -webkit-backdrop-filter: blur(8px);
                        letter-spacing: 0.3px;
                    }
                    .back-to-home-btn:hover {
                        background: rgba(211, 119, 29, 0.15);
                        border-color: rgba(211, 119, 29, 0.6);
                        color: #e0a030;
                        box-shadow: 0 0 20px rgba(211, 119, 29, 0.15);
                    }
                    .back-to-home-btn:hover .back-chevron {
                        transform: translateX(-3px);
                    }
                    .back-to-home-btn .back-chevron {
                        transition: transform 0.25s ease;
                        flex-shrink: 0;
                    }
                    .back-to-home-btn .btn-text {
                        letter-spacing: 0.3px;
                    }
                `}</style>
            </div>
        );
    }


    // ─── MAIN EXPORT VIEW ───────────────────────────────────────────────────────

    return (
        <div className="export-page">
            <header className="export-header">
                <Link href="/" className="back-btn" title="Back to Voting">
                    <svg className="back-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    <span>Back</span>
                </Link>
                <Link href="/" className="logo-link">
                    <img src="/logo.png" alt="Crate Hackers" className="export-logo" />
                </Link>
                <h1>Save Your Crate</h1>
            </header>

            {error && <div className="error-msg">{error}</div>}

            {/* CLEAR EXPLANATION */}
            <div className="export-explainer">
                <div className="explainer-icon">🎧</div>
                <div className="explainer-text">
                    <strong>Export anytime!</strong>
                    <span>Save up to 100 songs to Crate Hackers, Spotify, or TIDAL — export whenever you want.</span>
                </div>
            </div>

            {/* TRACK PREVIEW */}
            <div className="export-preview">
                <p className="preview-label">🎵 {tracks.length} songs ready to export</p>

                <div className="track-list">
                    {tracks.map((track, index) => (
                        <div key={track.id} className="track-row">
                            <span className="track-rank">#{index + 1}</span>
                            <img src={track.albumArt || '/placeholder.svg'} alt="" className="track-art" />
                            <div className="track-info">
                                <span className="track-name">{track.name}</span>
                                <span className="track-artist">{track.artist}</span>
                            </div>
                            <span className={`track-score ${track.score > 0 ? 'pos' : track.score < 0 ? 'neg' : ''}`}>
                                {track.score > 0 ? '+' : ''}{track.score}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── EXPORT DESTINATIONS ────────────────────────────────────────── */}
            <div className="export-destinations">
                <h2 className="destinations-title">Choose your platform</h2>

                {/* CRATE HACKERS CARD */}
                <div className={`destination-card crate-hackers-card ${crateHackersSynced ? 'synced' : ''}`}>
                    <div className="destination-header">
                        <img src="/logo.png" alt="" className="ch-card-logo" />
                        <span className="destination-name">Crate Hackers</span>
                        <span className="home-badge">HOME</span>
                    </div>

                    {crateHackersSyncing ? (
                        <div className="destination-loading ch-syncing">
                            <div className="mini-spinner" style={{ borderTopColor: '#d3771d' }} />
                            <span>Syncing to your crate...</span>
                        </div>
                    ) : crateHackersSynced ? (
                        <div className="destination-auth">
                            <div className="connected-as ch-synced-msg">
                                <span className="connected-dot" style={{ background: '#d3771d' }} />
                                <span>Synced to My Crates</span>
                            </div>
                            <a
                                href="https://x.cratehackers.com/#/my-crates/spotify"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="export-action-btn ch-action"
                            >
                                📦 Open My Crates
                            </a>
                        </div>
                    ) : (
                        <button
                            onClick={handleCrateHackersSync}
                            className="export-action-btn ch-action"
                            disabled={tracks.length === 0}
                        >
                            📦 Sync to My Crates
                        </button>
                    )}
                </div>

                {/* SPOTIFY CARD */}
                <div className="destination-card spotify-card">
                    <div className="destination-header">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="#1DB954">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        <span className="destination-name">Spotify</span>
                    </div>

                    {status === 'authenticated' && session?.user ? (
                        <div className="destination-auth">
                            <div className="connected-as">
                                <span className="connected-dot" style={{ background: '#1DB954' }} />
                                <span>{session.user.name || session.user.email}</span>
                                <button onClick={() => signOut({ redirect: false }).then(() => setIsConnecting(false))} className="disconnect-btn">Change Account</button>
                            </div>
                            <button onClick={handleSpotifyExport} disabled={exporting || tracks.length === 0}
                                className="export-action-btn spotify-action">
                                🎧 Create Spotify Playlist
                            </button>
                        </div>
                    ) : status === 'loading' || isConnecting ? (
                        <div className="destination-loading">
                            <div className="mini-spinner" style={{ borderTopColor: '#1DB954' }} />
                            <span>Connecting...</span>
                        </div>
                    ) : (
                        <button onClick={handleSpotifyConnect} className="connect-btn spotify-connect" disabled={isConnecting}>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                            </svg>
                            Connect Spotify
                        </button>
                    )}
                </div>

                {/* TIDAL CARD */}
                <div className="destination-card tidal-card">
                    <div className="destination-header">
                        <TidalIcon size={28} />
                        <span className="destination-name">TIDAL</span>
                        <span className="new-badge">NEW</span>
                    </div>

                    {tidalLoading ? (
                        <div className="destination-loading">
                            <div className="mini-spinner" style={{ borderTopColor: '#00FFFF' }} />
                            <span>Checking...</span>
                        </div>
                    ) : tidalConnected ? (
                        <div className="destination-auth">
                            <div className="connected-as">
                                <span className="connected-dot" style={{ background: '#00FFFF' }} />
                                <span>Connected</span>
                                <button onClick={handleTidalDisconnect} className="disconnect-btn">Disconnect</button>
                            </div>
                            <button onClick={doTidalExport} disabled={exporting || tracks.length === 0}
                                className="export-action-btn tidal-action">
                                🎵 Create TIDAL Playlist
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleTidalConnect} className="connect-btn tidal-connect">
                            <TidalIcon size={20} />
                            Connect TIDAL
                        </button>
                    )}
                </div>
            </div>

            <style jsx>{`
                .export-page {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    min-height: 100vh;
                }
                .export-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 24px;
                }
                .back-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px 8px 12px;
                    background: rgba(211, 119, 29, 0.08);
                    border: 1px solid rgba(211, 119, 29, 0.35);
                    border-radius: 10px;
                    color: #d3771d;
                    font-size: 0.85rem;
                    text-decoration: none;
                    transition: all 0.25s ease;
                    font-weight: 600;
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    letter-spacing: 0.3px;
                }
                .back-btn:hover {
                    background: rgba(211, 119, 29, 0.15);
                    border-color: rgba(211, 119, 29, 0.6);
                    color: #e0a030;
                    box-shadow: 0 0 16px rgba(211, 119, 29, 0.15);
                }
                .back-btn:hover .back-chevron {
                    transform: translateX(-3px);
                }
                .back-btn .back-chevron {
                    transition: transform 0.25s ease;
                    flex-shrink: 0;
                }
                .logo-link {
                    display: flex;
                    align-items: center;
                }
                .export-header h1 {
                    font-size: 1.5rem;
                    margin: 0;
                }
                .export-logo {
                    width: 40px;
                    height: 40px;
                    object-fit: contain;
                    transition: transform 0.2s;
                }
                .logo-link:hover .export-logo {
                    transform: scale(1.1);
                }
                .loading {
                    text-align: center;
                    padding: 60px;
                    color: var(--text-secondary);
                }
                .error-msg {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 16px;
                }
                .export-explainer {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px 20px;
                    background: linear-gradient(135deg, rgba(211, 119, 29, 0.1) 0%, rgba(211, 119, 29, 0.05) 100%);
                    border: 1px solid rgba(211, 119, 29, 0.3);
                    border-radius: 12px;
                    margin-bottom: 20px;
                }
                .explainer-icon {
                    font-size: 1.5rem;
                }
                .explainer-text {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .explainer-text strong {
                    color: #d3771d;
                    font-size: 0.95rem;
                }
                .explainer-text span {
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                }
                .exporting-card {
                    text-align: center;
                    padding: 80px 20px;
                }
                .exporting-card h2 {
                    font-size: 1.5rem;
                    margin: 24px 0 8px;
                    color: var(--text-primary);
                }
                .exporting-card p {
                    color: var(--text-secondary);
                }
                .spinner {
                    width: 60px;
                    height: 60px;
                    border: 4px solid var(--bg-tertiary);
                    border-top-color: #1DB954;
                    border-radius: 50%;
                    margin: 0 auto;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .preview-label {
                    color: var(--text-secondary);
                    margin-bottom: 12px;
                    font-size: 0.9rem;
                }
                .track-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    max-height: 300px;
                    overflow-y: auto;
                }
                .track-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    background: var(--bg-secondary);
                    border-radius: 8px;
                }
                .track-rank {
                    width: 28px;
                    color: var(--text-muted);
                    font-size: 0.8rem;
                }
                .track-art {
                    width: 40px;
                    height: 40px;
                    border-radius: 4px;
                    object-fit: cover;
                }
                .track-info {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                }
                .track-name {
                    font-weight: 600;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .track-artist {
                    font-size: 0.8rem;
                    color: var(--orange-primary);
                }
                .track-score {
                    font-weight: 700;
                    min-width: 40px;
                    text-align: right;
                }
                .track-score.pos { color: #22c55e; }
                .track-score.neg { color: #ef4444; }

                /* ── DESTINATION CARDS ────────────────────────────── */
                .export-destinations {
                    margin-top: 28px;
                }
                .destinations-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    margin-bottom: 16px;
                    color: var(--text-primary);
                    text-align: center;
                }
                .destination-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 20px 24px;
                    margin-bottom: 12px;
                    transition: all 0.3s ease;
                }
                .destination-card:hover {
                    border-color: var(--border-color);
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                }
                .spotify-card:hover {
                    border-color: rgba(29, 185, 84, 0.4);
                }
                .tidal-card:hover {
                    border-color: rgba(0, 255, 255, 0.4);
                }
                .destination-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 14px;
                }
                .destination-name {
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }
                .new-badge {
                    font-size: 0.6rem;
                    font-weight: 800;
                    letter-spacing: 1px;
                    background: linear-gradient(135deg, #00FFFF, #0080FF);
                    color: #000;
                    padding: 3px 8px;
                    border-radius: 20px;
                    text-transform: uppercase;
                }
                .destination-auth {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .connected-as {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                .connected-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                    animation: pulse-dot 2s ease-in-out infinite;
                }
                @keyframes pulse-dot {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .disconnect-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    font-size: 0.75rem;
                    text-decoration: underline;
                    padding: 2px 6px;
                    margin-left: auto;
                }
                .disconnect-btn:hover {
                    color: var(--text-primary);
                }
                .export-action-btn {
                    padding: 12px 24px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    border: none;
                    border-radius: 50px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: white;
                    width: 100%;
                }
                .spotify-action {
                    background: #1DB954;
                }
                .spotify-action:hover:not(:disabled) {
                    background: #1ed760;
                    transform: scale(1.02);
                    box-shadow: 0 4px 16px rgba(29, 185, 84, 0.4);
                }
                .tidal-action {
                    background: linear-gradient(135deg, #00FFFF, #0080FF);
                    color: #000;
                    font-weight: 700;
                }
                .tidal-action:hover:not(:disabled) {
                    transform: scale(1.02);
                    box-shadow: 0 4px 16px rgba(0, 255, 255, 0.4);
                }
                .export-action-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .connect-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 12px 24px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    border: 1px solid var(--border-color);
                    border-radius: 50px;
                    cursor: pointer;
                    transition: all 0.2s;
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }
                .spotify-connect:hover {
                    border-color: #1DB954;
                    color: #1DB954;
                    background: rgba(29, 185, 84, 0.1);
                }
                .tidal-connect:hover {
                    border-color: #00FFFF;
                    color: #00FFFF;
                    background: rgba(0, 255, 255, 0.1);
                }
                .destination-loading {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: var(--text-muted);
                    font-size: 0.85rem;
                }
                .mini-spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid var(--bg-tertiary);
                    border-top-color: #1DB954;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                /* ── CRATE HACKERS CARD ─────────────────────── */
                .crate-hackers-card {
                    border: 1px solid rgba(211, 119, 29, 0.35);
                    background: linear-gradient(135deg, rgba(211, 119, 29, 0.08) 0%, var(--bg-secondary) 60%);
                    position: relative;
                    overflow: hidden;
                }
                .crate-hackers-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, #d3771d, #e0a030, #d3771d);
                    opacity: 0.8;
                }
                .crate-hackers-card:hover {
                    border-color: rgba(211, 119, 29, 0.6);
                    box-shadow: 0 4px 24px rgba(211, 119, 29, 0.2);
                }
                .crate-hackers-card.synced {
                    border-color: rgba(211, 119, 29, 0.5);
                }
                .ch-card-logo {
                    width: 28px;
                    height: 28px;
                    object-fit: contain;
                }
                .home-badge {
                    font-size: 0.55rem;
                    font-weight: 800;
                    letter-spacing: 1.5px;
                    background: linear-gradient(135deg, #d3771d, #e0a030);
                    color: #000;
                    padding: 3px 8px;
                    border-radius: 20px;
                    text-transform: uppercase;
                }
                .ch-action {
                    background: linear-gradient(135deg, #d3771d 0%, #e0a030 100%);
                    color: #000;
                    font-weight: 700;
                    text-decoration: none;
                    text-align: center;
                    display: block;
                }
                .ch-action:hover:not(:disabled) {
                    transform: scale(1.02);
                    box-shadow: 0 4px 20px rgba(211, 119, 29, 0.45);
                    background: linear-gradient(135deg, #e0a030 0%, #d3771d 100%);
                }
                .ch-syncing {
                    color: #d3771d;
                    font-weight: 500;
                }
                .ch-synced-msg span:last-child {
                    color: #d3771d;
                    font-weight: 600;
                }
            `}</style>
        </div>
    );
}

// ─── TIDAL SVG Icon Component ───────────────────────────────────────────────
function TidalIcon({ size = 24 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="#00FFFF">
            <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996 4.004 12l4.004-4.004L12.012 12l4.004-4.004L12.012 3.992zM12.012 12.004l-4.004 4.004L12.012 20.012l4.004-4.004-4.004-4.004z" />
            <path d="M20.02 3.992l-4.004 4.004L20.02 12l4.004-4.004L20.02 3.992z" />
        </svg>
    );
}
