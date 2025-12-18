'use client';

import { useState, useEffect } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';

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
    const [tracks, setTracks] = useState<ExportTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasAttemptedExport, setHasAttemptedExport] = useState(false);

    // Fetch the current playlist
    useEffect(() => {
        async function fetchPlaylist() {
            try {
                const res = await fetch('/api/playlist/export');
                const data = await res.json();
                setTracks(data.tracks || []);
            } catch (err) {
                setError('Failed to load playlist');
            } finally {
                setLoading(false);
            }
        }
        fetchPlaylist();
    }, []);

    // Auto-export when returning from Spotify auth
    useEffect(() => {
        if (status === 'authenticated' && session && !loading && tracks.length > 0 && !hasAttemptedExport && !playlistUrl) {
            setHasAttemptedExport(true);
            handleExportAuto();
        }
    }, [status, session, loading, tracks, hasAttemptedExport, playlistUrl]);

    // Export to Spotify (called manually)
    const handleExport = async () => {
        if (!session) {
            signIn('spotify');
            return;
        }
        await doExport();
    };

    // Auto export (called after Spotify auth)
    const handleExportAuto = async () => {
        await doExport();
    };

    // Actual export logic
    const doExport = async () => {
        setExporting(true);
        setError(null);

        try {
            const res = await fetch('/api/playlist/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: `Crate Hackers - ${new Date().toLocaleDateString()}`,
                    description: 'Collaborative playlist created with Crate Hackers',
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Export failed');
            }

            setPlaylistUrl(data.playlistUrl);
        } catch (err: any) {
            setError(err.message || 'Failed to export playlist');
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="export-page">
                <div className="loading">Loading playlist...</div>
            </div>
        );
    }

    if (exporting) {
        return (
            <div className="export-page">
                <div className="exporting-card">
                    <div className="spinner"></div>
                    <h2>Creating your Spotify playlist...</h2>
                    <p>Adding {tracks.length} songs to your library</p>
                </div>
            </div>
        );
    }

    if (playlistUrl) {
        return (
            <div className="export-page">
                <div className="success-card">
                    <img src="/logo.png" alt="Crate Hackers" className="success-logo" />
                    <div className="success-checkmark">✓</div>
                    <h1>Playlist Created!</h1>
                    <p className="success-subtitle">
                        Your {tracks.length}-song playlist has been exported to Spotify
                    </p>
                    <a href={playlistUrl} target="_blank" rel="noopener noreferrer" className="spotify-link">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        Open in Spotify
                    </a>
                    <Link href="/" className="back-link">← Back to voting</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="export-page">
            <header className="export-header">
                <Link href="/" className="back-arrow">←</Link>
                <img src="/logo.png" alt="Hackathon" className="export-logo" />
                <h1>Export to Spotify</h1>
            </header>

            {error && <div className="error-msg">{error}</div>}

            <div className="export-preview">
                <p className="preview-label">{tracks.length} songs (ranked by votes)</p>

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

            <div className="export-actions">
                {status === 'authenticated' && session?.user ? (
                    <div className="auth-info">
                        <div className="logged-in-as">
                            <span className="spotify-icon">🎵</span>
                            <span>Logged in as <strong>{session.user.name || session.user.email}</strong></span>
                            <button onClick={() => signOut()} className="signout-btn">Switch Account</button>
                        </div>
                        <button onClick={handleExport} disabled={exporting || tracks.length === 0} className="export-btn">
                            {exporting ? 'Creating playlist...' : '🎧 Create Spotify Playlist'}
                        </button>
                    </div>
                ) : (
                    <div className="login-prompt">
                        <p className="login-info">Connect your Spotify account to save this playlist</p>
                        <button onClick={() => signIn('spotify', { callbackUrl: '/export' })} className="login-btn">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style={{ marginRight: 8 }}>
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                            </svg>
                            Connect Spotify
                        </button>
                    </div>
                )}
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
                .back-arrow {
                    font-size: 1.5rem;
                    text-decoration: none;
                    color: var(--text-secondary);
                }
                .export-header h1 {
                    font-size: 1.5rem;
                    margin: 0;
                }
                .export-logo {
                    width: 40px;
                    height: 40px;
                    object-fit: contain;
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
                    max-height: 400px;
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
                .export-actions {
                    margin-top: 24px;
                    display: flex;
                    justify-content: center;
                }
                .export-btn, .login-btn {
                    padding: 14px 28px;
                    font-size: 1rem;
                    font-weight: 600;
                    border: none;
                    border-radius: 50px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .export-btn {
                    background: #1DB954;
                    color: white;
                }
                .export-btn:hover:not(:disabled) {
                    background: #1ed760;
                    transform: scale(1.02);
                }
                .export-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .login-btn {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                }
                .login-btn:hover {
                    border-color: #1DB954;
                    color: #1DB954;
                }
                .success-card {
                    text-align: center;
                    padding: 60px 20px;
                }
                .success-logo {
                    width: 80px;
                    height: 80px;
                    object-fit: contain;
                    margin-bottom: 16px;
                }
                .success-checkmark {
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, #1DB954, #1ed760);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 40px;
                    color: white;
                    margin: 0 auto 24px;
                    animation: pop 0.3s ease-out;
                }
                @keyframes pop {
                    0% { transform: scale(0); }
                    80% { transform: scale(1.1); }
                    100% { transform: scale(1); }
                }
                .success-card h1 {
                    font-size: 2rem;
                    margin-bottom: 12px;
                    color: var(--text-primary);
                }
                .success-subtitle {
                    color: var(--text-secondary);
                    margin-bottom: 32px;
                    font-size: 1.1rem;
                }
                .success-card p {
                    color: var(--text-secondary);
                    margin-bottom: 24px;
                }
                .spotify-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    background: #1DB954;
                    color: white;
                    padding: 16px 32px;
                    border-radius: 50px;
                    text-decoration: none;
                    font-weight: 600;
                    font-size: 1.1rem;
                    margin-bottom: 24px;
                    transition: all 0.2s;
                }
                .spotify-link:hover {
                    background: #1ed760;
                    transform: scale(1.02);
                }
                .back-link {
                    display: block;
                    color: var(--text-secondary);
                    text-decoration: none;
                    font-size: 0.95rem;
                }
                .back-link:hover {
                    color: var(--text-primary);
                }
                .auth-info {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    width: 100%;
                    align-items: center;
                }
                .logged-in-as {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: rgba(29, 185, 84, 0.1);
                    border: 1px solid rgba(29, 185, 84, 0.3);
                    border-radius: 8px;
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                }
                .logged-in-as strong {
                    color: #1DB954;
                }
                .signout-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    font-size: 0.8rem;
                    text-decoration: underline;
                    padding: 4px 8px;
                }
                .signout-btn:hover {
                    color: var(--text-primary);
                }
                .login-prompt {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                }
                .login-info {
                    color: var(--text-muted);
                    font-size: 0.9rem;
                    margin: 0;
                }
                .login-btn {
                    background: #1DB954;
                    color: white;
                    border: none;
                    display: inline-flex;
                    align-items: center;
                }
                .login-btn:hover {
                    background: #1ed760;
                }
            `}</style>
        </div>
    );
}
