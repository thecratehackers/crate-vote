'use client';

/**
 * 🔊 SHARED GAME AUDIO CONTROLLER
 *
 * One place that governs browser sound for the GAMES ONLY:
 *   - Can You Dance To It? (dance clips + wheel ticks)
 *   - 1s and 0s (artist preview clips)
 *   - Prize drops + all synthesized game SFX (lib/sounds.ts)
 *
 * Rules:
 *   - Sound defaults ON. The whole room hears it together.
 *   - It unlocks on the FIRST interaction anywhere on the page (tap, click, or
 *     typing into a field) — browsers require a user gesture before audio plays.
 *   - A single per-device Mute toggle silences all game sound.
 *
 * NOT covered here on purpose: the live stream / YouTube / music videos. Those
 * stay muted-by-default and are controlled separately so they never blast a
 * mobile crowd.
 */

import { useCallback, useEffect, useState } from 'react';

const MUTED_KEY = 'crate-game-sound-muted';

let sharedCtx: AudioContext | null = null;
let unlocked = false;
let listenersAttached = false;
const subscribers = new Set<() => void>();

function notify(): void {
    subscribers.forEach(fn => {
        try {
            fn();
        } catch {
            /* ignore subscriber errors */
        }
    });
}

/** Shared AudioContext for all synthesized game sound. Created/resumed lazily. */
export function getGameAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedCtx || sharedCtx.state === 'closed') {
        try {
            sharedCtx = new Ctor();
        } catch {
            return null;
        }
    }
    if (sharedCtx.state === 'suspended') {
        sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
}

/** Has the viewer interacted yet (so audio is allowed to play)? */
export function isGameAudioUnlocked(): boolean {
    return unlocked;
}

export function isGameSoundMuted(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(MUTED_KEY) === 'true';
    } catch {
        return false;
    }
}

/** Sound is ON unless the viewer explicitly muted this device. */
export function isGameSoundOn(): boolean {
    return !isGameSoundMuted();
}

export function setGameSoundMuted(muted: boolean): void {
    try {
        window.localStorage.setItem(MUTED_KEY, muted ? 'true' : 'false');
    } catch {
        /* ignore storage failures */
    }
    if (!muted) getGameAudioContext();
    notify();
}

export function subscribeGameSound(fn: () => void): () => void {
    subscribers.add(fn);
    return () => {
        subscribers.delete(fn);
    };
}

/**
 * Attach one-time global listeners that unlock game audio the moment the viewer
 * interacts with the page (tap/click anywhere or type into a field). Idempotent.
 */
export function initGameAudioUnlock(): void {
    if (typeof window === 'undefined' || listenersAttached) return;
    listenersAttached = true;

    const onInteract = () => {
        getGameAudioContext(); // create/resume on the user gesture
        if (!unlocked) {
            unlocked = true;
            notify();
        }
    };

    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('pointerdown', onInteract, opts);
    window.addEventListener('touchstart', onInteract, opts);
    window.addEventListener('keydown', onInteract, opts);
}

/** React hook for any component that shows a sound toggle or reacts to changes. */
export function useGameSound() {
    const [muted, setMuted] = useState(false);
    const [unlockedState, setUnlockedState] = useState(false);

    useEffect(() => {
        initGameAudioUnlock();
        const sync = () => {
            setMuted(isGameSoundMuted());
            setUnlockedState(isGameAudioUnlocked());
        };
        sync();
        return subscribeGameSound(sync);
    }, []);

    const toggleMuted = useCallback(() => {
        setGameSoundMuted(!isGameSoundMuted());
    }, []);

    return { soundOn: !muted, muted, unlocked: unlockedState, toggleMuted };
}
