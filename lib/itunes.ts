/**
 * iTunes Search API - No authentication required!
 * 
 * This module provides a drop-in replacement for Spotify search
 * while waiting for Spotify API access. The iTunes Search API is
 * completely free and requires no API keys.
 * 
 * API Documentation: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 */

const ITUNES_API_BASE = 'https://itunes.apple.com';

interface iTunesTrack {
    trackId: number;
    trackName: string;
    artistName: string;
    collectionName: string;       // Album name
    artworkUrl100: string;        // 100x100 album art
    previewUrl: string;           // 30-second preview!
    trackTimeMillis: number;      // Duration in ms
    trackExplicitness: string;    // "explicit" | "notExplicit" | "cleaned"
    primaryGenreName: string;     // Genre
    releaseDate: string;          // ISO date
    trackViewUrl: string;         // Link to iTunes/Apple Music
}

interface iTunesSearchResponse {
    resultCount: number;
    results: iTunesTrack[];
}

/**
 * Get higher resolution album art from iTunes
 * iTunes returns 100x100 by default, but we can request larger sizes
 */
function getHighResAlbumArt(url: string, size = 600): string {
    if (!url) return '';
    // Replace 100x100 with desired size
    return url.replace('100x100', `${size}x${size}`);
}

/**
 * Generate a stable "Spotify-like" URI for iTunes tracks
 * Format: itunes:track:{trackId}
 */
function generateTrackUri(trackId: number): string {
    return `itunes:track:${trackId}`;
}

/**
 * Search for tracks using iTunes Search API
 * 
 * Returns results in the same format as the Spotify searchTracks function
 * for easy drop-in replacement.
 */
export async function searchTracks(query: string, limit = 10): Promise<{
    id: string;
    spotifyUri: string;    // Will contain iTunes URI instead
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
}[]> {
    if (process.env.NODE_ENV === 'development') {
        console.log('🍎 Searching iTunes for:', query);
    }

    const response = await fetch(
        `${ITUNES_API_BASE}/search?` + new URLSearchParams({
            term: query,
            media: 'music',
            entity: 'song',
            limit: String(Math.min(limit, 200)), // iTunes max is 200
        }),
        {
            headers: {
                'Accept': 'application/json',
            },
            // iTunes has no rate limit issues, but cache for performance
            next: { revalidate: 60 },
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('🍎 iTunes search error:', response.status, errorText);
        throw new Error(`iTunes search failed: ${response.status}`);
    }

    const data: iTunesSearchResponse = await response.json();

    if (process.env.NODE_ENV === 'development') {
        console.log('🍎 iTunes returned', data.resultCount, 'results');
    }

    return data.results.map((track) => ({
        id: String(track.trackId),
        spotifyUri: generateTrackUri(track.trackId),
        name: track.trackName,
        artist: track.artistName,
        album: track.collectionName || 'Unknown Album',
        albumArt: getHighResAlbumArt(track.artworkUrl100),
        previewUrl: track.previewUrl || null,
        // iTunes doesn't provide popularity, but we can estimate based on position
        // (first results are typically more popular)
        popularity: 50,
        // Audio features not available from iTunes - null is fine
        bpm: null,
        energy: null,
        valence: null,
        danceability: null,
        explicit: track.trackExplicitness === 'explicit',
        durationMs: track.trackTimeMillis || 0,
    }));
}

/**
 * Search with additional filtering options
 */
export async function searchTracksAdvanced(
    query: string,
    options: {
        limit?: number;
        country?: string;   // ISO country code (US, GB, JP, etc.)
        explicit?: boolean; // Filter explicit content
    } = {}
): Promise<ReturnType<typeof searchTracks>> {
    const { limit = 10, country = 'US', explicit } = options;

    const params = new URLSearchParams({
        term: query,
        media: 'music',
        entity: 'song',
        limit: String(Math.min(limit, 200)),
        country,
    });

    if (explicit === false) {
        params.set('explicit', 'No');
    }

    const response = await fetch(`${ITUNES_API_BASE}/search?${params}`, {
        headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`iTunes search failed: ${response.status}`);
    }

    const data: iTunesSearchResponse = await response.json();

    return data.results.map((track, index) => ({
        id: String(track.trackId),
        spotifyUri: generateTrackUri(track.trackId),
        name: track.trackName,
        artist: track.artistName,
        album: track.collectionName || 'Unknown Album',
        albumArt: getHighResAlbumArt(track.artworkUrl100),
        previewUrl: track.previewUrl || null,
        // Estimate popularity based on search ranking (earlier = more popular)
        popularity: Math.max(100 - (index * 5), 20),
        bpm: null,
        energy: null,
        valence: null,
        danceability: null,
        explicit: track.trackExplicitness === 'explicit',
        durationMs: track.trackTimeMillis || 0,
    }));
}

/**
 * Lookup a specific track by iTunes ID
 */
export async function getTrackById(trackId: string): Promise<{
    id: string;
    spotifyUri: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    previewUrl: string | null;
    popularity: number;
    explicit: boolean;
    durationMs: number;
} | null> {
    const response = await fetch(
        `${ITUNES_API_BASE}/lookup?id=${trackId}&entity=song`,
        { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
        return null;
    }

    const data: iTunesSearchResponse = await response.json();
    const track = data.results[0];

    if (!track) {
        return null;
    }

    return {
        id: String(track.trackId),
        spotifyUri: generateTrackUri(track.trackId),
        name: track.trackName,
        artist: track.artistName,
        album: track.collectionName || 'Unknown Album',
        albumArt: getHighResAlbumArt(track.artworkUrl100),
        previewUrl: track.previewUrl || null,
        popularity: 50,
        explicit: track.trackExplicitness === 'explicit',
        durationMs: track.trackTimeMillis || 0,
    };
}
