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
    topSong: string;
    topArtist: string;
    topScore: number;
    totalSongs: number;
    totalVotes: number;
    contributors: number;
    genres: string[];
}): string {
    const lines = [
        `We've got "${data.currentSong}" by ${data.currentArtist} spinning right now — and ${data.totalVotes} votes are shaping this playlist in real time.`,
        `${data.contributors} DJs are battling it out with ${data.totalSongs} songs in the crate. The crowd is LOCKED IN tonight.`,
        `"${data.topSong}" by ${data.topArtist} is sitting at #1 with +${data.topScore} votes — but challengers are coming up fast.`,
        `The energy in this playlist is building — ${data.totalVotes} votes cast so far. This is what crowd-powered music looks like.`,
        `${data.totalSongs} tracks in the crate, ${data.contributors} contributors mixing it up. This set is writing itself.`,
        `"${data.currentSong}" has the floor right now. ${data.totalVotes} votes prove this crowd knows what they want.`,
        `Late-night energy check: ${data.contributors} DJs have curated ${data.totalSongs} songs — and every vote is moving the needle.`,
        `The #1 spot belongs to "${data.topSong}" — but in Crate Hackers, nothing stays on top for long.`,
    ];

    return lines[Math.floor(Math.random() * lines.length)];
}

// ===== PERPLEXITY DJ COMMENTARY =====
async function fetchAICommentary(data: {
    currentSong: string;
    currentArtist: string;
    topSong: string;
    topArtist: string;
    topScore: number;
    totalSongs: number;
    totalVotes: number;
    contributors: number;
    recentActivity: string;
}): Promise<string> {
    if (!PERPLEXITY_API_KEY) {
        return generateFallbackCommentary(data as any);
    }

    const prompt = `You are an ESPN-style color commentator for a LIVE DJ music voting event called "Crate Hackers". The audience is voting on songs in real time.

Current state:
- NOW PLAYING: "${data.currentSong}" by ${data.currentArtist}
- #1 SONG: "${data.topSong}" by ${data.topArtist} with +${data.topScore} votes
- TOTAL: ${data.totalSongs} songs in the crate, ${data.totalVotes} votes cast, ${data.contributors} DJs contributing
- RECENT: ${data.recentActivity}

Write ONE short, punchy commentary line (max 180 characters) that a sports commentator would say about this live music voting event. 
Be hyped, use music terminology mixed with sports energy. Reference specific songs/artists from the data above.
NO hashtags. NO emojis. Just raw broadcast energy.

Examples of the tone:
- "Three Latin tracks in a row — this crowd is LOCKED IN on the reggaeton wave tonight!"
- "That's a power move — 'Blinding Lights' just leapfrogged two spots in under a minute!"
- "We've got a heavyweight fight brewing at the top — and the crowd is eating it UP!"`;

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
                        content: 'You are an energy-packed ESPN sports commentator covering a live DJ music voting event. Keep it under 180 characters. One line only. Pure hype.',
                    },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 200,
                temperature: 0.9,
            }),
        });

        if (!response.ok) {
            console.error(`❌ DJ Commentary API error: ${response.status}`);
            return generateFallbackCommentary(data as any);
        }

        const result = await response.json();
        const raw = result.choices?.[0]?.message?.content || '';

        // Clean up: remove quotes, trim, take first line only
        const cleaned = raw
            .replace(/^["']|["']$/g, '')
            .split('\n')[0]
            .trim()
            .slice(0, 200);

        return cleaned || generateFallbackCommentary(data as any);
    } catch (error) {
        console.error('❌ DJ Commentary fetch failed:', error);
        return generateFallbackCommentary(data as any);
    }
}

// ===== API ROUTE =====
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            currentSong = 'Unknown',
            currentArtist = 'Unknown',
            topSong = 'Unknown',
            topArtist = 'Unknown',
            topScore = 0,
            totalSongs = 0,
            totalVotes = 0,
            contributors = 0,
            recentActivity = 'Votes are coming in',
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
            topSong,
            topArtist,
            topScore,
            totalSongs,
            totalVotes,
            contributors,
            recentActivity,
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
