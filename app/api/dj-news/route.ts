import { NextResponse } from 'next/server';

const RSS_URL = 'https://rss.beehiiv.com/feeds/3Bh9dat34r.xml';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_AGE_DAYS = 30; // Only show headlines from the last month

let cachedHeadlines: string[] | null = null;
let cacheTimestamp = 0;

// Fallback headlines if RSS can't be fetched
const FALLBACK_HEADLINES = [
    'Native Instruments Files for Insolvency — What It Means for DJs',
    'RANE System One Is Official — The "Leak" Wasn\'t Lying',
    'AI Music Charts Are Now a Thing — Because of Course They Are',
    'Wedding Pros Are Evolving — And DJs Are Right in the Middle',
    'Spotify Prices Going Up Again — Here\'s What\'s Changing',
    'CDJ-3000X Now Speaks Apple — Pioneer Gets Cupertino Fluent',
    'DMC Crowns First VR DJ World Champion',
    'Bandcamp Bans AI-Generated Music — Robots Don\'t Deserve Merch Tables',
];

function cleanText(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&#8211;/g, '–')
        .replace(/<!\[CDATA\[|\]\]>/g, '');
}

function extractHeadlines(xml: string): string[] {
    const headlines: string[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS);

    // Parse each <item> block
    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i;
    const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/i;

    const items = xml.match(itemRegex) || [];

    for (const item of items) {
        // Check publish date — only include last 30 days
        const dateMatch = item.match(pubDateRegex);
        if (dateMatch) {
            const pubDate = new Date(dateMatch[1]);
            if (pubDate < cutoffDate) continue; // Skip old articles
        }

        const titleMatch = item.match(titleRegex);
        if (titleMatch) {
            const title = cleanText((titleMatch[1] || titleMatch[2] || '').trim());
            if (title && title.length > 10 && title.length < 140) {
                headlines.push(title);
            }
        }
    }

    return headlines.length > 0 ? headlines : FALLBACK_HEADLINES;
}

export async function GET() {
    try {
        // Return cached if fresh
        if (cachedHeadlines && Date.now() - cacheTimestamp < CACHE_DURATION) {
            return NextResponse.json({ headlines: cachedHeadlines, cached: true });
        }

        const response = await fetch(RSS_URL, {
            next: { revalidate: 1800 },
            headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' },
        });

        if (!response.ok) {
            throw new Error(`RSS fetch failed: ${response.status}`);
        }

        const xml = await response.text();
        const headlines = extractHeadlines(xml);

        // Cache the result
        cachedHeadlines = headlines;
        cacheTimestamp = Date.now();

        return NextResponse.json({ headlines, cached: false, count: headlines.length });
    } catch (error) {
        console.error('[DJ News] RSS fetch error:', error);
        return NextResponse.json({ headlines: FALLBACK_HEADLINES, cached: false, fallback: true });
    }
}
