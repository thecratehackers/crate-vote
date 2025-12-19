/**
 * YouTube Data API v3 Service
 * Searches for music videos and caches results
 */

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

// In-memory cache for video IDs (persists within serverless instance)
const videoCache = new Map<string, { videoId: string | null; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface YouTubeSearchItem {
    id: {
        kind: string;
        videoId: string;
    };
    snippet: {
        title: string;
        channelTitle: string;
    };
}

interface YouTubeSearchResponse {
    items?: YouTubeSearchItem[];
    error?: {
        message: string;
        code: number;
    };
}

/**
 * Check if YouTube API is configured
 */
export function isYouTubeConfigured(): boolean {
    return !!YOUTUBE_API_KEY;
}

/**
 * Create a cache key from song and artist
 */
function getCacheKey(song: string, artist: string): string {
    return `${song.toLowerCase().trim()}|${artist.toLowerCase().trim()}`;
}

/**
 * Check if a cached entry is still valid
 */
function isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < CACHE_TTL;
}

/**
 * Search YouTube for a music video
 * @param song - Song name
 * @param artist - Artist name
 * @returns Video ID or null if not found
 */
export async function searchMusicVideo(song: string, artist: string): Promise<string | null> {
    if (!YOUTUBE_API_KEY) {
        console.warn('YouTube API key not configured');
        return null;
    }

    const cacheKey = getCacheKey(song, artist);

    // Check cache first
    const cached = videoCache.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp)) {
        return cached.videoId;
    }

    try {
        // Build search query - prioritize official music videos
        const query = `${song} ${artist} official music video`;

        const params = new URLSearchParams({
            part: 'snippet',
            q: query,
            type: 'video',
            videoCategoryId: '10', // Music category
            maxResults: '1',
            key: YOUTUBE_API_KEY,
        });

        const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params}`, {
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            if (response.status === 403) {
                console.error('YouTube API quota exceeded or key invalid');
            }
            return null;
        }

        const data: YouTubeSearchResponse = await response.json();

        if (data.error) {
            console.error('YouTube API error:', data.error.message);
            return null;
        }

        const videoId = data.items?.[0]?.id?.videoId ?? null;

        // Cache the result (even nulls to avoid repeated failed searches)
        videoCache.set(cacheKey, { videoId, timestamp: Date.now() });

        return videoId;
    } catch (error) {
        console.error('YouTube search failed:', error);
        return null;
    }
}

/**
 * Get cache stats for debugging
 */
export function getYouTubeCacheStats(): { size: number; validEntries: number } {
    let validEntries = 0;
    const now = Date.now();

    videoCache.forEach((entry) => {
        if (now - entry.timestamp < CACHE_TTL) {
            validEntries++;
        }
    });

    return { size: videoCache.size, validEntries };
}

/**
 * Clear expired cache entries
 */
export function cleanupYouTubeCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    videoCache.forEach((entry, key) => {
        if (now - entry.timestamp >= CACHE_TTL) {
            keysToDelete.push(key);
        }
    });

    keysToDelete.forEach((key) => videoCache.delete(key));
}
