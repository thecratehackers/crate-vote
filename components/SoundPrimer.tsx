'use client';

import { useEffect, useState } from 'react';
import { getGameAudioContext, useGameSound } from '@/lib/game-sound';
import './SoundPrimer.css';

/**
 * 🔊 SOUND PRIMER
 *
 * Browsers block all audio until the visitor interacts once. If a guest is just
 * watching when a game starts, the very first clip gets blocked and they miss it.
 * This floating prompt lets them "arm" their sound ahead of time with one tap, so
 * the first dance clip / game sound plays instantly.
 *
 * It quietly disappears the moment audio is unlocked (a tap here OR anywhere on the
 * page unlocks it), and never shows if the visitor has muted game sound.
 */
export default function SoundPrimer() {
    const { soundOn, unlocked } = useGameSound();
    const [mounted, setMounted] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Only show once we're on the client, sound isn't muted, audio isn't unlocked
    // yet, and the guest hasn't dismissed the nudge.
    if (!mounted || !soundOn || unlocked || dismissed) return null;

    const enable = () => {
        // Resume the audio context inside this user gesture. The global unlock
        // listener (from useGameSound) also fires on this tap and flips `unlocked`,
        // which hides this prompt automatically.
        const ctx = getGameAudioContext();
        if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    };

    return (
        <div className="sound-primer" role="dialog" aria-label="Turn on sound">
            <button type="button" className="sound-primer-main" onClick={enable}>
                <span className="sound-primer-icon" aria-hidden="true">🔊</span>
                <span className="sound-primer-text">
                    <strong>Tap to turn on sound</strong>
                    <small>Hear the clips &amp; games the second they drop</small>
                </span>
            </button>
            <button
                type="button"
                className="sound-primer-dismiss"
                aria-label="Dismiss"
                onClick={() => setDismissed(true)}
            >
                ×
            </button>
        </div>
    );
}
