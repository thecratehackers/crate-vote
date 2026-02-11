// TIDAL API helpers — mirrors lib/spotify.ts pattern
// Uses OAuth 2.1 with PKCE for user auth, Client Credentials for catalog access

const TIDAL_API_BASE = 'https://openapi.tidal.com/v2';
const TIDAL_AUTH_URL = 'https://auth.tidal.com/v1/oauth2/token';
const TIDAL_LOGIN_URL = 'https://login.tidal.com/authorize';

// ─── Client Credentials (Catalog Access) ────────────────────────────────────

/**
 * Get a client credentials token for catalog-only access (search, track lookup).
 * Does NOT require user login.
 */
export async function getTidalClientToken(): Promise<string> {
    const clientId = process.env.TIDAL_CLIENT_ID?.trim();
    const clientSecret = process.env.TIDAL_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
        throw new Error('Missing TIDAL credentials (TIDAL_CLIENT_ID / TIDAL_CLIENT_SECRET)');
    }

    const response = await fetch(TIDAL_AUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('TIDAL client token error:', response.status, errorText);
        throw new Error(`Failed to get TIDAL client token: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

// ─── OAuth 2.1 Authorization Code + PKCE ────────────────────────────────────

/**
 * Generate a cryptographically random code verifier for PKCE.
 */
export function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    // Server-side: use Node crypto
    const crypto = require('crypto');
    crypto.getRandomValues(array);
    return Buffer.from(array)
        .toString('base64url')
        .slice(0, 128);
}

/**
 * Derive code challenge from verifier using S256.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return Buffer.from(hash).toString('base64url');
}

/**
 * Build the TIDAL authorization URL for the user to log in.
 */
export function buildTidalAuthUrl(params: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
}): string {
    const url = new URL(TIDAL_LOGIN_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', 'playlists.write');
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', params.state);
    return url.toString();
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeTidalCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    userId: number;
}> {
    const clientId = process.env.TIDAL_CLIENT_ID!.trim();
    const clientSecret = process.env.TIDAL_CLIENT_SECRET!.trim();

    const response = await fetch(TIDAL_AUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: params.code,
            redirect_uri: params.redirectUri,
            code_verifier: params.codeVerifier,
        }),
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('TIDAL token exchange error:', response.status, errorText);
        throw new Error(`TIDAL auth failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        userId: data.user?.userId || data.user_id,
    };
}

/**
 * Refresh an expired TIDAL access token.
 */
export async function refreshTidalToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}> {
    const clientId = process.env.TIDAL_CLIENT_ID!.trim();
    const clientSecret = process.env.TIDAL_CLIENT_SECRET!.trim();

    const response = await fetch(TIDAL_AUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('TIDAL token refresh error:', response.status, errorText);
        throw new Error(`TIDAL token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresIn: data.expires_in,
    };
}

// ─── Catalog Operations ─────────────────────────────────────────────────────

/**
 * Resolve a Spotify track ID to its ISRC via the Spotify API.
 * We batch up to 50 tracks per request.
 */
export async function getSpotifyISRCs(
    spotifyToken: string,
    trackIds: string[]
): Promise<Map<string, string>> {
    const isrcMap = new Map<string, string>();

    // Spotify allows up to 50 IDs per request
    for (let i = 0; i < trackIds.length; i += 50) {
        const chunk = trackIds.slice(i, i + 50);
        try {
            const response = await fetch(
                `https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`,
                {
                    headers: { Authorization: `Bearer ${spotifyToken}` },
                    cache: 'no-store',
                }
            );

            if (!response.ok) {
                console.warn('Spotify tracks fetch error:', response.status);
                continue;
            }

            const data = await response.json();
            for (const track of data.tracks) {
                if (track?.external_ids?.isrc) {
                    isrcMap.set(track.id, track.external_ids.isrc);
                }
            }
        } catch (error) {
            console.warn('Failed to fetch Spotify ISRCs:', error);
        }
    }

    console.log(`🎵 Resolved ${isrcMap.size} ISRCs from ${trackIds.length} Spotify tracks`);
    return isrcMap;
}

/**
 * Look up a TIDAL track by ISRC code.
 * Returns the first matching TIDAL track ID, or null if not found.
 */
export async function findTidalTrackByISRC(
    tidalToken: string,
    isrc: string,
    countryCode = 'US'
): Promise<string | null> {
    try {
        const url = `${TIDAL_API_BASE}/tracks?filter[isrc]=${encodeURIComponent(isrc)}&countryCode=${countryCode}&include=artists`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${tidalToken}`,
                'Content-Type': 'application/vnd.tidal.v1+json',
                Accept: 'application/vnd.tidal.v1+json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            const errorText = await response.text();
            console.warn(`TIDAL ISRC lookup failed for ${isrc}: ${response.status}`, errorText);
            return null;
        }

        const data = await response.json();
        const tracks = data.data || [];

        if (tracks.length === 0) {
            console.log(`TIDAL ISRC lookup: no results for ${isrc}`);
            return null;
        }

        // Return the first match's ID
        console.log(`TIDAL ISRC match: ${isrc} → ${tracks[0].id}`);
        return tracks[0].id;
    } catch (error) {
        console.warn(`TIDAL ISRC lookup error for ${isrc}:`, error);
        return null;
    }
}

