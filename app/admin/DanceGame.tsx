'use client';

import { useCallback, useEffect, useState } from 'react';

interface DanceWheelEntry {
    songId: string;
    name: string;
    artist: string;
    albumArt: string;
}

interface DanceAudioCue {
    songName: string;
    artistName: string;
    startedAt: number;
    durationMs: number;
}

interface DanceGameAdminState {
    active: boolean;
    phase: 'lobby' | 'playing';
    wheel: DanceWheelEntry[];
    landedSongId: string | null;
    landedIndex: number | null;
    spinId: string | null;
    spinDurationMs: number;
    audioCue: DanceAudioCue | null;
    round: number;
    startedAt: number;
}

interface DanceGameAdminProps {
    adminKey: string;
    adminId: string;
    onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
}

const viewerRules = [
    'Host starts the game from this tab.',
    'The wheel appears on every voting screen.',
    'Host hits Spin. The wheel lands on one song.',
    'A 10-second clip plays instantly.',
    'Anyone dancing wins — host hands out prizes.',
];

const hostScript =
    'Can you dance to it?! I am about to spin the wheel. When it lands, you get 10 seconds. If you can dance to it, get up and move — movers win prizes.';

const runSteps = [
    'Press Start Game to load the wheel on the big screen.',
    'Tell the room to tap "Tap To Hear The Music" once.',
    'Press Spin The Wheel.',
    'Watch it land and the 10-second clip plays.',
    'Reward whoever is dancing, then Spin again.',
    'Press End Game when you are done.',
];

export default function DanceGame({ adminKey, adminId, onMessage }: DanceGameAdminProps) {
    const [state, setState] = useState<DanceGameAdminState | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isWorking, setIsWorking] = useState(false);

    const fetchState = useCallback(async () => {
        if (!adminKey) return;
        try {
            const res = await fetch('/api/admin/dance-game', {
                headers: {
                    'x-admin-key': adminKey,
                    'x-admin-id': adminId,
                },
            });
            const data = await res.json();
            if (!res.ok) {
                onMessage({ type: 'error', text: data.error || 'Could not load the dance game.' });
                return;
            }
            setState(data);
        } catch {
            onMessage({ type: 'error', text: 'Dance game failed to load — network error.' });
        }
    }, [adminId, adminKey, onMessage]);

    useEffect(() => {
        setIsLoading(true);
        fetchState().finally(() => setIsLoading(false));
        const interval = setInterval(fetchState, 2000);
        return () => clearInterval(interval);
    }, [fetchState]);

    const runAction = async (action: 'start' | 'spin' | 'end', successText: string) => {
        setIsWorking(true);
        try {
            const res = await fetch('/api/admin/dance-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': adminKey,
                    'x-admin-id': adminId,
                },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (!res.ok) {
                onMessage({ type: 'error', text: data.error || 'Action failed.' });
                return;
            }
            if (data.state) setState(data.state);
            onMessage({ type: 'success', text: successText });
            fetchState();
        } catch {
            onMessage({ type: 'error', text: 'Action failed — network error.' });
        } finally {
            setIsWorking(false);
        }
    };

    const isActive = !!state?.active;
    const wheelCount = state?.wheel?.length ?? 0;
    const landed = state?.landedIndex != null ? state?.wheel?.[state.landedIndex] : null;

    return (
        <div className="dance-admin-shell">
            <div className="prize-hq-hero">
                <div>
                    <div className="prize-hq-kicker">Party Game</div>
                    <h2>Can You Dance To It?</h2>
                    <p>
                        Spin a wheel of the current playlist on the big screen. It lands on one song and instantly plays a
                        10-second clip. Whoever dances wins.
                    </p>
                </div>
                <button className="admin-btn admin-btn-sm" onClick={fetchState} disabled={isLoading}>
                    {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            <section className="host-guide-card">
                <div className="host-guide-header">
                    <span>Host Script</span>
                    <h3>How To Run Can You Dance To It?</h3>
                </div>
                <div className="host-guide-grid">
                    <div className="host-guide-block viewer">
                        <h4>What The Room Sees</h4>
                        <ul>
                            {viewerRules.map(rule => (
                                <li key={rule}>{rule}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="host-guide-block script">
                        <h4>Say This</h4>
                        <p>{hostScript}</p>
                    </div>
                    <div className="host-guide-block run">
                        <h4>Step By Step</h4>
                        <ul>
                            {runSteps.map(step => (
                                <li key={step}>{step}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <div className="prize-hq-stats">
                <div className="prize-hq-stat">
                    <span>{isActive ? 'LIVE' : 'OFF'}</span>
                    <strong>Game Status</strong>
                </div>
                <div className="prize-hq-stat">
                    <span>{wheelCount}</span>
                    <strong>Songs On Wheel</strong>
                </div>
                <div className="prize-hq-stat">
                    <span>{state?.round ?? 0}</span>
                    <strong>Spins So Far</strong>
                </div>
            </div>

            {isActive && state?.phase === 'playing' && landed && (
                <div className="dance-admin-landed">
                    <span className="dance-admin-landed-label">Last landed on</span>
                    <strong>{landed.name}</strong>
                    <span className="dance-admin-landed-artist">{landed.artist}</span>
                </div>
            )}

            <section className="dance-admin-controls">
                {!isActive ? (
                    <button
                        className="prize-hq-drop-btn"
                        onClick={() => runAction('start', 'Game started. The wheel is live on the big screen.')}
                        disabled={isWorking}
                    >
                        {isWorking ? 'Starting...' : '▶ Start Game'}
                    </button>
                ) : (
                    <div className="dance-admin-live-buttons">
                        <button
                            className="prize-hq-drop-btn dance-spin-btn"
                            onClick={() => runAction('spin', 'Wheel spinning! Clip plays when it lands.')}
                            disabled={isWorking}
                        >
                            {isWorking ? 'Spinning...' : '🎡 Spin The Wheel'}
                        </button>
                        <button
                            className="admin-btn dance-end-btn"
                            onClick={() => runAction('end', 'Game ended.')}
                            disabled={isWorking}
                        >
                            ⏹ End Game
                        </button>
                    </div>
                )}
            </section>

            {isActive && wheelCount > 0 && (
                <section className="prize-hq-panel">
                    <div className="prize-hq-panel-head">
                        <h3>On The Wheel ({wheelCount})</h3>
                        <p>Songs refresh from the playlist on every spin.</p>
                    </div>
                    <div className="dance-admin-wheel-list">
                        {state!.wheel.map(entry => (
                            <div key={entry.songId} className="dance-admin-wheel-item">
                                {entry.albumArt ? (
                                    <img src={entry.albumArt} alt="" />
                                ) : (
                                    <div className="dance-admin-wheel-ph">♪</div>
                                )}
                                <div>
                                    <strong>{entry.name}</strong>
                                    <span>{entry.artist}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
