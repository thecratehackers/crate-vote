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
        console.log('⚠️ No GENIUS_ACCESS_TOKEN configured - using mock facts');
        // Return mock data if no API key
        return NextResponse.json({
            facts: generateMockFacts(artist, title),
            source: 'mock',
            note: 'Add GENIUS_ACCESS_TOKEN env var for real song facts'
        });
    }

    try {
        console.log(`🎵 Fetching Genius data for: ${artist} - ${title}`);

        // Search for the song on Genius
        const searchQuery = encodeURIComponent(`${artist} ${title}`);
        const searchResponse = await fetch(
            `https://api.genius.com/search?q=${searchQuery}`,
            {
                headers: { 'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}` }
            }
        );

        if (!searchResponse.ok) {
            console.error('Genius search failed:', searchResponse.status);
            throw new Error('Genius search failed');
        }

        const searchData = await searchResponse.json();
        const hit = searchData.response?.hits?.[0]?.result;

        if (!hit) {
            console.log('No Genius results found, using mock data');
            return NextResponse.json({
                facts: generateMockFacts(artist, title),
                source: 'mock'
            });
        }

        console.log(`✅ Found Genius song: ${hit.full_title} (ID: ${hit.id})`);

        // Get detailed song info
        const songResponse = await fetch(
            `https://api.genius.com/songs/${hit.id}?text_format=plain`,
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

        // Try to get referents (annotations) for extra trivia
        let annotations: string[] = [];
        try {
            const referentsResponse = await fetch(
                `https://api.genius.com/referents?song_id=${hit.id}&text_format=plain&per_page=5`,
                {
                    headers: { 'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}` }
                }
            );
            if (referentsResponse.ok) {
                const referentsData = await referentsResponse.json();
                annotations = (referentsData.response?.referents || [])
                    .filter((r: any) => r.annotations?.[0]?.body?.plain)
                    .map((r: any) => r.annotations[0].body.plain)
                    .filter((text: string) => text.length > 20 && text.length < 200)
                    .slice(0, 3);

                console.log(`📝 Found ${annotations.length} annotations`);
            }
        } catch (e) {
            console.log('Could not fetch annotations');
        }

        // Extract facts from Genius data
        const facts = extractFacts(song, artist, title, annotations);

        console.log(`🎯 Generated ${facts.length} facts from Genius data`);

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

function extractFacts(song: any, artist: string, title: string, annotations: string[] = []): string[] {
    const facts: string[] = [];

    // Release date
    if (song.release_date_for_display) {
        facts.push(`📅 "${title}" was released on ${song.release_date_for_display}.`);

        // Calculate how long ago
        const releaseYear = parseInt(song.release_date_for_display.split(', ')[1] || song.release_date_for_display.split(' ')[2]);
        if (releaseYear && !isNaN(releaseYear)) {
            const yearsAgo = new Date().getFullYear() - releaseYear;
            if (yearsAgo > 0 && yearsAgo <= 50) {
                facts.push(`⏰ This track dropped ${yearsAgo} year${yearsAgo > 1 ? 's' : ''} ago.`);
            }
        }
    }

    // Producer credits
    if (song.producer_artists?.length > 0) {
        const producers = song.producer_artists.map((p: any) => p.name).slice(0, 3);
        facts.push(`🎛️ Produced by ${producers.join(', ')}.`);
        if (song.producer_artists.length > 3) {
            facts.push(`🎚️ ${song.producer_artists.length} producers worked on this track!`);
        }
    }

    // Writer credits
    if (song.writer_artists?.length > 0) {
        const writers = song.writer_artists.map((w: any) => w.name).slice(0, 3);
        facts.push(`✍️ Written by ${writers.join(', ')}.`);
        if (song.writer_artists.length > 3) {
            facts.push(`📝 ${song.writer_artists.length} writers collaborated on this song.`);
        }
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

    // Recording location
    if (song.recording_location) {
        facts.push(`🎙️ Recorded at ${song.recording_location}.`);
    }

    // Label
    if (song.custom_song_art_image_content_type || song.label_name) {
        const label = song.label_name || song.label?.name;
        if (label) {
            facts.push(`🏷️ Released under ${label}.`);
        }
    }

    // Artist info with more depth
    if (song.primary_artist) {
        const artistInfo = song.primary_artist;

        // Follower count
        if (artistInfo.followers_count > 100000) {
            facts.push(`🔥 ${artistInfo.name} has ${(artistInfo.followers_count / 1000000).toFixed(1)}M+ followers on Genius.`);
        } else if (artistInfo.followers_count > 10000) {
            facts.push(`🔥 ${artistInfo.name} has ${(artistInfo.followers_count / 1000).toFixed(0)}K+ followers on Genius.`);
        }

        // IQ (engagement score)
        if (artistInfo.iq > 1000) {
            facts.push(`🧠 ${artistInfo.name} has ${artistInfo.iq} IQ on Genius (top-tier engagement).`);
        }

        // Artist description
        if (artistInfo.description?.plain?.length > 30) {
            const desc = artistInfo.description.plain.substring(0, 100).trim();
            if (desc && !desc.includes('?')) {
                facts.push(`📖 About ${artistInfo.name}: ${desc}...`);
            }
        }
    }

    // Pageviews (popularity indicator)
    if (song.stats?.pageviews) {
        const views = song.stats.pageviews;
        if (views > 1000000) {
            facts.push(`👀 This song has ${(views / 1000000).toFixed(1)}M+ views on Genius!`);
        } else if (views > 100000) {
            facts.push(`👀 This song has ${(views / 1000).toFixed(0)}K+ views on Genius.`);
        } else if (views > 10000) {
            facts.push(`📈 Trending with ${(views / 1000).toFixed(0)}K+ Genius views.`);
        }
    }

    // Hot status
    if (song.stats?.hot) {
        facts.push(`🔥 Currently TRENDING on Genius!`);
    }

    // Annotation count (lyric breakdowns)
    if (song.annotation_count > 10) {
        facts.push(`💬 ${song.annotation_count} lyric annotations on Genius.`);
    }

    // Verified annotations
    if (song.stats?.verified_annotations) {
        facts.push(`✅ Has verified artist annotations explaining the lyrics.`);
    }

    // Apple Music player if available
    if (song.apple_music_player_url) {
        facts.push(`🍎 Available on Apple Music.`);
    }

    // Spotify link check
    if (song.media?.find((m: any) => m.provider === 'spotify')) {
        facts.push(`💚 Listen on Spotify.`);
    }

    // Description snippet
    if (song.description?.plain && song.description.plain.length > 50) {
        const desc = song.description.plain.substring(0, 140).trim();
        if (desc && !desc.includes('?') && !desc.toLowerCase().includes('edit')) {
            facts.push(`📝 ${desc}...`);
        }
    }

    // 🎯 ADD USER ANNOTATIONS FROM GENIUS - The real trivia!
    annotations.forEach((annotation, i) => {
        // Clean up and format the annotation
        const cleaned = annotation.replace(/\n/g, ' ').trim();
        if (cleaned.length > 30) {
            facts.push(`💎 "${cleaned.substring(0, 120)}${cleaned.length > 120 ? '...' : ''}"`);
        }
    });

    // Add performer fact
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
        `👆 Upvote if this song is fire.`,
        `👇 Downvote to skip the duds.`,
        `🎧 ${artist} knows how to make a hit.`,
        `🏆 Could be the next #1 on the playlist!`,
        `💎 Added by someone with great taste.`,
    ];
}
