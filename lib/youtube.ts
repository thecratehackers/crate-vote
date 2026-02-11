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
 * Fallback: Scrape YouTube search results directly
 * YouTube.com doesn't block server-side requests like third-party proxies do
 */
async function searchViaYouTubeScrape(song: string, artist: string): Promise<string | null> {
    const query = `${song} ${artist} official music video`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`; // sp filter = videos only

    try {
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            console.warn(`[YouTube Scrape] HTTP ${response.status}`);
            return null;
        }

        const html = await response.text();

        // Method 1: Extract from ytInitialData JSON blob
        const dataMatch = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/);
        if (dataMatch) {
            try {
                const ytData = JSON.parse(dataMatch[1]);
                const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                if (contents) {
                    for (const section of contents) {
                        const items = section?.itemSectionRenderer?.contents;
                        if (!items) continue;
                        for (const item of items) {
                            const videoId = item?.videoRenderer?.videoId;
                            if (videoId) {
                                console.log(`[YouTube Scrape] Found video via ytInitialData: ${videoId}`);
                                return videoId;
                            }
                        }
                    }
                }
            } catch (parseError) {
                console.warn('[YouTube Scrape] Failed to parse ytInitialData JSON');
            }
        }

        // Method 2: Simple regex extraction of video IDs from the HTML
        // Look for /watch?v=VIDEO_ID patterns in the page
        const videoIdMatches = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
        if (videoIdMatches && videoIdMatches.length > 0) {
            // Extract the first unique video ID
            const firstMatch = videoIdMatches[0].replace('/watch?v=', '');
            console.log(`[YouTube Scrape] Found video via regex: ${firstMatch}`);
            return firstMatch;
        }

        console.warn('[YouTube Scrape] No video IDs found in search results HTML');
        return null;
    } catch (error) {
        console.error('[YouTube Scrape] Failed:', error);
        return null;
    }
}

/**
 * Search YouTube for a music video
 * Uses YouTube Data API v3 as primary, with Piped and Invidious as fallbacks
 * @param song - Song name
 * @param artist - Artist name
 * @returns Video ID or null if not found
 */
export async function searchMusicVideo(song: string, artist: string): Promise<string | null> {
    const cacheKey = getCacheKey(song, artist);

    // Check cache first (but skip cached nulls so fallbacks can be tried)
    const cached = videoCache.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp) && cached.videoId !== null) {
        return cached.videoId;
    }

    // === PRIMARY: YouTube Data API v3 ===
    if (YOUTUBE_API_KEY) {
        try {
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
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(8000),
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => 'unknown');
                console.error(`[YouTube API] HTTP ${response.status}: ${errorBody}`);
                if (response.status === 403) {
                    console.error('[YouTube API] Quota exceeded or key invalid — falling back to YouTube scrape');
                }
                // Fall through to fallbacks
            } else {
                const data: YouTubeSearchResponse = await response.json();

                if (data.error) {
                    console.error('[YouTube API] Error:', data.error.message);
                } else {
                    const videoId = data.items?.[0]?.id?.videoId ?? null;
                    if (videoId) {
                        videoCache.set(cacheKey, { videoId, timestamp: Date.now() });
                        return videoId;
                    }
                    console.warn(`[YouTube API] No results for "${song}" by "${artist}"`);
                }
            }
        } catch (error) {
            console.error('[YouTube API] Search failed:', error);
        }
    } else {
        console.warn('[YouTube] No API key configured — using fallbacks only');
    }

    // === FALLBACK: Direct YouTube scrape ===
    try {
        const scrapeResult = await searchViaYouTubeScrape(song, artist);
        if (scrapeResult) {
            videoCache.set(cacheKey, { videoId: scrapeResult, timestamp: Date.now() });
            return scrapeResult;
        }
    } catch (error) {
        console.warn('[YouTube Fallback] Scrape search failed:', error);
    }

    // All methods failed — cache as null to avoid hammering APIs
    // Use shorter TTL for failures so we retry sooner
    videoCache.set(cacheKey, { videoId: null, timestamp: Date.now() - CACHE_TTL + (5 * 60 * 1000) }); // retry in 5 min

    console.error(`[YouTube] All search methods failed for "${song}" by "${artist}"`);
    return null;
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
