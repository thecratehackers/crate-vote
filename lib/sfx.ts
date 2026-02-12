/**
 * 🔊 JUKEBOX SFX ENGINE
 * Synthesized sound effects using Web Audio API
 * Inspired by: arcade games, slot machines, VH1 Pop-Up Video
 * 
 * All sounds are generated in real-time — zero external files.
 * Designed to be satisfying but never annoying.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
    if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Master volume (0-1) — keep it subtle
const MASTER_VOL = 0.15;

function gain(ctx: AudioContext, volume: number = MASTER_VOL): GainNode {
    const g = ctx.createGain();
    g.gain.value = volume * MASTER_VOL;
    g.connect(ctx.destination);
    return g;
}

// ═══════════════════════════════════════════
// 🎵 VOTE UP — satisfying "cha-ching" coin drop
// ═══════════════════════════════════════════
function voteUp() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;

        // Bright metallic "ting" — two quick ascending tones
        [880, 1320].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const g = gain(ctx, 0.6);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.15);
            osc.connect(g);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.15);
        });

        // Subtle shimmer
        const shimmer = ctx.createOscillator();
        const sg = gain(ctx, 0.15);
        shimmer.type = 'triangle';
        shimmer.frequency.setValueAtTime(2640, now);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        shimmer.connect(sg);
        shimmer.start(now + 0.05);
        shimmer.stop(now + 0.25);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 👎 VOTE DOWN — quick descending "boop"
// ═══════════════════════════════════════════
function voteDown() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = gain(ctx, 0.5);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.2);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 🎰 NEW SONG ADDED — slot machine "winner" jingle
// ═══════════════════════════════════════════
function newSong() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;

        // Ascending arpeggio — C E G C (major chord run-up)
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const g = gain(ctx, 0.5);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.09);
            g.gain.setValueAtTime(0.5 * MASTER_VOL, now + i * 0.09);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.2);
            osc.connect(g);
            osc.start(now + i * 0.09);
            osc.stop(now + i * 0.09 + 0.2);
        });

        // Sparkle on top
        const sparkle = ctx.createOscillator();
        const sg = gain(ctx, 0.2);
        sparkle.type = 'sine';
        sparkle.frequency.setValueAtTime(2093, now + 0.35);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        sparkle.connect(sg);
        sparkle.start(now + 0.35);
        sparkle.stop(now + 0.6);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 💡 POP — VH1 Pop-Up Video style info bubble
// ═══════════════════════════════════════════
function pop() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;

        // Quick "bloop" — rising bubble
        const osc = ctx.createOscillator();
        const g = gain(ctx, 0.5);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.15);

        // Tiny "tick" on top
        const tick = ctx.createOscillator();
        const tg = gain(ctx, 0.25);
        tick.type = 'square';
        tick.frequency.setValueAtTime(1800, now + 0.04);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        tick.connect(tg);
        tick.start(now + 0.04);
        tick.stop(now + 0.1);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 🎵 SKIP / NEXT SONG — vinyl scratch whoosh
// ═══════════════════════════════════════════
function skip() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;

        // Quick descending sweep (vinyl scratch feel)
        const osc = ctx.createOscillator();
        const g = gain(ctx, 0.4);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.2);

        // White noise burst (record scratch texture)
        const bufferSize = ctx.sampleRate * 0.1;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const ng = gain(ctx, 0.15);
        noise.connect(ng);
        noise.start(now);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 🏆 LEVEL UP — achievement unlocked chime
// ═══════════════════════════════════════════
function levelUp() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;

        // Triumphant two-note fanfare
        const notes = [
            { freq: 784, time: 0, dur: 0.2 },     // G5
            { freq: 1047, time: 0.15, dur: 0.35 }, // C6 (hold longer)
        ];
        notes.forEach(({ freq, time, dur }) => {
            const osc = ctx.createOscillator();
            const g = gain(ctx, 0.5);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + time);
            g.gain.setValueAtTime(0.5 * MASTER_VOL, now + time);
            g.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
            osc.connect(g);
            osc.start(now + time);
            osc.stop(now + time + dur + 0.01);
        });

        // Harmonic shimmer
        const harm = ctx.createOscillator();
        const hg = gain(ctx, 0.12);
        harm.type = 'triangle';
        harm.frequency.setValueAtTime(2093, now + 0.15);
        hg.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        harm.connect(hg);
        harm.start(now + 0.15);
        harm.stop(now + 0.55);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 💰 COIN — Mario-style karma coin
// ═══════════════════════════════════════════
function coin() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = gain(ctx, 0.4);
        osc.type = 'square';
        osc.frequency.setValueAtTime(988, now);      // B5
        osc.frequency.setValueAtTime(1319, now + 0.08); // E6
        g.gain.setValueAtTime(0.4 * MASTER_VOL, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 🌊 WHOOSH — transition swoosh
// ═══════════════════════════════════════════
function whoosh() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;

        // Filtered noise sweep
        const bufferSize = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const env = Math.sin((i / bufferSize) * Math.PI); // bell curve
            data[i] = (Math.random() * 2 - 1) * env;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(200, now);
        filter.frequency.exponentialRampToValueAtTime(4000, now + 0.12);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.25);
        filter.Q.value = 2;

        const g = gain(ctx, 0.3);
        noise.connect(filter);
        filter.connect(g);
        noise.start(now);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// ⏱️ TICK — subtle countdown tick
// ═══════════════════════════════════════════
function tick() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = gain(ctx, 0.2);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.05);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 🎲 REVEAL — dramatic reveal / song fact appears
// ═══════════════════════════════════════════
function reveal() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;

        // Magical ascending sweep
        const osc = ctx.createOscillator();
        const g = gain(ctx, 0.35);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
        g.gain.setValueAtTime(0.35 * MASTER_VOL, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.4);

        // Sparkle overlay
        const sp = ctx.createOscillator();
        const sg = gain(ctx, 0.15);
        sp.type = 'triangle';
        sp.frequency.setValueAtTime(2400, now + 0.15);
        sp.frequency.exponentialRampToValueAtTime(3200, now + 0.3);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        sp.connect(sg);
        sp.start(now + 0.15);
        sp.stop(now + 0.45);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 🔔 NOTIFY — gentle notification ping
// ═══════════════════════════════════════════
function notify() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = gain(ctx, 0.35);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1047, now); // C6
        g.gain.setValueAtTime(0.35 * MASTER_VOL, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g);
        osc.start(now);
        osc.stop(now + 0.35);
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// 🎰 SLOT PULL — slot machine reel spin
// ═══════════════════════════════════════════
function slotPull() {
    try {
        const ctx = getCtx();
        const now = ctx.currentTime;

        // Mechanical click
        const click = ctx.createOscillator();
        const cg = gain(ctx, 0.4);
        click.type = 'square';
        click.frequency.setValueAtTime(150, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        click.connect(cg);
        click.start(now);
        click.stop(now + 0.05);

        // Spinning reel sound — repeating clicks fading out
        for (let i = 0; i < 8; i++) {
            const t = now + 0.05 + i * 0.04;
            const reel = ctx.createOscillator();
            const rg = gain(ctx, 0.2 * (1 - i / 8));
            reel.type = 'square';
            reel.frequency.setValueAtTime(300 + i * 30, t);
            rg.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
            reel.connect(rg);
            reel.start(t);
            reel.stop(t + 0.03);
        }
    } catch (e) { /* Audio not available */ }
}

// ═══════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════
export const sfx = {
    voteUp,
    voteDown,
    newSong,
    pop,
    skip,
    levelUp,
    coin,
    whoosh,
    tick,
    reveal,
    notify,
    slotPull,
};

export default sfx;
