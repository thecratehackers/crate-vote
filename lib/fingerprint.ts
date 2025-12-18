// Visitor fingerprinting for anonymous but consistent user identification
// This is used to track votes and song additions per user without requiring login

// For client-side: use this to get a consistent visitor ID
export async function getVisitorId(): Promise<string> {
    // Dynamic import to avoid SSR issues
    const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
}

// For server-side: extract visitor ID from request header
export function getVisitorIdFromRequest(request: Request): string | null {
    return request.headers.get('x-visitor-id');
}
