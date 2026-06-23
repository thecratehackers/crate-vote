// Server-authoritative voter identity.
//
// The old model trusted the `x-visitor-id` header (a FingerprintJS value the
// browser stores in localStorage). That header is fully client-controlled, so a
// script could rotate it to forge unlimited identities and stuff the leaderboard.
//
// This module issues a SIGNED, httpOnly cookie (HMAC of a server-minted id) that
// becomes the canonical identity votes are counted by. Once a browser has the
// cookie, clearing localStorage or spoofing the header can no longer mint a fresh
// vote allotment — the signed cookie wins.
//
// Graceful degradation: the vote app is embedded in a cross-origin iframe and many
// attendees are on iOS Safari, which blocks third-party cookies. When no valid
// cookie is present we fall back to the fingerprint header (today's behavior) and
// rely on the per-IP ceiling in lib/rate-limit.ts as the backstop. We seed the
// first cookie from the fingerprint header so existing votes/karma/export progress
// carry over (continuity) instead of resetting.

import crypto from 'crypto';

export const VOTER_COOKIE_NAME = 'cv_vid';

// 30 days — long enough to survive a multi-hour show and casual returns.
export const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function getSecret(): string {
    // Prefer a dedicated secret; fall back to ADMIN_PASSWORD so the app still
    // signs in environments where only that is set. Empty secret => no signing.
    return process.env.VOTER_SECRET || process.env.ADMIN_PASSWORD || '';
}

function hmac(value: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

/** Produce a signed cookie value: `${id}.${signature}` */
export function signId(id: string): string {
    const secret = getSecret();
    if (!secret) return id; // Unsigned fallback — verify() will reject these
    return `${id}.${hmac(id, secret)}`;
}

/** Verify a signed cookie value; returns the id if valid, else null. */
export function verifySignedId(value: string | null | undefined): string | null {
    if (!value) return null;
    const secret = getSecret();
    if (!secret) return null;

    const idx = value.lastIndexOf('.');
    if (idx <= 0) return null;

    const id = value.slice(0, idx);
    const sig = value.slice(idx + 1);
    const expected = hmac(id, secret);

    try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length) return null;
        return crypto.timingSafeEqual(a, b) ? id : null;
    } catch {
        return null;
    }
}

function mintId(): string {
    return crypto.randomBytes(16).toString('hex');
}

function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get('cookie');
    if (!header) return null;
    const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
}

export interface VoterIdentity {
    /** Canonical identity used as the Redis key for votes/karma/etc. */
    id: string;
    /** Signed value to write back via Set-Cookie (only when needsCookie). */
    cookieValue: string;
    /** True when the response should set the cookie (no valid cookie was present). */
    needsCookie: boolean;
    /** Where the id came from — useful for logging/diagnostics. */
    source: 'cookie' | 'header-seed' | 'new';
}

/**
 * Resolve the voter identity for a request.
 * - If a valid signed cookie is present, that id is canonical (header ignored).
 * - Otherwise mint a new identity, seeded from the fingerprint header when present
 *   (so existing data carries over), and flag that a cookie should be set.
 */
export function resolveVoterIdentity(request: Request, fingerprintHeaderId?: string | null): VoterIdentity {
    const verified = verifySignedId(readCookie(request, VOTER_COOKIE_NAME));
    if (verified) {
        return { id: verified, cookieValue: signId(verified), needsCookie: false, source: 'cookie' };
    }

    const seed = fingerprintHeaderId && fingerprintHeaderId.length > 0 ? fingerprintHeaderId : mintId();
    return {
        id: seed,
        cookieValue: signId(seed),
        needsCookie: true,
        source: fingerprintHeaderId && fingerprintHeaderId.length > 0 ? 'header-seed' : 'new',
    };
}

/**
 * Attach the signed voter cookie to a NextResponse-like object when needed.
 * SameSite=None + Secure so it works inside the cross-origin hackathon iframe
 * where the browser permits third-party cookies (Chrome/Android/desktop).
 */
export function attachVoterCookie(
    response: { cookies: { set: (opts: { name: string; value: string; httpOnly?: boolean; secure?: boolean; sameSite?: 'none' | 'lax' | 'strict'; path?: string; maxAge?: number }) => unknown } },
    identity: VoterIdentity
): void {
    if (!identity.needsCookie) return;
    response.cookies.set({
        name: VOTER_COOKIE_NAME,
        value: identity.cookieValue,
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: VOTER_COOKIE_MAX_AGE,
    });
}
