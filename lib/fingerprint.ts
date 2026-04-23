// Visitor fingerprinting for anonymous but consistent user identification
// This is used to track votes and song additions per user without requiring login

// We anchor the FingerprintJS-derived ID in localStorage on first compute so it stays
// stable across page navigations and minor FP drift (browser updates, etc.). Without
// this, the visitor ID computed on /export can differ from the one used while voting
// on /, causing the participation gate to wrongly block legit users.
const STORAGE_KEY = 'crate-visitor-id';

// For client-side: use this to get a consistent visitor ID
export async function getVisitorId(): Promise<string> {
    try {
        if (typeof window !== 'undefined') {
            const cached = window.localStorage.getItem(STORAGE_KEY);
            if (cached) return cached;
        }
    } catch {
        // localStorage may be unavailable (e.g. some privacy modes) - fall through
    }

    // Dynamic import to avoid SSR issues
    const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
    const fp = await FingerprintJS.load();
    const result = await fp.get();

    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, result.visitorId);
        }
    } catch {
        // ignore - we just won't have a cached value next time
    }

    return result.visitorId;
}

// For server-side: extract visitor ID from request header
export function getVisitorIdFromRequest(request: Request): string | null {
    return request.headers.get('x-visitor-id');
}
