'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getGameAudioContext, useGameSound } from '@/lib/game-sound';
import { serverNow, syncServerClock, ensureClockFresh } from '@/lib/server-clock';
import {
    prefetchClips,
    getDecodedClip,
    decodeClip,
    scheduleClip,
    type ClipHandle,
} from '@/lib/synced-clip-player';
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
    // Web Audio playback (sample-accurate, scheduled on the shared clock)
    const clipHandleRef = useRef<ClipHandle | null>(null);
    // HTMLAudio fallback (only if a clip can't be decoded on this browser)
    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const audioStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const audioStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Bumped on every stop/replay so stale async decodes can't start late
    const playTokenRef = useRef(0);
    const lastCueIdRef = useRef<string | null>(null);
    const rotationRef = useRef(0);
    const lastSpinIdRef = useRef<string | null>(null);
    const currentCueRef = useRef<DanceAudioCue | null>(null);

    // Shared, app-wide game sound: ON by default, one mute for every game.
    const { soundOn, unlocked, toggleMuted } = useGameSound();
    const [needsTap, setNeedsTap] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [isSpinning, setIsSpinning] = useState(false);
    const [clipRemaining, setClipRemaining] = useState(0);
    // True once real audio has actually played this session — gates the Mute button
    // so it only appears after the music is genuinely coming out of the speaker.
    const [hasAudioStarted, setHasAudioStarted] = useState(false);

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
        // Invalidate any in-flight async start (decode that hasn't fired yet).
        playTokenRef.current += 1;
        if (audioStopTimeoutRef.current) {
            clearTimeout(audioStopTimeoutRef.current);
            audioStopTimeoutRef.current = null;
        }
        if (audioStartTimeoutRef.current) {
            clearTimeout(audioStartTimeoutRef.current);
            audioStartTimeoutRef.current = null;
        }
        if (clipHandleRef.current) {
            clipHandleRef.current.stop();
            clipHandleRef.current = null;
        }
        if (audioElRef.current) {
            try {
                audioElRef.current.pause();
                audioElRef.current.src = '';
            } catch {
                // element may already be gone
            }
            audioElRef.current = null;
        }
    }, []);

    // Last-resort path for browsers that can't decode the clip into Web Audio.
    // Still scheduled on the shared clock so it lands close to everyone else.
    const fallbackHtmlAudio = useCallback((cue: DanceAudioCue, token: number) => {
        const begin = () => {
            if (token !== playTokenRef.current) return;
            const elapsedMs = Math.max(0, serverNow() - cue.startedAt);
            const remainingMs = cue.durationMs - elapsedMs;
            if (remainingMs <= 0) return;
            try {
                const audio = new Audio(cue.previewUrl);
                audio.volume = 0.9;
                audioElRef.current = audio;
                if (elapsedMs > 250) audio.currentTime = elapsedMs / 1000;
                audio.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
                audioStopTimeoutRef.current = setTimeout(stopClip, remainingMs);
                audio.addEventListener('ended', stopClip);
            } catch {
                stopClip();
            }
        };

        const delay = cue.startedAt - serverNow();
        if (delay > 0) {
            audioStartTimeoutRef.current = setTimeout(begin, delay);
        } else {
            begin();
        }
    }, [stopClip]);

    const playClip = useCallback((cue: DanceAudioCue) => {
        stopClip();
        const token = playTokenRef.current;

        const ctx = getGameAudioContext();
        // Audio can't run until the viewer has tapped once. Flag it; the unlock
        // handler below will retry this same cue after the gesture.
        if (!ctx || ctx.state !== 'running') {
            setNeedsTap(true);
            return;
        }

        const startWebAudio = (buffer: AudioBuffer): boolean => {
            if (token !== playTokenRef.current) return true; // superseded by a newer cue
            const handle = scheduleClip({
                buffer,
                startAtServerMs: cue.startedAt,
                serverNowMs: serverNow(),
                durationMs: cue.durationMs,
                volume: 0.9,
            });
            if (handle) {
                clipHandleRef.current = handle;
                setNeedsTap(false);
                return true;
            }
            return false;
        };

        // Best case: prefetched + already decoded → schedule instantly.
        const decoded = getDecodedClip(cue.previewUrl);
        if (decoded && startWebAudio(decoded)) return;

        // Otherwise decode now (bytes are usually already prefetched, so this is
        // just CPU work and finishes well inside the ~5s wheel spin).
        decodeClip(cue.previewUrl).then(buffer => {
            if (token !== playTokenRef.current) return;
            if (buffer && getGameAudioContext()?.state === 'running' && startWebAudio(buffer)) return;
            fallbackHtmlAudio(cue, token);
        });
    }, [stopClip, fallbackHtmlAudio]);

    // ── Shared clock: keep this device's offset from the server fresh ───────────
    useEffect(() => {
        void syncServerClock();
        const onWake = () => {
            if (document.visibilityState === 'visible') void syncServerClock(3);
        };
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onWake);
        const interval = setInterval(() => ensureClockFresh(30000), 10000);
        return () => {
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', onWake);
            clearInterval(interval);
        };
    }, []);

    // ── Prefetch every wheel clip's bytes while active so the landed one is ready ─
    const wheelPreviewKey = useMemo(
        () => (state.wheel || []).map(w => w.previewUrl).join('|'),
        [state.wheel],
    );
    useEffect(() => {
        if (!state.active) return;
        prefetchClips(wheelPreviewKey.split('|').filter(Boolean));
    }, [state.active, wheelPreviewKey]);

    // If a clip was blocked (no interaction yet), retry it on the next tap/keypress.
    useEffect(() => {
        const unlock = () => {
            const ctx = getGameAudioContext();
            const proceed = () => {
                if (!needsTapRef.current) return;
                const cue = currentCueRef.current;
                if (soundOnRef.current && cue && serverNow() < cue.startedAt + cue.durationMs) {
                    lastCueIdRef.current = cue.cueId;
                    playClip(cue);
                }
                setNeedsTap(false);
            };
            // Resuming the audio context is async — wait for it before scheduling.
            if (ctx && ctx.state !== 'running') {
                ctx.resume().then(proceed).catch(proceed);
            } else {
                proceed();
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
            if (cue && serverNow() < cue.startedAt + cue.durationMs) {
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
            const remaining = Math.max(0, endsAt - serverNow());
            setClipRemaining(remaining);
        };
        tick();
        const interval = setInterval(tick, 200);
        return () => clearInterval(interval);
    }, [state.audioCue]);

    useEffect(() => () => stopClip(), [stopClip]);

    // Flip "audio has started" the moment a clip is actually live + unblocked.
    // This is what reveals the Mute button, so the control matches reality.
    useEffect(() => {
        const clipLive = clipRemaining > 0 && !isSpinning;
        if (soundOn && !needsTap && clipLive) setHasAudioStarted(true);
    }, [soundOn, needsTap, clipRemaining, isSpinning]);

    // Reset when the game ends so the next session starts fresh.
    useEffect(() => {
        if (!state.active) setHasAudioStarted(false);
    }, [state.active]);

    const toggleSound = () => {
        if (!soundOn) setNeedsTap(false);
        toggleMuted();
    };

    // Explicit "turn on sound" button for the pre-playback prompt. Tapping anywhere
    // also unlocks audio (global listener), but a real button is clearer for guests.
    const enableSound = () => {
        const ctx = getGameAudioContext();
        const proceed = () => {
            setNeedsTap(false);
            const cue = currentCueRef.current;
            if (soundOn && cue && serverNow() < cue.startedAt + cue.durationMs) {
                lastCueIdRef.current = cue.cueId;
                playClip(cue);
            }
        };
        if (ctx && ctx.state !== 'running') {
            ctx.resume().then(proceed).catch(proceed);
        } else {
            proceed();
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

                {/* Sound bar tells the truth about what's happening:
                    1) muted        → Unmute
                    2) playing/ready → Sound on + Mute (only after audio is real)
                    3) blocked       → big "Turn on sound" prompt (no Mute yet) */}
                {!soundOn ? (
                    <div className="dg-audio-consent muted">
                        <div>
                            <strong>🔇 Muted</strong>
                            <span>Music is muted on this device only.</span>
                        </div>
                        <button type="button" onClick={toggleSound}>Unmute</button>
                    </div>
                ) : hasAudioStarted || unlocked ? (
                    <div className="dg-audio-consent enabled">
                        <div>
                            <strong>🔊 Sound on</strong>
                            <span>Everyone hears the clips together. Mute to silence just your device.</span>
                        </div>
                        <button type="button" onClick={toggleSound}>Mute</button>
                    </div>
                ) : (
                    <button type="button" className="dg-audio-enable" onClick={enableSound}>
                        <span className="dg-audio-enable-icon">🔊</span>
                        <span className="dg-audio-enable-text">
                            <strong>Tap to turn on sound</strong>
                            <small>So you can hear the clips and dance along</small>
                        </span>
                    </button>
                )}
            </div>
        </div>
    );
}
