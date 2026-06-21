'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './DanceGame.css';

export interface DanceWheelEntry {
    songId: string;
    name: string;
    artist: string;
    albumArt: string;
    previewUrl?: string;
}

export interface DanceAudioCue {
    cueId: string;
    songId: string;
    songName: string;
    artistName: string;
    albumArt: string;
    previewUrl: string;
    startedAt: number;
    durationMs: number;
}

export interface DanceGameState {
    active: boolean;
    phase: 'lobby' | 'playing';
    wheel: DanceWheelEntry[];
    landedIndex: number | null;
    landedSongId: string | null;
    spinId: string | null;
    spinDurationMs: number;
    audioCue: DanceAudioCue | null;
    round: number;
    startedAt: number;
}

interface DanceGameProps {
    state: DanceGameState;
}

const AUDIO_OPT_IN_KEY = 'crate-dance-game-audio-opt-in';

// Vibrant slice palette that loops around the wheel
const SLICE_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
    '#d946ef', '#ec4899', '#f43f5e', '#fb7185',
];

export default function DanceGame({ state }: DanceGameProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const audioStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCueIdRef = useRef<string | null>(null);
    const rotationRef = useRef(0);
    const lastSpinIdRef = useRef<string | null>(null);

    const [audioEnabled, setAudioEnabled] = useState(false);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [isSpinning, setIsSpinning] = useState(false);
    const [clipRemaining, setClipRemaining] = useState(0);

    const wheel = state.wheel || [];
    const sliceCount = wheel.length || 1;
    const sliceAngle = 360 / sliceCount;

    // ── Spin animation: retrigger whenever spinId changes ──────────────────────
    useEffect(() => {
        if (!state.spinId || state.landedIndex === null) return;
        if (lastSpinIdRef.current === state.spinId) return;
        lastSpinIdRef.current = state.spinId;

        const pointerOffset = state.landedIndex * sliceAngle + sliceAngle / 2;
        const current = rotationRef.current;
        const currentMod = ((current % 360) + 360) % 360;
        const desiredMod = ((360 - pointerOffset) % 360 + 360) % 360;
        let delta = desiredMod - currentMod;
        if (delta < 0) delta += 360;
        const fullSpins = 6;
        const target = current + fullSpins * 360 + delta;

        rotationRef.current = target;
        setRotation(target);
        setIsSpinning(true);

        const settleTimer = setTimeout(() => setIsSpinning(false), state.spinDurationMs);
        return () => clearTimeout(settleTimer);
    }, [state.spinId, state.landedIndex, sliceAngle, state.spinDurationMs]);

    // ── Audio playback ─────────────────────────────────────────────────────────
    const stopClip = useCallback(() => {
        if (audioStopTimeoutRef.current) {
            clearTimeout(audioStopTimeoutRef.current);
            audioStopTimeoutRef.current = null;
        }
        if (audioStartTimeoutRef.current) {
            clearTimeout(audioStartTimeoutRef.current);
            audioStartTimeoutRef.current = null;
        }
        if (audioRef.current) {
            try {
                audioRef.current.pause();
                audioRef.current.src = '';
            } catch {
                // element may already be gone
            }
            audioRef.current = null;
        }
    }, []);

    const playClip = useCallback((cue: DanceAudioCue) => {
        stopClip();

        const begin = () => {
            const elapsedMs = Math.max(0, Date.now() - cue.startedAt);
            const remainingMs = Math.max(0, cue.durationMs - elapsedMs);
            if (remainingMs <= 0) return;

            try {
                const audio = new Audio(cue.previewUrl);
                audio.volume = 0.9;
                audioRef.current = audio;
                if (elapsedMs > 1000) {
                    audio.currentTime = elapsedMs / 1000;
                }
                audio.play().catch(() => {
                    stopClip();
                    setAudioEnabled(false);
                    setAudioBlocked(true);
                    try {
                        localStorage.setItem(AUDIO_OPT_IN_KEY, 'false');
                    } catch {
                        // ignore
                    }
                });
                audioStopTimeoutRef.current = setTimeout(stopClip, remainingMs);
                audio.addEventListener('ended', stopClip);
            } catch {
                stopClip();
            }
        };

        const delay = cue.startedAt - Date.now();
        if (delay > 0) {
            audioStartTimeoutRef.current = setTimeout(begin, delay);
        } else {
            begin();
        }
    }, [stopClip]);

    useEffect(() => {
        try {
            setAudioEnabled(localStorage.getItem(AUDIO_OPT_IN_KEY) === 'true');
        } catch {
            setAudioEnabled(false);
        }
    }, []);

    useEffect(() => {
        const cue = state.audioCue;
        if (!state.active || !cue) {
            lastCueIdRef.current = null;
            stopClip();
            return;
        }
        if (lastCueIdRef.current === cue.cueId) return;
        lastCueIdRef.current = cue.cueId;

        if (!audioEnabled) {
            stopClip();
            return;
        }
        playClip(cue);
    }, [audioEnabled, playClip, state.active, state.audioCue, stopClip]);

    // ── 10-second clip countdown ────────────────────────────────────────────────
    useEffect(() => {
        const cue = state.audioCue;
        if (!cue) {
            setClipRemaining(0);
            return;
        }
        const tick = () => {
            const endsAt = cue.startedAt + cue.durationMs;
            const remaining = Math.max(0, endsAt - Date.now());
            setClipRemaining(remaining);
        };
        tick();
        const interval = setInterval(tick, 200);
        return () => clearInterval(interval);
    }, [state.audioCue]);

    useEffect(() => () => stopClip(), [stopClip]);

    const handleEnableAudio = () => {
        setAudioEnabled(true);
        setAudioBlocked(false);
        try {
            localStorage.setItem(AUDIO_OPT_IN_KEY, 'true');
        } catch {
            // ignore
        }
        if (state.audioCue) {
            lastCueIdRef.current = state.audioCue.cueId;
            playClip(state.audioCue);
        }
    };

    const landedSong = useMemo(() => {
        if (state.landedIndex === null) return null;
        return wheel[state.landedIndex] || null;
    }, [state.landedIndex, wheel]);

    // Wheel background: conic-gradient stripes
    const wheelBackground = useMemo(() => {
        if (sliceCount <= 1) return SLICE_COLORS[0];
        const stops = wheel.map((_, i) => {
            const color = SLICE_COLORS[i % SLICE_COLORS.length];
            const start = (i * sliceAngle).toFixed(3);
            const end = ((i + 1) * sliceAngle).toFixed(3);
            return `${color} ${start}deg ${end}deg`;
        });
        return `conic-gradient(${stops.join(', ')})`;
    }, [wheel, sliceAngle, sliceCount]);

    if (!state.active) return null;

    const clipSeconds = Math.ceil(clipRemaining / 1000);
    const isClipLive = clipRemaining > 0 && !isSpinning;

    return (
        <div className="dance-game-overlay">
            <div className="dance-game-stage">
                <header className="dg-header">
                    <span className="dg-kicker">Crate Hackers Party Game</span>
                    <h1 className="dg-title">Can You Dance To It?</h1>
                    <p className="dg-tagline">
                        {state.phase === 'lobby'
                            ? 'Get ready. The wheel is about to spin.'
                            : isSpinning
                                ? 'Spinning the crate...'
                                : isClipLive
                                    ? 'GET UP AND DANCE!'
                                    : 'Did you dance? Prizes for the movers!'}
                    </p>
                </header>

                <div className="dg-wheel-zone">
                    <div className="dg-pointer" aria-hidden="true" />
                    <div
                        className="dg-wheel"
                        style={{
                            background: wheelBackground,
                            transform: `rotate(${rotation}deg)`,
                            transition: isSpinning
                                ? `transform ${state.spinDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`
                                : 'none',
                        }}
                    >
                        {wheel.map((entry, i) => {
                            const labelAngle = i * sliceAngle + sliceAngle / 2;
                            return (
                                <div
                                    key={`${entry.songId}-${i}`}
                                    className="dg-slice-label"
                                    style={{ transform: `rotate(${labelAngle}deg)` }}
                                >
                                    <span className="dg-slice-text">
                                        {entry.name}
                                    </span>
                                </div>
                            );
                        })}
                        <div className="dg-wheel-hub">
                            <span>♪</span>
                        </div>
                    </div>
                </div>

                {/* Landed song reveal */}
                {state.phase === 'playing' && landedSong && !isSpinning && (
                    <div className={`dg-reveal ${isClipLive ? 'live' : ''}`}>
                        {landedSong.albumArt ? (
                            <img className="dg-reveal-art" src={landedSong.albumArt} alt="" />
                        ) : (
                            <div className="dg-reveal-art dg-reveal-art-ph">♪</div>
                        )}
                        <div className="dg-reveal-info">
                            <div className="dg-reveal-song">{landedSong.name}</div>
                            <div className="dg-reveal-artist">{landedSong.artist}</div>
                        </div>
                        {isClipLive && (
                            <div className="dg-clip-timer" aria-label={`${clipSeconds} seconds left`}>
                                <span>{clipSeconds}</span>
                                <small>DANCE</small>
                            </div>
                        )}
                    </div>
                )}

                {state.phase === 'lobby' && (
                    <div className="dg-lobby-note">
                        {wheel.length} songs loaded · Waiting for the host to spin
                    </div>
                )}

                {/* Audio opt-in */}
                <div className={`dg-audio-consent ${audioEnabled ? 'enabled' : ''}`}>
                    {!audioEnabled ? (
                        <>
                            <div>
                                <strong>Turn on the music</strong>
                                <span>
                                    {audioBlocked
                                        ? 'Browser blocked audio. Tap again to enable the clips.'
                                        : 'Tap once. When the wheel lands, you will hear the 10-second clip.'}
                                </span>
                            </div>
                            <button type="button" onClick={handleEnableAudio}>
                                Tap To Hear The Music
                            </button>
                        </>
                    ) : (
                        <div>
                            <strong>Sound is on.</strong>
                            <span>Stay on this screen. The clip plays the moment the wheel lands.</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
