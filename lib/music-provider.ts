/**
 * Unified Music Provider
 * 
 * Abstraction layer that allows switching between music sources:
 * - iTunes (default, no auth required)
 * - Spotify (when API access is available)
 * - Combined (search both, dedupe, best of both worlds)
 * 
 * Configure via MUSIC_PROVIDER env var: "itunes" | "spotify" | "combined"
 */

import { searchTracks as searchiTunes } from './itunes';
// Spotify import is dynamic to avoid errors when credentials aren't set
// import { searchTracks as searchSpotify } from './spotify';

export type MusicProvider = 'itunes' | 'spotify' | 'combined';

export interface TrackResult {
    id: string;
    spotifyUri: string;      // URI format: spotify:track:X or itunes:track:X
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    previewUrl: string | null;
    popularity: number;
    bpm: number | null;
    energy: number | null;
    valence: number | null;
    danceability: number | null;
    explicit: boolean;
    durationMs: number;
    // New: track the source for debugging/display
    source?: 'itunes' | 'spotify';
}

/**
 * Get the configured music provider
 * Defaults to 'itunes' for zero-config startup
 */
export function getProvider(): MusicProvider {
    const provider = process.env.MUSIC_PROVIDER as MusicProvider;

    // Validate the provider setting
    if (provider === 'spotify' || provider === 'combined') {
        // Check if Spotify credentials are available
        const hasSpotify = !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

        if (!hasSpotify) {
            console.warn(`⚠️ MUSIC_PROVIDER is "${provider}" but Spotify credentials are missing. Falling back to iTunes.`);
            return 'itunes';
        }

        return provider;
    }

    // Default to iTunes (works without any config)
    return 'itunes';
}

/**
 * Check if Spotify is available
 */
export function isSpotifyAvailable(): boolean {
    return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

/**
 * Dynamically import Spotify module (only when needed)
 */
async function getSpotifyModule() {
    try {
        return await import('./spotify');
    } catch (error) {
        console.error('Failed to load Spotify module:', error);
        return null;
    }
}

/**
 * Unified search function
 * 
 * Uses the configured provider or falls back gracefully
 */
export async function searchTracks(query: string, limit = 10): Promise<TrackResult[]> {
    const provider = getProvider();

    if (process.env.NODE_ENV === 'development') {
        console.log(`🎵 Music search using provider: ${provider}`);
    }

    switch (provider) {
        case 'spotify':
            return searchWithSpotify(query, limit);

        case 'combined':
            return searchCombined(query, limit);

        case 'itunes':
        default:
            return searchWithiTunes(query, limit);
    }
}

/**
 * Search using iTunes (always available)
 */
async function searchWithiTunes(query: string, limit: number): Promise<TrackResult[]> {
    const results = await searchiTunes(query, limit);
    return results.map(track => ({ ...track, source: 'itunes' as const }));
}

/**
 * Search using Spotify (requires credentials)
 */
async function searchWithSpotify(query: string, limit: number): Promise<TrackResult[]> {
    const spotify = await getSpotifyModule();

    if (!spotify) {
        console.warn('⚠️ Spotify unavailable, falling back to iTunes');
        return searchWithiTunes(query, limit);
    }

    try {
        const results = await spotify.searchTracks(query, limit);
        return results.map(track => ({ ...track, source: 'spotify' as const }));
    } catch (error) {
        console.error('Spotify search failed, falling back to iTunes:', error);
        return searchWithiTunes(query, limit);
    }
}

/**
 * Combined search: query both, deduplicate, merge best data
 * 
 * Benefits:
 * - More comprehensive results
 * - Spotify audio features when available
 * - iTunes preview URLs as fallback
 * - Higher availability (one fails, other works)
 */
async function searchCombined(query: string, limit: number): Promise<TrackResult[]> {
    // Fetch from both sources concurrently
    const [itunesResults, spotifyResults] = await Promise.allSettled([
        searchWithiTunes(query, limit),
        searchWithSpotify(query, limit),
    ]);

    const itunes = itunesResults.status === 'fulfilled' ? itunesResults.value : [];
    const spotify = spotifyResults.status === 'fulfilled' ? spotifyResults.value : [];

    if (process.env.NODE_ENV === 'development') {
        console.log(`🎵 Combined search: ${itunes.length} iTunes + ${spotify.length} Spotify results`);
    }

    // If one source failed completely, return the other
    if (spotify.length === 0) return itunes.slice(0, limit);
    if (itunes.length === 0) return spotify.slice(0, limit);

    // Merge and deduplicate
    return mergeResults(spotify, itunes, limit);
}

/**
 * Merge results from multiple sources
 * 
 * Strategy:
 * 1. Use Spotify results as base (better metadata, audio features)
 * 2. Supplement with iTunes preview URLs when Spotify lacks them
 * 3. Add unique iTunes results that Spotify didn't find
 */
function mergeResults(
    spotifyTracks: TrackResult[],
    itunesTracks: TrackResult[],
    limit: number
): TrackResult[] {
    const merged: TrackResult[] = [];
    const seenTracks = new Set<string>();

    // Helper to create a normalized key for deduplication
    const getTrackKey = (track: TrackResult): string => {
        // Normalize: lowercase, remove special chars, trim
        const name = track.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const artist = track.artist.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${name}:${artist}`;
    };

    // First pass: Add all Spotify tracks
    for (const track of spotifyTracks) {
        const key = getTrackKey(track);
        if (!seenTracks.has(key)) {
            seenTracks.add(key);

            // Try to supplement with iTunes data
            const itunesMatch = itunesTracks.find(it => getTrackKey(it) === key);
            if (itunesMatch) {
                // Use iTunes preview if Spotify doesn't have one
                if (!track.previewUrl && itunesMatch.previewUrl) {
                    track.previewUrl = itunesMatch.previewUrl;
                }
            }

            merged.push(track);
        }
    }

    // Second pass: Add unique iTunes tracks not in Spotify
    for (const track of itunesTracks) {
        const key = getTrackKey(track);
        if (!seenTracks.has(key)) {
            seenTracks.add(key);
            merged.push(track);
        }

        if (merged.length >= limit) break;
    }

    return merged.slice(0, limit);
}

/**
 * Get provider status for debugging/admin display
 */
export function getProviderStatus(): {
    active: MusicProvider;
    spotifyAvailable: boolean;
    itunesAvailable: boolean;
    configured: string | undefined;
} {
    return {
        active: getProvider(),
        spotifyAvailable: isSpotifyAvailable(),
        itunesAvailable: true, // Always available
        configured: process.env.MUSIC_PROVIDER,
    };
}
