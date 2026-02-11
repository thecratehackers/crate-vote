/**
 * 🔐 DUAL-LAYER PERSISTENCE — localStorage + Cookie fallback
 * 
 * Twitch's in-app browser (especially mobile) can wipe localStorage on:
 *   - Orientation changes (tilting the phone)
 *   - Moving the chat panel
 *   - Page refreshes within the embedded context
 *   - Third-party storage partitioning (Safari/iOS)
 * 
 * Solution: Write ALL user state to BOTH localStorage and a serialized cookie.
 * On read: try localStorage first → fall back to cookie → return null.
 * On write: write to both simultaneously.
 * 
 * The cookie is a single JSON blob under "crate-session" to stay under the
 * 4KB cookie size limit while storing all user preferences.
 */

const COOKIE_NAME = 'crate-session';
const COOKIE_MAX_AGE_DAYS = 365;

// Keys we persist in the session cookie
const PERSISTED_KEYS = [
    'crate-username',
    'crate-avatar',
    'crate-color',
    'crate-sounds',
    'crate-location',
    'crate-rsvp-done',
    'crate-coach-done',
    'crate-last-session',
    'crate-admin-hide-stream',
] as const;

type PersistedKey = typeof PERSISTED_KEYS[number];

// ─── Cookie Helpers ───────────────────────────────────────────────────

function getCookieData(): Record<string, string> {
    if (typeof document === 'undefined') return {};
    try {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, ...valueParts] = cookie.trim().split('=');
            if (name === COOKIE_NAME) {
                const raw = decodeURIComponent(valueParts.join('='));
                return JSON.parse(raw);
            }
        }
    } catch {
        // Corrupted cookie, ignore
    }
    return {};
}

function setCookieData(data: Record<string, string>): void {
    if (typeof document === 'undefined') return;
    try {
        const json = JSON.stringify(data);
        // Safety check: cookies max out around 4KB
        if (json.length > 3800) {
            // If too big, drop the largest field (usually crate-last-session)
            const trimmed = { ...data };
            delete trimmed['crate-last-session'];
            const fallback = JSON.stringify(trimmed);
            document.cookie = `${COOKIE_NAME}=${encodeURIComponent(fallback)}; path=/; max-age=${COOKIE_MAX_AGE_DAYS * 86400}; SameSite=Lax`;
            return;
        }
        document.cookie = `${COOKIE_NAME}=${encodeURIComponent(json)}; path=/; max-age=${COOKIE_MAX_AGE_DAYS * 86400}; SameSite=Lax`;
    } catch {
        // Can't write cookie — silently fail
    }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Read a persisted value. Tries localStorage first, falls back to cookie.
 * If localStorage is missing but cookie has the value, restores it to localStorage.
 */
export function persistGet(key: PersistedKey): string | null {
    if (typeof window === 'undefined') return null;

    // Try localStorage first
    try {
        const lsValue = localStorage.getItem(key);
        if (lsValue !== null) return lsValue;
    } catch {
        // localStorage unavailable (privacy mode, iframe restrictions)
    }

    // Fall back to cookie
    const cookieData = getCookieData();
    const cookieValue = cookieData[key] ?? null;

    // If found in cookie but not in localStorage, restore it
    if (cookieValue !== null) {
        try {
            localStorage.setItem(key, cookieValue);
        } catch {
            // Can't restore — that's fine, cookie is the source of truth
        }
    }

    return cookieValue;
}

/**
 * Write a persisted value to BOTH localStorage and cookie.
 */
export function persistSet(key: PersistedKey, value: string): void {
    if (typeof window === 'undefined') return;

    // Write to localStorage
    try {
        localStorage.setItem(key, value);
    } catch {
        // localStorage full or disabled — cookie will still work
    }

    // Write to cookie (merge with existing data)
    const cookieData = getCookieData();
    cookieData[key] = value;
    setCookieData(cookieData);
}

/**
 * Remove a persisted value from both localStorage and cookie.
 */
export function persistRemove(key: PersistedKey): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore
    }

    const cookieData = getCookieData();
    delete cookieData[key];
    setCookieData(cookieData);
}

/**
 * Restore all cookie data into localStorage (call on app init).
 * This heals localStorage if it was nuked by the browser.
 */
export function persistHydrate(): void {
    if (typeof window === 'undefined') return;

    const cookieData = getCookieData();
    for (const key of PERSISTED_KEYS) {
        if (cookieData[key] !== undefined) {
            try {
                const existing = localStorage.getItem(key);
                if (existing === null) {
                    // localStorage was wiped — restore from cookie
                    localStorage.setItem(key, cookieData[key]);
                }
            } catch {
                // Can't write to localStorage — that's okay
            }
        }
    }
}

/**
 * Sync current localStorage state into the cookie (call after onboarding).
 * Ensures the cookie has all the latest data.
 */
export function persistSyncToCookie(): void {
    if (typeof window === 'undefined') return;

    const cookieData = getCookieData();
    let changed = false;

    for (const key of PERSISTED_KEYS) {
        try {
            const lsValue = localStorage.getItem(key);
            if (lsValue !== null && cookieData[key] !== lsValue) {
                cookieData[key] = lsValue;
                changed = true;
            }
        } catch {
            // Ignore
        }
    }

    if (changed) {
        setCookieData(cookieData);
    }
}
