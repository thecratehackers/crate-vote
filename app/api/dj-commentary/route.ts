import { NextResponse } from 'next/server';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// ===== IN-MEMORY CACHE =====
interface CommentaryCache {
    commentary: string;
    timestamp: number;
    playlistHash: string;
}
let cachedCommentary: CommentaryCache | null = null;
const CACHE_TTL_MS = 90 * 1000; // 90 seconds — keeps it fresh but doesn't burn credits

// ===== FALLBACK COMMENTARY =====
// Used when no API key is configured or when rate-limited
function generateFallbackCommentary(data: {
    currentSong: string;
    currentArtist: string;
    currentSongScore: number;
    topSong: string;
    topArtist: string;
    topScore: number;
    totalSongs: number;
    totalVotes: number;
    contributors: number;
    playlistTitle: string;
}): string {
    const theme = data.playlistTitle ? ` for "${data.playlistTitle}"` : '';
    const scoreLabel = data.currentSongScore > 0 ? `+${data.currentSongScore}` : `${data.currentSongScore}`;
    const lines = [
        `"${data.currentSong}" by ${data.currentArtist} is on the floor at ${scoreLabel} votes — and ${data.totalVotes} total votes are shaping this crate${theme}.`,
        `${data.contributors} DJs are battling it out with ${data.totalSongs} songs in the crate${theme}. The crowd is LOCKED IN tonight.`,
        `"${data.topSong}" by ${data.topArtist} is sitting at #1 with +${data.topScore} votes — but challengers are coming up fast.`,
        `${data.totalSongs} tracks deep${theme}, ${data.totalVotes} votes cast — this playlist is writing itself and the crowd won't stop.`,
        `"${data.currentSong}" holding at ${scoreLabel} — ${data.contributors} contributors are all in on this set${theme}.`,
        `The #1 spot belongs to "${data.topSong}" at +${data.topScore} — but in Crate Hackers, nothing stays on top for long.`,
        `${data.totalVotes} votes prove this crowd knows what they want${theme}. "${data.currentSong}" is the vibe right now.`,
        `${data.contributors} DJs have curated ${data.totalSongs} songs${theme} — every vote is moving the needle on this live set.`,
    ];

    return lines[Math.floor(Math.random() * lines.length)];
}

// ===== PERPLEXITY DJ COMMENTARY =====
async function fetchAICommentary(data: {
    currentSong: string;
    currentArtist: string;
    currentSongScore: number;
    topSong: string;
    topArtist: string;
    topScore: number;
    totalSongs: number;
    totalVotes: number;
    contributors: number;
    recentActivity: string;
    playlistTitle: string;
}): Promise<string> {
    if (!PERPLEXITY_API_KEY) {
        return generateFallbackCommentary(data);
    }

    const themeContext = data.playlistTitle
        ? `\n- CRATE THEME: "${data.playlistTitle}" — reference this theme when relevant`
        : '';

    const scoreLabel = data.currentSongScore > 0 ? `+${data.currentSongScore}` : `${data.currentSongScore}`;

    const prompt = `You are an ESPN-style color commentator for a LIVE DJ music voting event called "Crate Hackers". The audience is voting on songs in real time.

HERE IS WHAT IS ACTUALLY HAPPENING RIGHT NOW — only reference these REAL facts:
- NOW PLAYING: "${data.currentSong}" by ${data.currentArtist} (currently at ${scoreLabel} votes)
- #1 SONG: "${data.topSong}" by ${data.topArtist} with +${data.topScore} votes
- PLAYLIST: ${data.totalSongs} songs in the crate, ${data.totalVotes} total votes cast, ${data.contributors} DJs contributing
- RECENT ACTIVITY: ${data.recentActivity}${themeContext}

Write ONE short, punchy commentary line (max 180 characters) that a sports commentator would say about this live music voting event.
RULES:
1. Reference SPECIFIC songs, artists, scores, or stats from the data above — be ACCURATE
2. React to what's actually happening: Is the current song gaining votes? Is one song dominating? Are votes close?
3. Use music terminology mixed with sports/broadcast energy
4. NO hashtags, NO emojis — just raw broadcast energy
5. NEVER make up song names, artists, or stats that aren't in the data above

Examples of the tone:
- "${data.currentSong} holding steady at ${scoreLabel} — this crowd is riding the wave!"
- "${data.topSong} won't give up that #1 spot — +${data.topScore} votes and STILL climbing!"
- "${data.contributors} DJs deep and ${data.totalSongs} tracks in the crate — this set is STACKED tonight!"`;

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
                        content: 'You are an energy-packed ESPN sports commentator covering a live DJ music voting event. Keep it under 180 characters. One line only. Pure hype. ONLY reference real data given to you — never invent songs, artists, or stats.',
                    },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 200,
                temperature: 0.9,
            }),
        });

        if (!response.ok) {
            console.error(`❌ DJ Commentary API error: ${response.status}`);
            return generateFallbackCommentary(data);
        }

        const result = await response.json();
        const raw = result.choices?.[0]?.message?.content || '';

        // Clean up: remove quotes, trim, take first line only
        const cleaned = raw
            .replace(/^["']|["']$/g, '')
            .split('\n')[0]
            .trim()
            .slice(0, 200);

        return cleaned || generateFallbackCommentary(data);
    } catch (error) {
        console.error('❌ DJ Commentary fetch failed:', error);
        return generateFallbackCommentary(data);
    }
}

// ===== API ROUTE =====
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            currentSong = 'Unknown',
            currentArtist = 'Unknown',
            currentSongScore = 0,
            topSong = 'Unknown',
            topArtist = 'Unknown',
            topScore = 0,
            totalSongs = 0,
            totalVotes = 0,
            contributors = 0,
            recentActivity = 'Votes are coming in',
            playlistTitle = '',
        } = body;

        // Simple hash to detect if playlist state has changed
        const playlistHash = `${currentSong}-${topSong}-${topScore}-${totalSongs}-${totalVotes}`;

        // Return cached if still fresh AND playlist hasn't changed much
        if (
            cachedCommentary &&
            Date.now() - cachedCommentary.timestamp < CACHE_TTL_MS &&
            cachedCommentary.playlistHash === playlistHash
        ) {
            return NextResponse.json({
                commentary: cachedCommentary.commentary,
                cached: true,
            });
        }

        const commentary = await fetchAICommentary({
            currentSong,
            currentArtist,
            currentSongScore,
            topSong,
            topArtist,
            topScore,
            totalSongs,
            totalVotes,
            contributors,
            recentActivity,
            playlistTitle,
        });

        // Cache it
        cachedCommentary = {
            commentary,
            timestamp: Date.now(),
            playlistHash,
        };

        return NextResponse.json({ commentary, cached: false });
    } catch (error) {
        console.error('❌ DJ Commentary route error:', error);
        return NextResponse.json({
            commentary: 'The crowd is in control tonight — every vote shapes the playlist!',
            cached: false,
            error: true,
        });
    }
}
