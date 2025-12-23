import { NextResponse } from 'next/server';

const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;

interface GeniusSongData {
    id: number;
    title: string;
    artist: string;
    releaseDate?: string;
    albumArt?: string;
    description?: string;
    producers?: string[];
    writers?: string[];
    facts: string[];
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const artist = searchParams.get('artist');
    const title = searchParams.get('title');

    if (!artist || !title) {
        return NextResponse.json({ error: 'Missing artist or title' }, { status: 400 });
    }

    if (!GENIUS_ACCESS_TOKEN) {
        // Return mock data if no API key
        return NextResponse.json({
            facts: generateMockFacts(artist, title),
            source: 'mock'
        });
    }

    try {
        // Search for the song on Genius
        const searchQuery = encodeURIComponent(`${artist} ${title}`);
        const searchResponse = await fetch(
            `https://api.genius.com/search?q=${searchQuery}`,
            {
                headers: { 'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}` }
            }
        );

        if (!searchResponse.ok) {
            throw new Error('Genius search failed');
        }

        const searchData = await searchResponse.json();
        const hit = searchData.response?.hits?.[0]?.result;

        if (!hit) {
            return NextResponse.json({
                facts: generateMockFacts(artist, title),
                source: 'mock'
            });
        }

        // Get detailed song info
        const songResponse = await fetch(
            `https://api.genius.com/songs/${hit.id}`,
            {
                headers: { 'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}` }
            }
        );

        const songData = await songResponse.json();
        const song = songData.response?.song;

        if (!song) {
            return NextResponse.json({
                facts: generateMockFacts(artist, title),
                source: 'mock'
            });
        }

        // Extract facts from Genius data
        const facts = extractFacts(song, artist, title);

        return NextResponse.json({
            id: song.id,
            title: song.title,
            artist: song.primary_artist?.name || artist,
            releaseDate: song.release_date_for_display,
            albumArt: song.song_art_image_url,
            description: song.description?.plain,
            facts,
            source: 'genius'
        });

    } catch (error) {
        console.error('Genius API error:', error);
        return NextResponse.json({
            facts: generateMockFacts(artist, title),
            source: 'fallback'
        });
    }
}

function extractFacts(song: any, artist: string, title: string): string[] {
    const facts: string[] = [];

    // Release date
    if (song.release_date_for_display) {
        facts.push(`📅 "${title}" was released on ${song.release_date_for_display}.`);
    }

    // Producer credits
    if (song.producer_artists?.length > 0) {
        const producers = song.producer_artists.map((p: any) => p.name).slice(0, 3);
        facts.push(`🎛️ Produced by ${producers.join(', ')}.`);
    }

    // Writer credits
    if (song.writer_artists?.length > 0) {
        const writers = song.writer_artists.map((w: any) => w.name).slice(0, 3);
        facts.push(`✍️ Written by ${writers.join(', ')}.`);
    }

    // Featured artists
    if (song.featured_artists?.length > 0) {
        const featured = song.featured_artists.map((f: any) => f.name).join(', ');
        facts.push(`🎤 Features ${featured}.`);
    }

    // Album info
    if (song.album?.name) {
        facts.push(`💿 From the album "${song.album.name}".`);
    }

    // Artist info
    if (song.primary_artist) {
        const artistInfo = song.primary_artist;
        if (artistInfo.followers_count > 10000) {
            facts.push(`🔥 ${artistInfo.name} has ${(artistInfo.followers_count / 1000).toFixed(0)}K+ followers on Genius.`);
        }
    }

    // Pageviews (popularity indicator)
    if (song.stats?.pageviews) {
        const views = song.stats.pageviews;
        if (views > 100000) {
            facts.push(`👀 This song has ${(views / 1000000).toFixed(1)}M+ views on Genius.`);
        } else if (views > 10000) {
            facts.push(`👀 This song has ${(views / 1000).toFixed(0)}K+ views on Genius.`);
        }
    }

    // Apple Music player if available
    if (song.apple_music_player_url) {
        facts.push(`🍎 Available on Apple Music.`);
    }

    // Description snippet
    if (song.description?.plain && song.description.plain.length > 50) {
        const desc = song.description.plain.substring(0, 120).trim();
        if (desc && !desc.includes('?')) {
            facts.push(`📝 ${desc}...`);
        }
    }

    // Add some generic facts about the artist
    facts.push(`🎤 Performed by ${song.primary_artist?.name || artist}.`);

    return facts;
}

function generateMockFacts(artist: string, title: string): string[] {
    return [
        `🎤 "${title}" is performed by ${artist}.`,
        `🎵 This track is heating up the playlist!`,
        `🔥 Crowd favorite right now.`,
        `📱 Vote to keep this one playing!`,
        `⚡ The vibe is strong with this one.`,
    ];
}
