// Spotify API helpers

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';

interface SpotifyTrack {
    id: string;
    uri: string;
    name: string;
    artists: { name: string }[];
    album: {
        name: string;
        images: { url: string; width: number }[];
    };
    preview_url: string | null;
    popularity: number;  // 0-100
    explicit: boolean;   // Explicit content flag
    duration_ms: number; // Duration in milliseconds
}

interface SpotifyAudioFeatures {
    id: string;
    tempo: number;           // BPM
    energy: number;          // 0.0 to 1.0
    valence: number;         // 0.0 to 1.0 (happiness)
    danceability: number;    // 0.0 to 1.0
}

interface SpotifySearchResponse {
    tracks: {
        items: SpotifyTrack[];
    };
}

interface SpotifyAudioFeaturesResponse {
    audio_features: (SpotifyAudioFeatures | null)[];
}

// Get client credentials token (for search - doesn't need user auth)
// Always fetch a fresh token - no caching to avoid issues
async function getClientToken(): Promise<string> {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error('Missing Spotify credentials - SPOTIFY_CLIENT_ID:', !!clientId, 'SPOTIFY_CLIENT_SECRET:', !!clientSecret);
        throw new Error('Missing Spotify credentials');
    }

    console.log('Getting fresh Spotify token...');

    const response = await fetch(SPOTIFY_AUTH_URL, {
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
        console.error('Spotify token error:', response.status, errorText);
        throw new Error(`Failed to get Spotify token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Got Spotify token, expires in', data.expires_in, 'seconds');

    return data.access_token;
}

// Fetch audio features for multiple tracks
async function getAudioFeatures(token: string, trackIds: string[]): Promise<Map<string, SpotifyAudioFeatures>> {
    const featuresMap = new Map<string, SpotifyAudioFeatures>();

    if (trackIds.length === 0) return featuresMap;

    try {
        console.log('🎵 Fetching audio features for', trackIds.length, 'tracks...');

        const response = await fetch(
            `${SPOTIFY_API_BASE}/audio-features?ids=${trackIds.join(',')}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            }
        );

        console.log('🎵 Audio features response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.warn('🎵 Audio features API error:', response.status, errorText);
            return featuresMap;
        }

        const data: SpotifyAudioFeaturesResponse = await response.json();
        console.log('🎵 Audio features response:', JSON.stringify(data).slice(0, 500));

        for (const feature of data.audio_features) {
            if (feature) {
                featuresMap.set(feature.id, feature);
            }
        }

        console.log('🎵 Got audio features for', featuresMap.size, 'of', trackIds.length, 'tracks');
    } catch (error) {
        console.warn('🎵 Failed to fetch audio features:', error);
    }

    return featuresMap;
}

// Search tracks - returns basic info + audio features (BPM, energy, etc.)
export async function searchTracks(query: string, limit = 10): Promise<{
    id: string;
    spotifyUri: string;
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
    const token = await getClientToken();

    console.log('Searching Spotify for:', query);

    const response = await fetch(
        `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
        {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Spotify search error:', response.status, errorText);
        throw new Error(`Search failed: ${response.status} - ${errorText}`);
    }

    const data: SpotifySearchResponse = await response.json();
    const tracks = data.tracks.items;

    // Fetch audio features for all tracks
    const trackIds = tracks.map(t => t.id);
    const audioFeatures = await getAudioFeatures(token, trackIds);

    return tracks.map((track) => {
        const features = audioFeatures.get(track.id);
        return {
            id: track.id,
            spotifyUri: track.uri,
            name: track.name,
            artist: track.artists.map((a) => a.name).join(', '),
            album: track.album.name,
            albumArt: track.album.images[0]?.url || '',
            previewUrl: track.preview_url,
            popularity: track.popularity,
            bpm: features ? Math.round(features.tempo) : null,
            energy: features ? features.energy : null,
            valence: features ? features.valence : null,
            danceability: features ? features.danceability : null,
            explicit: track.explicit,
            durationMs: track.duration_ms,
        };
    });
}

// Create a playlist in user's account (requires user auth token)
export async function createPlaylist(
    accessToken: string,
    userId: string,
    name: string,
    description: string,
    trackUris: string[]
): Promise<{ playlistId: string; playlistUrl: string }> {
    // Create the playlist
    const createResponse = await fetch(`${SPOTIFY_API_BASE}/users/${userId}/playlists`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name,
            description,
            public: true,
        }),
    });

    if (!createResponse.ok) {
        const error = await createResponse.text();
        throw new Error(`Failed to create playlist: ${error}`);
    }

    const playlist = await createResponse.json();

    // Add tracks to the playlist (max 100 per request)
    if (trackUris.length > 0) {
        const chunks = [];
        for (let i = 0; i < trackUris.length; i += 100) {
            chunks.push(trackUris.slice(i, i + 100));
        }

        for (const chunk of chunks) {
            const addResponse = await fetch(`${SPOTIFY_API_BASE}/playlists/${playlist.id}/tracks`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uris: chunk }),
            });

            if (!addResponse.ok) {
                console.error('Failed to add some tracks');
            }
        }
    }

    return {
        playlistId: playlist.id,
        playlistUrl: playlist.external_urls.spotify,
    };
}

// Get current user's profile (to get user ID for playlist creation)
export async function getCurrentUser(accessToken: string): Promise<{ id: string; displayName: string }> {
    const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to get user profile');
    }

    const data = await response.json();
    return {
        id: data.id,
        displayName: data.display_name,
    };
}