/**
 * Batch-resolve an array of ISRCs to TIDAL track IDs.
 * Returns a Map<ISRC, TidalTrackId>.
 */
export async function batchResolveTidalTracks(
    tidalToken: string,
    isrcs: string[],
    countryCode = 'US'
): Promise<Map<string, string>> {
    const tidalMap = new Map<string, string>();

    // Process in parallel batches of 10 to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < isrcs.length; i += batchSize) {
        const batch = isrcs.slice(i, i + batchSize);
        const results = await Promise.allSettled(
            batch.map(isrc => findTidalTrackByISRC(tidalToken, isrc, countryCode))
        );

        results.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value) {
                tidalMap.set(batch[idx], result.value);
            }
        });

        // Small delay between batches to respect rate limits
        if (i + batchSize < isrcs.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    console.log(`🎵 Resolved ${tidalMap.size} TIDAL tracks from ${isrcs.length} ISRCs`);
    return tidalMap;
}

/**
 * Fallback: Search TIDAL by artist + track name if ISRC lookup fails.
 */
export async function searchTidalTrack(
    tidalToken: string,
    query: string,
    countryCode = 'US'
): Promise<string | null> {
    try {
        const url = `${TIDAL_API_BASE}/searchResults/${encodeURIComponent(query)}?countryCode=${countryCode}&include=tracks`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${tidalToken}`,
                'Content-Type': 'application/vnd.tidal.v1+json',
                Accept: 'application/vnd.tidal.v1+json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`TIDAL search failed for "${query}": ${response.status}`, errorText);
            return null;
        }

        const data = await response.json();
        // JSON:API structure — included tracks
        const included = data.included || [];
        const tracks = included.filter((item: any) => item.type === 'tracks');

        if (tracks.length === 0) {
            console.log(`TIDAL search: no track results for "${query}"`);
            return null;
        }
        console.log(`TIDAL search match: "${query}" → ${tracks[0].id}`);
        return tracks[0].id;
    } catch (error) {
        console.warn('TIDAL search error:', error);
        return null;
    }
}

// ─── Playlist Operations (Requires User Auth Token) ─────────────────────────

/**
 * Create a playlist on the user's TIDAL account and add tracks.
 */
export async function createTidalPlaylist(
    accessToken: string,
    name: string,
    description: string,
    trackIds: string[]
): Promise<{ playlistId: string; playlistUrl: string }> {
    // Step 1: Create the playlist
    const createResponse = await fetch(`${TIDAL_API_BASE}/playlists`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/vnd.tidal.v1+json',
        },
        body: JSON.stringify({
            data: {
                type: 'playlists',
                attributes: {
                    name,
                    description,
                    privacy: 'PUBLIC',
                },
            },
        }),
    });

    if (!createResponse.ok) {
        const error = await createResponse.text();
        console.error('TIDAL create playlist error:', createResponse.status, error);
        throw new Error(`Failed to create TIDAL playlist: ${createResponse.status} - ${error}`);
    }

    const playlistData = await createResponse.json();
    const playlistId = playlistData.data?.id;

    if (!playlistId) {
        throw new Error('TIDAL returned no playlist ID');
    }

    // Step 2: Add tracks to the playlist (batch in chunks of 20)
    if (trackIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < trackIds.length; i += 20) {
            chunks.push(trackIds.slice(i, i + 20));
        }

        for (const chunk of chunks) {
            const items = chunk.map(id => ({
                type: 'tracks' as const,
                id,
                meta: { position: undefined },
            }));

            const addResponse = await fetch(
                `${TIDAL_API_BASE}/playlists/${playlistId}/relationships/items`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/vnd.tidal.v1+json',
                    },
                    body: JSON.stringify({ data: items }),
                }
            );

            if (!addResponse.ok) {
                console.warn('Failed to add some tracks to TIDAL playlist:', addResponse.status);
            }

            // Brief pause between batches
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    return {
        playlistId,
        playlistUrl: `https://tidal.com/playlist/${playlistId}`,
    };
}
