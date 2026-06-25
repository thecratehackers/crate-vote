'use client';

/**
 * 🔊 SYNCED CLIP PLAYER (Web Audio)
 *
 * Plays short song clips at a precise, shared instant so a whole room hears them
 * "all at once." Two tricks borrowed from Sonos:
 *
 *   1) PREFETCH AHEAD — we download the compressed bytes of every wheel song
 *      during the lobby (cheap, ~1MB each) so there's no network wait at drop time.
 *   2) SCHEDULE ON A SHARED CLOCK — we hand the audio engine an exact start time
 *      (mapped from the synced server clock) instead of "play now," so all devices
 *      fire together regardless of when their poll happened to arrive.
 *
 * Memory note: a DECODED 30s clip is ~10MB of RAM, so decoding all 10 wheel songs
 * would crash phones. We therefore prefetch *bytes* for all, but only DECODE a clip
 * when it's about to play (kept to a tiny LRU). The ~5s wheel spin easily covers
 * the decode.
 */

import { getGameAudioContext } from './game-sound';

// Compressed audio bytes, keyed by URL (small — keep a generous cap).
const byteCache = new Map<string, ArrayBuffer>();
const byteInflight = new Map<string, Promise<ArrayBuffer | null>>();
const BYTE_CACHE_CAP = 14;

// Decoded PCM buffers (big — keep only a few most-recently-used).
const bufferCache = new Map<string, AudioBuffer>();
const decodeInflight = new Map<string, Promise<AudioBuffer | null>>();
const DECODE_CACHE_CAP = 3;

async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
    if (!url) return null;
    const existing = byteCache.get(url);
    if (existing) return existing;
    const pending = byteInflight.get(url);
    if (pending) return pending;

    const p = (async () => {
        try {
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) return null;
            const arr = await res.arrayBuffer();
            byteCache.set(url, arr);
            while (byteCache.size > BYTE_CACHE_CAP) {
                const oldest = byteCache.keys().next().value as string | undefined;
                if (oldest === undefined || oldest === url) break;
                byteCache.delete(oldest);
            }
            return arr;
        } catch {
            return null;
        } finally {
            byteInflight.delete(url);
        }
    })();

    byteInflight.set(url, p);
    return p;
}

/** Start downloading a clip's bytes (no decode yet). Safe to call repeatedly. */
export function prefetchClip(url: string): void {
    if (url) void fetchBytes(url);
}

/** Prefetch a whole wheel's worth of clips. */
export function prefetchClips(urls: string[]): void {
    for (const u of urls) prefetchClip(u);
}

function rememberDecoded(url: string, buffer: AudioBuffer): void {
    bufferCache.delete(url);
    bufferCache.set(url, buffer);
    while (bufferCache.size > DECODE_CACHE_CAP) {
        const oldest = bufferCache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        bufferCache.delete(oldest);
    }
}

/** A clip we've already decoded and can schedule instantly, or null. */
export function getDecodedClip(url: string): AudioBuffer | null {
    return bufferCache.get(url) || null;
}

/** Decode a clip to PCM (using prefetched bytes when available). Cached + deduped. */
export async function decodeClip(url: string): Promise<AudioBuffer | null> {
    if (!url) return null;
    const decoded = bufferCache.get(url);
    if (decoded) return decoded;
    const pending = decodeInflight.get(url);
    if (pending) return pending;

    const ctx = getGameAudioContext();
    if (!ctx) return null;

    const p = (async () => {
        try {
            const bytes = await fetchBytes(url);
            if (!bytes) return null;
            // decodeAudioData detaches the buffer it's given — pass a copy so the
            // prefetched bytes survive for a possible re-decode later.
            const buffer = await ctx.decodeAudioData(bytes.slice(0));
            rememberDecoded(url, buffer);
            return buffer;
        } catch {
            return null;
        } finally {
            decodeInflight.delete(url);
        }
    })();

    decodeInflight.set(url, p);
    return p;
}

export interface ClipHandle {
    stop: () => void;
}

/**
 * Schedule a decoded clip to begin at a shared server instant.
 *
 * - startAtServerMs: the agreed start time (server clock).
 * - serverNowMs: this device's current server-clock reading (from serverNow()).
 * If the start is already in the past, we begin partway in so the device "catches
 * up" to where everyone else is, instead of restarting the clip.
 */
export function scheduleClip(opts: {
    buffer: AudioBuffer;
    startAtServerMs: number;
    serverNowMs: number;
    durationMs: number;
    volume?: number;
}): ClipHandle | null {
    const ctx = getGameAudioContext();
    if (!ctx || ctx.state !== 'running') return null;

    const { buffer, startAtServerMs, serverNowMs, durationMs, volume = 0.9 } = opts;
    const leadMs = startAtServerMs - serverNowMs;
    const offsetMs = leadMs >= 0 ? 0 : -leadMs; // how far into the clip we already are
    if (offsetMs >= durationMs) return null;     // window already elapsed — nothing to play

    const when = ctx.currentTime + Math.max(0, leadMs) / 1000;
    const clipLenMs = buffer.duration * 1000;
    const playLenMs = Math.max(0, Math.min(durationMs - offsetMs, clipLenMs - offsetMs));
    if (playLenMs <= 0) return null;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);

    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        try { source.stop(); } catch { /* already stopped */ }
        try { source.disconnect(); } catch { /* noop */ }
        try { gain.disconnect(); } catch { /* noop */ }
    };
    source.onended = stop;

    try {
        source.start(when, offsetMs / 1000, playLenMs / 1000);
    } catch {
        stop();
        return null;
    }

    return { stop };
}
