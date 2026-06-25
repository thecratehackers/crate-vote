'use client';

/**
 * ⏱️ SHARED CLOCK (NTP-style)
 *
 * Phones and laptops all have slightly different clocks. If each device used its
 * own Date.now() to decide when a dance clip should start, "all at once" would
 * really be "within a few seconds of each other." This module pings /api/time,
 * measures the round-trip, and computes how far THIS device's clock is from the
 * server's. Everywhere we schedule synced audio we use serverNow() instead of
 * Date.now() so every device agrees on the same instant.
 */

let offset = 0;          // serverNow - Date.now(), in ms
let lastSyncAt = 0;
let syncing = false;

/** The server's "now" as estimated for this device. Use this for all sync timing. */
export function serverNow(): number {
    return Date.now() + offset;
}

export function getClockOffset(): number {
    return offset;
}

// One probe: estimate server time at the moment our response arrived.
async function probe(): Promise<{ rtt: number; estOffset: number } | null> {
    try {
        const t0 = Date.now();
        const res = await fetch('/api/time', { cache: 'no-store' });
        const t1 = Date.now();
        if (!res.ok) return null;
        const data = (await res.json()) as { now?: number };
        if (typeof data.now !== 'number') return null;
        const rtt = t1 - t0;
        // Assume the server read its clock roughly halfway through the round-trip.
        const estServerAtT1 = data.now + rtt / 2;
        return { rtt, estOffset: estServerAtT1 - t1 };
    } catch {
        return null;
    }
}

/**
 * Sync the clock. Runs several probes and trusts the one with the lowest
 * round-trip (least network noise = most accurate offset estimate).
 */
export async function syncServerClock(samples = 5): Promise<number> {
    if (typeof window === 'undefined' || syncing) return offset;
    syncing = true;
    try {
        let bestRtt = Infinity;
        for (let i = 0; i < samples; i++) {
            // eslint-disable-next-line no-await-in-loop
            const result = await probe();
            if (result && result.rtt < bestRtt) {
                bestRtt = result.rtt;
                offset = result.estOffset;
            }
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 120));
        }
        lastSyncAt = Date.now();
    } finally {
        syncing = false;
    }
    return offset;
}

/** Re-sync if the last sync is stale (devices drift, especially after sleeping). */
export function ensureClockFresh(maxAgeMs = 30000): void {
    if (Date.now() - lastSyncAt > maxAgeMs) {
        void syncServerClock(3);
    }
}
