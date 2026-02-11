import { NextResponse } from 'next/server';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ===== IN-MEMORY CACHE =====
// Prevents duplicate API calls for the same song and saves credits
interface CacheEntry {
    facts: string[];
    timestamp: number;
}
const factCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCacheKey(artist: string, title: string): string {
    return `${artist.toLowerCase().trim()}::${title.toLowerCase().trim()}`;
}

function getCachedFacts(key: string): string[] | null {
    const entry = factCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        factCache.delete(key);
        return null;
    }
    return entry.facts;
}

// Cap cache size to prevent memory leak in long-running sessions
function pruneCache() {
    if (factCache.size > 200) {
        const entries = Array.from(factCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        // Remove oldest half
        entries.slice(0, 100).forEach(([key]) => factCache.delete(key));
    }
}

// ===== PERPLEXITY SONAR API =====
async function fetchPerplexityFacts(artist: string, title: string): Promise<string[]> {
    if (!PERPLEXITY_API_KEY) {
        console.log('⚠️ No PERPLEXITY_API_KEY configured — skipping Perplexity enrichment');
        return [];
    }

    const prompt = `Give me 10 fascinating, specific, little-known facts about the song "${title}" by ${artist}. 

Style: VH1 Pop Up Video — each fact should be a single concise sentence that would pop up on screen during the music video. Mix these categories:
- Behind-the-scenes recording stories
- Chart positions and commercial success  
- Who played instruments or contributed to the song
- Connections to movies, TV shows, or cultural moments
- Surprising things about the lyrics or meaning
- What the artist was going through when they wrote/recorded it
- Awards or notable covers/samples of the song

Rules:
- Each fact must be ONE sentence, max 120 characters
- Be SPECIFIC — include names, dates, numbers, and details
- No generic filler like "this song is a classic"
- Start each fact with an emoji that matches the category
- Number each fact 1-10
- If you don't know enough specific facts about this exact song, include facts about the artist from the same era`;

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a music trivia expert writing VH1 Pop Up Video style facts. Be specific, entertaining, and concise. Every fact must be verifiable and interesting.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                max_tokens: 800,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            console.error(`❌ Perplexity API error: ${response.status} ${response.statusText}`);
            const errorBody = await response.text().catch(() => '');
            console.error('Response body:', errorBody);
            return [];
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        console.log(`✅ Perplexity returned ${content.length} chars for "${title}" by ${artist}`);

        // Parse numbered facts from the response
        const facts = content
            .split('\n')
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 10)
            // Remove numbering (1. 2. etc.) but keep emoji
            .map((line: string) => line.replace(/^\d+[\.\)]\s*/, '').trim())
            .filter((line: string) => line.length > 10 && line.length < 200);

        console.log(`🎯 Parsed ${facts.length} Perplexity facts`);
        return facts;

    } catch (error) {
        console.error('❌ Perplexity fetch failed:', error);
        return [];
    }
}

// ===== API ROUTE =====
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const artist = searchParams.get('artist');
    const title = searchParams.get('title');

    if (!artist || !title) {
        return NextResponse.json({ error: 'Missing artist or title' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = getCacheKey(artist, title);
    const cached = getCachedFacts(cacheKey);
    if (cached) {
        console.log(`📦 Cache hit for "${title}" by ${artist} (${cached.length} facts)`);
        return NextResponse.json({
            facts: cached,
            source: 'cache',
            count: cached.length,
        });
    }

    console.log(`🔍 Fetching Perplexity facts for: ${artist} - ${title}`);

    const facts = await fetchPerplexityFacts(artist, title);

    if (facts.length > 0) {
        // Cache the results
        factCache.set(cacheKey, { facts, timestamp: Date.now() });
        pruneCache();

        return NextResponse.json({
            facts,
            source: 'perplexity',
            count: facts.length,
        });
    }

    // No facts available (no API key or API failure)
    return NextResponse.json({
        facts: [],
        source: 'none',
        count: 0,
    });
}
