/**
 * Sound Effects - Satisfying audio feedback for user actions
 * Uses Web Audio API for low-latency, high-quality sounds
 */
import { persistGet, persistSet } from '@/lib/persist';

// Sound frequencies and patterns for synthesized effects
const SOUNDS = {
    // Upvote - Happy rising tone
    upvote: { freq: [440, 550, 660], duration: 0.12, type: 'sine' as OscillatorType },
    // Downvote - Lower descending tone
    downvote: { freq: [330, 275, 220], duration: 0.15, type: 'triangle' as OscillatorType },
    // Song added - Satisfying pop
    add: { freq: [523, 659, 784], duration: 0.1, type: 'sine' as OscillatorType },
    // Your song hit #1 - Fanfare
    victory: { freq: [523, 659, 784, 1047], duration: 0.3, type: 'sine' as OscillatorType },
    // Battle start - Horn blast
    battle: { freq: [220, 330, 440], duration: 0.25, type: 'sawtooth' as OscillatorType },
    // Karma rain - Magical chime
    karma: { freq: [880, 1100, 1320, 1760], duration: 0.4, type: 'sine' as OscillatorType },
    // Reaction - Quick blip
    reaction: { freq: [660], duration: 0.05, type: 'sine' as OscillatorType },
    // Error - Buzz
    error: { freq: [200, 180], duration: 0.2, type: 'square' as OscillatorType },
    // PURGE ALARM - Dramatic warning horn (low, urgent)
    purge: { freq: [220, 180, 220, 180], duration: 0.3, type: 'sawtooth' as OscillatorType },
    // WIPE SIREN - Descending alarm
    wipe: { freq: [880, 660, 440, 330], duration: 0.25, type: 'square' as OscillatorType },
    // DOUBLE POINTS - Exciting fanfare
    doublePoints: { freq: [440, 554, 659, 880, 1047], duration: 0.2, type: 'sine' as OscillatorType },
    // SHOW CLOCK - Segment transition (ESPN-style sting)
    segmentTransition: { freq: [523, 659, 784, 1047], duration: 0.2, type: 'sine' as OscillatorType },
    // SHOW CLOCK - 2-minute warning (soft chime)
    segmentWarning: { freq: [880, 1100, 880], duration: 0.15, type: 'sine' as OscillatorType },
    // SHOW CLOCK - 30-second urgent (escalating pulse)
    segmentUrgent: { freq: [440, 660, 880, 1100], duration: 0.12, type: 'square' as OscillatorType },

};

let audioContext: AudioContext | null = null;
let soundEnabled = true;

// Initialize audio context on first user interaction (required by browsers)
function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            return null;
        }
    }
    return audioContext;
}

// Play a synthesized sound
function playTone(frequencies: number[], duration: number, type: OscillatorType, volume = 0.15): void {
    if (!soundEnabled) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
        ctx.resume();
    }

    frequencies.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = type;
        oscillator.frequency.value = freq;

        // Fade out for smooth ending
        const startTime = ctx.currentTime + (index * duration * 0.3);
        gainNode.gain.setValueAtTime(volume, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    });
}

// Public API
export const SoundEffects = {
    // Enable/disable sounds
    setEnabled(enabled: boolean): void {
        soundEnabled = enabled;
        persistSet('crate-sounds', enabled ? 'on' : 'off');
    },

    isEnabled(): boolean {
        const saved = persistGet('crate-sounds');
        if (saved !== null) return saved !== 'off';

        // Default: OFF on mobile to avoid unexpected audio
        if (typeof window !== 'undefined' && window.innerWidth <= 640) {
            return false;
        }
        return soundEnabled;
    },

    // Initialize (call on user interaction)
    init(): void {
        getAudioContext();
        soundEnabled = this.isEnabled();
    },

    // Play specific sounds - BOOSTED VOLUMES to stand out over video
    upvote(): void {
        const s = SOUNDS.upvote;
        playTone(s.freq, s.duration, s.type, 0.5);
    },

    downvote(): void {
        const s = SOUNDS.downvote;
        playTone(s.freq, s.duration, s.type, 0.4);
    },

    addSong(): void {
        const s = SOUNDS.add;
        playTone(s.freq, s.duration, s.type, 0.6);
    },

    victory(): void {
        const s = SOUNDS.victory;
        playTone(s.freq, s.duration, s.type, 0.7);
    },

    battleStart(): void {
        const s = SOUNDS.battle;
        playTone(s.freq, s.duration, s.type, 0.6);
    },

    karmaRain(): void {
        const s = SOUNDS.karma;
        playTone(s.freq, s.duration, s.type, 0.6);
    },

    reaction(): void {
        const s = SOUNDS.reaction;
        playTone(s.freq, s.duration, s.type, 0.4);
    },

    error(): void {
        const s = SOUNDS.error;
        playTone(s.freq, s.duration, s.type, 0.3);
    },

    // 💀 THE PURGE - Dramatic alarm
    purgeAlarm(): void {
        const s = SOUNDS.purge;
        playTone(s.freq, s.duration, s.type, 0.8);
    },

    // 💣 WIPE - Descending siren
    wipeAlarm(): void {
        const s = SOUNDS.wipe;
        playTone(s.freq, s.duration, s.type, 0.7);
    },

    // ⚡ DOUBLE POINTS - Exciting fanfare
    doublePoints(): void {
        const s = SOUNDS.doublePoints;
        playTone(s.freq, s.duration, s.type, 0.7);
    },

    // 📺 BROADCAST MODE SOUNDS
    // 🎵 Song request alert - Bright ascending arpeggio
    songRequest(): void {
        playTone([523, 659, 784, 1047], 0.15, 'sine', 0.6);
    },

    // 🚀 Hype burst - Exciting ascending burst
    hypeBurst(): void {
        playTone([440, 660, 880, 1100, 1320], 0.1, 'sine', 0.5);
    },

    // 👀 New viewer joined - Gentle welcome chime
    newViewer(): void {
        playTone([880, 1100], 0.08, 'sine', 0.3);
    },

    // 🏆 Achievement unlock - Game-style fanfare
    achievementUnlock(): void {
        playTone([523, 659, 784, 1047, 1319], 0.2, 'sine', 0.6);
    },

    // 📺 SHOW CLOCK SOUNDS
    // 🎬 Segment transition - ESPN-style broadcast sting
    segmentTransition(): void {
        const s = SOUNDS.segmentTransition;
        playTone(s.freq, s.duration, s.type, 0.7);
    },

    // ⏳ 2-minute warning - Soft time-check chime
    segmentWarning(): void {
        const s = SOUNDS.segmentWarning;
        playTone(s.freq, s.duration, s.type, 0.4);
    },

    // ⚠️ 30-second urgent - Escalating countdown pulse
    segmentUrgent(): void {
        const s = SOUNDS.segmentUrgent;
        playTone(s.freq, s.duration, s.type, 0.6);
    },


};
