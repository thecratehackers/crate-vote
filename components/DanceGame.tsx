'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getGameAudioContext, useGameSound } from '@/lib/game-sound';
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

// Crate Hackers brand palette (fire + box) — loops around the wheel
const SLICE_COLORS = [
    '#e09f24', // gold/amber
    '#c94e23', // burnt orange
    '#d3771d', // deep orange
    '#874b23', // dark brown
];

export default function DanceGame({ state }: DanceGameProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const audioStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCueIdRef = useRef<string | null>(null);
    const rotationRef = useRef(0);
    const lastSpinIdRef = useRef<string | null>(null);
    const currentCueRef = useRef<DanceAudioCue | null>(null);

    // Shared, app-wide game sound: ON by default, one mute for every game.
    const { soundOn, toggleMuted } = useGameSound();
    const [needsTap, setNeedsTap] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [isSpinning, setIsSpinning] = useState(false);
    const [clipRemaining, setClipRemaining] = useState(0);

    const soundOnRef = useRef(soundOn);
    soundOnRef.current = soundOn;
    const needsTapRef = useRef(needsTap);
    needsTapRef.current = needsTap;

    const wheel = state.wheel || [];
    const sliceCount = wheel.length || 1;
    const sliceAngle = 360 / sliceCount;

    // ── Spinning sound (synthesized ticks, no asset needed) ─────────────────────
    const playSpinSound = useCallback((durationMs: number, slices: number) => {
        const ctx = getGameAudioContext();
        if (!ctx) return;
        const start = ctx.currentTime;
        const durSec = durationMs / 1000;
        const rotations = 6; // matches the visual full spins
        const totalTicks = Math.max(14, Math.round(rotations * Math.max(slices, 2)));

        for (let k = 1; k <= totalTicks; k++) {
            const f = k / totalTicks;                       // fraction of total rotation
            const t = 1 - Math.pow(1 - f, 1 / 3);           // invert ease-out → ticks slow down
            const when = start + t * durSec;
            const gainVal = 0.05 * (0.45 + 0.55 * (1 - f)); // soften toward the end

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(1050, when);
            gain.gain.setValueAtTime(0.0001, when);
            gain.gain.exponentialRampToValueAtTime(gainVal, when + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(when);
            osc.stop(when + 0.06);
        }
    }, []);

    // ── Spin animation: retrigger whenever spinId changes ──────────────────────
    useEffect(() => {
        if (!state.spinId || state.landedIndex === null) return;
        if (lastSpinIdRef.current === state.spinId) return;
        lastSpinIdRef.current = state.spinId;

        if (soundOn) {
            playSpinSound(state.spinDurationMs, sliceCount);
        }

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
    }, [state.spinId, state.landedIndex, sliceAngle, state.spinDurationMs, sliceCount, soundOn, playSpinSound]);

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
                audio.play().then(() => {
                    setNeedsTap(false);
                }).catch(() => {
                    // Browser blocked autoplay (no interaction yet). Keep sound ON;
                    // the next tap anywhere on the page will start it.
                    setNeedsTap(true);
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

    // If a clip was blocked (no interaction yet), retry it on the next tap/keypress.
    useEffect(() => {
        const unlock = () => {
            getGameAudioContext();
            if (needsTapRef.current) {
                const cue = currentCueRef.current;
                if (soundOnRef.current && cue && Date.now() < cue.startedAt + cue.durationMs) {
                    lastCueIdRef.current = cue.cueId;
                    playClip(cue);
                }
                setNeedsTap(false);
            }
        };
        const opts: AddEventListenerOptions = { passive: true };
        window.addEventListener('pointerdown', unlock, opts);
        window.addEventListener('touchstart', unlock, opts);
        window.addEventListener('keydown', unlock, opts);
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, [playClip]);

    // React to the shared mute toggle: start/stop the current clip immediately.
    useEffect(() => {
        if (soundOn) {
            const cue = currentCueRef.current;
            if (cue && Date.now() < cue.startedAt + cue.durationMs) {
                lastCueIdRef.current = cue.cueId;
                playClip(cue);
            }
        } else {
            stopClip();
        }
    }, [soundOn, playClip, stopClip]);

    useEffect(() => {
        const cue = state.audioCue;
        currentCueRef.current = cue || null;
        if (!state.active || !cue) {
            lastCueIdRef.current = null;
            stopClip();
            return;
        }
        if (lastCueIdRef.current === cue.cueId) return;
        lastCueIdRef.current = cue.cueId;

        if (!soundOn) {
            stopClip();
            return;
        }
        playClip(cue);
    }, [soundOn, playClip, state.active, state.audioCue, stopClip]);

    // ── Clip countdown ──────────────────────────────────────────────────────────
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

    const toggleSound = () => {
        if (!soundOn) setNeedsTap(false);
        toggleMuted();
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
                    </div>
                    {/* Flame logo center — stays upright while the wheel spins */}
                    <div className={`dg-wheel-hub ${isSpinning ? 'spinning' : ''}`}>
                        <img src="/dance-flame.svg" alt="Crate Hackers" />
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

                {/* Sound is ON by default — viewers can mute their own device */}
                <div className={`dg-audio-consent ${soundOn ? 'enabled' : 'muted'}`}>
                    <div>
                        <strong>{soundOn ? '🔊 Sound on' : '🔇 Muted'}</strong>
                        <span>
                            {soundOn
                                ? (needsTap
                                    ? 'Tap anywhere to start the music.'
                                    : 'Everyone hears the clips together. Mute to silence just your device.')
                                : 'Music is muted on this device only.'}
                        </span>
                    </div>
                    <button type="button" onClick={toggleSound}>
                        {soundOn ? 'Mute' : 'Unmute'}
                    </button>
                </div>
            </div>
        </div>
    );
}
