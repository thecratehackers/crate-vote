import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    // In a real hackathon crunch, we might scrape or use a hidden key.
    // However, to be robust for the user without them needing a key immediately:
    // We will attempt to use the YouTube Data API if they have a key, 
    // OR fall back to a "no-key" scrape method if possible (brittle but effective for demos),
    // OR return a mock ID if we are in pure dev/offline mode.

    // BUT the user asked for "No Setup". 
    // The most reliable "No Setup" way to play a song on the web is actually 
    // just searching YouTube.com and scraping the first result's ID.
    // Since I cannot easily install a scraper library like puppeteer in this environment without bloat,
    // I will use a simple fetch to YouTube's search results page and regex the first videoId.
    // It's "gray hat" but works perfect for a hackathon.

    try {
        // Attempt 1: Fetch search page results
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        // Note: fetch from server-side usually works for YouTube if user-agent is set
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();

        // Regex to find "videoId":"kami_sH2o44" pattern
        // This pattern appears in the huge initial data JSON blob
        const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);

        if (videoIdMatch && videoIdMatch[1]) {
            return NextResponse.json({ videoId: videoIdMatch[1] });
        }

        // Fallback for demo if scrape fails (e.g. YouTube blocks server IP)
        // Rick Roll / Never Gonna Give You Up is a safe "fail-open" for testing
        // but let's try to be helpful. 
        console.error('YouTube scrape failed to find video ID');
        return NextResponse.json({ error: 'Could not resolve video' }, { status: 404 });

    } catch (error) {
        console.error('Resolve API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
