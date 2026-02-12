'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import './JukeboxPlayer.css';
import { APP_CONFIG, BROADCAST } from '@/lib/config';
import { SoundEffects } from '@/lib/sounds';
import { sfx } from '@/lib/sfx';

interface Song {
    id: string;
    name: string;
    artist: string;
    albumArt: string;
    score: number;
    addedByName?: string;
    addedByLocation?: string;
    addedByColor?: string;
    // DJ metadata
    bpm?: number | null;
    energy?: number | null;
    valence?: number | null;
    danceability?: number | null;
    camelotKey?: string | null;
    popularity?: number;
}

interface ServerActivity {
    id: string;
    type: 'add' | 'upvote' | 'downvote';
    userName: string;
    songName: string;
    timestamp: number;
}

interface JukeboxPlayerProps {
    currentSong: Song;
    videoId: string;
    playlist: Song[];
    onClose: () => void;
    onNextSong: (songId: string) => void;
    onVote?: (songId: string, delta: number) => void;
    onKarmaEarned?: () => void;
    visitorId?: string;
    // 📺 BROADCAST MODE
    streamMode?: boolean;
    viewerCount?: number;
    currentTheme?: { name: string; emoji: string; endsAt: number };
    // 📢 LIVE ACTIVITY from server
    liveActivity?: ServerActivity[];
    // 📦 Current week's crate/playlist title
    playlistTitle?: string;
}

declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: (() => void) | undefined;
    }
}

// ===== POP-UP VIDEO FACTS SYSTEM =====
interface PopUpFact {
    category: string;
    emoji: string;
    text: string;
    id: string;
}

// Era/cultural data for Pop-Up Video style facts
const eraData: Record<string, { name: string; fashion: string[]; events: string[]; tech: string[]; slang: string[]; music: string[] }> = {
    '1970s': {
        name: 'The Disco Era',
        fashion: ['bell-bottoms', 'platform shoes', 'polyester suits', 'wide collars'],
        events: ['Vietnam War ends', 'Watergate scandal', 'Star Wars releases'],
        tech: ['VCRs introduced', 'First video games', 'Walkman invented'],
        slang: ['groovy', 'far out', 'right on'],
        music: ['Disco ruled the charts', 'Vinyl was king', 'Studio 54 was THE place'],
    },
    '1980s': {
        name: 'The MTV Era',
        fashion: ['shoulder pads', 'leg warmers', 'acid-wash jeans', 'big hair'],
        events: ['MTV launches', 'Berlin Wall falls', 'Live Aid concert'],
        tech: ['Personal computers', 'CDs replace vinyl', 'Nintendo NES'],
        slang: ['gnarly', 'radical', 'totally tubular'],
        music: ['MTV changed everything', 'Synths were everywhere', 'Hair bands dominated'],
    },
    '1990s': {
        name: 'The Alternative Era',
        fashion: ['grunge flannel', 'baggy jeans', 'chokers', 'platform sneakers'],
        events: ['Fall of USSR', 'O.J. Simpson trial', 'Y2K panic'],
        tech: ['World Wide Web', 'DVD players', 'Nokia phones'],
        slang: ['all that', 'da bomb', 'talk to the hand'],
        music: ['Grunge killed hair metal', 'Hip-hop went mainstream', 'Boy bands emerged'],
    },
    '2000s': {
        name: 'The Y2K Era',
        fashion: ['low-rise jeans', 'velour tracksuits', 'trucker hats', 'Ugg boots'],
        events: ['9/11 attacks', 'Iraq War begins', 'Facebook launches'],
        tech: ['iPod revolution', 'Myspace era', 'Flip phones'],
        slang: ['bling', 'fo shizzle', 'that\'s hot'],
        music: ['Napster shook the industry', 'Ringtones were a thing', 'Auto-tune took over'],
    },
    '2010s': {
        name: 'The Streaming Era',
        fashion: ['athleisure', 'skinny jeans', 'statement sneakers', 'minimalist style'],
        events: ['Obama presidency', 'Marriage equality', 'MeToo movement'],
        tech: ['Smartphones everywhere', 'Instagram explosion', 'Spotify streaming'],
        slang: ['lit', 'slay', 'on fleek', 'goals'],
        music: ['Streaming killed the radio star', 'EDM exploded', 'Drake dominated'],
    },
    '2020s': {
        name: 'The TikTok Era',
        fashion: ['Y2K revival', 'cottagecore', 'oversized everything', 'chunky sneakers'],
        events: ['COVID-19 pandemic', 'BLM protests', 'AI revolution'],
        tech: ['TikTok dominance', 'ChatGPT', 'Remote work'],
        slang: ['no cap', 'bussin', 'it\'s giving', 'understood the assignment'],
        music: ['TikTok makes hits', 'AI is writing songs', '30-second hooks rule'],
    },
};

function getEra(year: number) {
    if (year < 1980) return eraData['1970s'];
    if (year < 1990) return eraData['1980s'];
    if (year < 2000) return eraData['1990s'];
    if (year < 2010) return eraData['2000s'];
    if (year < 2020) return eraData['2010s'];
    return eraData['2020s'];
}

function getEraName(year: number) {
    if (year < 1980) return '1970s';
    if (year < 1990) return '1980s';
    if (year < 2000) return '1990s';
    if (year < 2010) return '2000s';
    if (year < 2020) return '2010s';
    return '2020s';
}

// Generate all facts for a song
function generateFacts(songName: string, artistName: string, releaseYear: number): PopUpFact[] {
    const facts: PopUpFact[] = [];
    const era = getEra(releaseYear);
    const eraName = getEraName(releaseYear);
    const yearsAgo = new Date().getFullYear() - releaseYear;

    // Song facts
    facts.push({ category: 'Release', emoji: '💽', text: `"${songName}" dropped in ${releaseYear}.`, id: `release-${Date.now()}` });
    if (yearsAgo > 0 && yearsAgo < 50) {
        facts.push({ category: 'Time', emoji: '⏺️', text: `This track is ${yearsAgo} years old.`, id: `age-${Date.now()}` });
    }
    facts.push({ category: 'Artist', emoji: '🎧', text: `Performed by ${artistName}.`, id: `artist-${Date.now()}` });

    // Fashion
    era.fashion.forEach((item, i) => {
        facts.push({ category: 'Fashion', emoji: '📱', text: `In ${releaseYear}, ${item} were trending.`, id: `fashion-${i}` });
    });

    // Culture
    era.events.forEach((event, i) => {
        facts.push({ category: 'Culture', emoji: '🖥️', text: `${eraName}: ${event}.`, id: `culture-${i}` });
    });

    // Tech
    era.tech.forEach((tech, i) => {
        facts.push({ category: 'Tech', emoji: '📱', text: `${eraName} tech: ${tech}.`, id: `tech-${i}` });
    });

    // Slang
    era.slang.forEach((slang, i) => {
        facts.push({ category: 'Slang', emoji: '💬', text: `People said "${slang}" back then.`, id: `slang-${i}` });
    });

    // Music
    era.music.forEach((fact, i) => {
        facts.push({ category: 'Music', emoji: '💿', text: fact, id: `music-${i}` });
    });

    // Era
    facts.push({ category: 'Era', emoji: '🗂️', text: `This song is from ${era.name}.`, id: `era-${Date.now()}` });

    // Additional engaging facts about the artist and voting
    facts.push({ category: 'Crowd', emoji: '🧑‍💻', text: `Vote to keep "${songName}" climbing the ranks!`, id: `vote-1` });
    facts.push({ category: 'Trivia', emoji: '💬', text: `${artistName} has influenced countless artists.`, id: `trivia-1` });
    facts.push({ category: 'Vibe', emoji: '🔊', text: `This song is heating up the playlist.`, id: `vibe-1` });
    facts.push({ category: 'Action', emoji: '🎚️', text: `Upvote to push this track toward #1!`, id: `action-1` });
    facts.push({ category: 'Fun', emoji: '🎧', text: `Perfect track for the moment.`, id: `fun-1` });
    facts.push({ category: 'Karma', emoji: '⚡', text: `Watch 60 seconds to earn +1 karma!`, id: `karma-1` });
    facts.push({ category: 'Tip', emoji: '🎚️', text: `Your votes shape what plays next.`, id: `tip-1` });
    facts.push({ category: 'Music', emoji: '🔊', text: `${artistName} knows how to deliver a hit.`, id: `artist-praise` });
    facts.push({ category: 'Stats', emoji: '📊', text: `Only the top-voted songs make the final playlist.`, id: `stats-1` });
    facts.push({ category: 'Competition', emoji: '🏆', text: `Can "${songName}" reach the top 3?`, id: `compete-1` });

    // Shuffle
    for (let i = facts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [facts[i], facts[j]] = [facts[j], facts[i]];
    }

    return facts;
}

// ===== 🎛️ CRATE COACH — DJ Intel Tips Engine =====
// A seasoned DJ mentor whispering pro advice in your ear.
// DISTINCT from Pop-Up Video facts: no trivia, no culture, no era — pure craft.
// Voice: direct, opinionated, practical. Like a DJ mentor at the booth.
function generateDJTips(song: Song): string[] {
    const tips: string[] = [];
    const bpm = song.bpm;
    const energy = song.energy;
    const valence = song.valence;
    const dance = song.danceability;
    const key = song.camelotKey;

    // ── BPM TECHNIQUE ──
    if (bpm) {
        // Tempo classification
        if (bpm < 95) {
            tips.push(`At ${bpm} BPM, you're in slow-burn territory. Don't rush it — let the groove breathe.`);
            tips.push(`${bpm} BPM is first-dance speed. Wedding DJs, bookmark this one.`);
        } else if (bpm < 108) {
            tips.push(`${bpm} BPM — hip-hop / R&B pocket. Layer this with a sub-bass intro for max impact.`);
            tips.push(`This tempo sits in the late-night R&B zone. Dim the lights and let it ride.`);
        } else if (bpm < 120) {
            tips.push(`${bpm} BPM — mid-tempo sweet spot. Pairs well before or after a high-energy run.`);
            tips.push(`At ${bpm}, you can pitch up +3% into club range or down into groove territory. Versatile.`);
        } else if (bpm < 130) {
            tips.push(`${bpm} BPM is the four-on-the-floor sweet spot. This is where clubs live.`);
            tips.push(`Classic dance tempo at ${bpm}. You can ride here for 3-4 tracks without losing the floor.`);
        } else if (bpm < 140) {
            tips.push(`${bpm} BPM — you're pushing energy. Don't stay here too long or the crowd will burn out.`);
        } else {
            tips.push(`${bpm} BPM is full send. Use this as your climax moment, then bring it back down.`);
        }
        tips.push(`Mixing window: stay within ${bpm - 3}–${bpm + 3} BPM to keep transitions invisible.`);
        tips.push(`Beyond ±5 BPM and your beatmatch will sound forced. Pitch-ride or cut-mix instead.`);
    }

    // ── CAMELOT KEY THEORY ──
    if (key) {
        const num = parseInt(key);
        const letter = key.replace(/[0-9]/g, '');
        if (!isNaN(num)) {
            const prev = num === 1 ? 12 : num - 1;
            const next = num === 12 ? 1 : num + 1;
            const opposite = letter === 'A' ? 'B' : 'A';
            tips.push(`Camelot ${key} → your safe moves are ${prev}${letter}, ${next}${letter}, or ${num}${opposite}. Anything else, tread carefully.`);
            tips.push(`Jump to ${next}${letter} for a lift. Drop to ${prev}${letter} to pull the mood down. That's your storytelling dial.`);
            tips.push(`${num}${opposite} is your energy flip — same pitch center, different emotion. Use it for dramatic shifts.`);
        }
        tips.push(`Key-locked mixing is the difference between sounding smooth and sounding like two songs fighting.`);
    }

    // ── ENERGY ARC MANAGEMENT ──
    if (energy !== null && energy !== undefined) {
        if (energy >= 0.85) {
            tips.push('This track is a room-shaker. Drop it when the floor is already warm — never cold-open with a peak.');
            tips.push('After a track this intense, give the crowd a 15-second breather. A quick breakdown does wonders.');
            tips.push('Peak energy — if you play two of these back-to-back, the third better be a cooldown or you\'ll empty the floor.');
        } else if (energy >= 0.65) {
            tips.push('Solid build energy. This is your "second gear" — prime the room before you drop the hammer.');
            tips.push('Mid-high energy is workhouse territory. These are the tracks that hold a set together between peaks.');
        } else if (energy >= 0.4) {
            tips.push('Controlled energy here. Perfect for rebuilding after a peak or pacing a long set.');
            tips.push('This energy level is your reset button. Use it after every 3-4 high-energy tracks.');
        } else {
            tips.push('Low energy — this is an opening track or a post-peak cool-down. Set the mood, don\'t chase the hype.');
            tips.push('Ambient energy. The pros know: sometimes the most powerful move is pulling back.');
        }
    }

    // ── FLOOR READINESS ──
    if (dance !== null && dance !== undefined) {
        if (dance >= 0.85) {
            tips.push('Danceability is off the charts. If the floor isn\'t moving, check the sound system — not the track.');
            tips.push('This groove is automatic. You could literally walk away from the decks and the floor would hold.');
        } else if (dance >= 0.65) {
            tips.push('Strong groove. Most crowds will move to this — your safe pick when you\'re reading a new room.');
        } else if (dance >= 0.45) {
            tips.push('Moderate groove. This works if the crowd is already warmed up. Risky as an opener.');
        } else {
            tips.push('Low groove factor. This isn\'t a floor-filler — use it as texture between bangers or during dinner service.');
        }
    }

    // ── MOOD CONTROL ──
    if (valence !== null && valence !== undefined) {
        if (valence >= 0.75) {
            tips.push('Happy track. The crowd will sing along if they know the words — give them the chance.');
            tips.push('Positive energy radiates. Stack a few of these back-to-back for an euphoric run.');
        } else if (valence >= 0.45) {
            tips.push('Emotionally neutral. This is your "connective tissue" — bridges two different moods seamlessly.');
        } else {
            tips.push('Darker mood. Build tension with this, then release it with something bright. That\'s storytelling.');
            tips.push('Moody tracks need the right moment. Don\'t drop these when the crowd is shouting for bangers.');
        }
    }

    // ── CROWD INTELLIGENCE ──
    if (song.popularity !== undefined) {
        if (song.popularity >= 80) {
            tips.push('High recognition. Play the intro and watch heads turn — that\'s your cue to drop the bass.');
            tips.push('Everyone knows this one. The trick is WHEN you play it, not IF. Save it for the right moment.');
        } else if (song.popularity >= 60) {
            tips.push('Familiar enough to land. Won\'t get a singalong, but nobody\'s leaving the floor either.');
        } else if (song.popularity >= 35) {
            tips.push('Deeper pick. You\'ll separate yourself from the playlist DJs with selections like this.');
            tips.push('Not a mainstream pick, but that\'s the point. The real ones will notice.');
        } else {
            tips.push('Underground heat. The crowd won\'t know this yet — which means they\'ll remember YOU for playing it.');
        }
    }

    // ── SCENARIO READS (combined features) ──
    if (bpm && energy !== null && energy !== undefined) {
        if (bpm >= 120 && bpm <= 130 && energy >= 0.75) {
            tips.push('Club-ready in every category. This is the track you play when you feel the room lock in.');
        }
        if (bpm >= 118 && bpm <= 132 && energy >= 0.5 && energy <= 0.75) {
            tips.push('Wedding reception sweet spot — energetic enough to keep people up, controlled enough to not scare grandma.');
        }
    }
    if (dance !== null && dance !== undefined && valence !== null && valence !== undefined) {
        if (dance >= 0.75 && valence >= 0.65) {
            tips.push('Danceability + happiness = the crowd is about to go off. This is your "hands in the air" moment.');
        }
        if (dance >= 0.6 && valence < 0.35) {
            tips.push('Groovy but moody — underground club vibes. Dark rooms and strobe lights were made for this.');
        }
    }
    if (bpm && dance !== null && dance !== undefined) {
        if (bpm < 100 && dance >= 0.7) {
            tips.push('Slow BPM with high groove is a deadly combo. Think late-night after-party. This track owns that space.');
        }
    }

    // ── CRAFT FUNDAMENTALS (always rotate a few) ──
    tips.push('EQ your bass during transitions. Two bass lines at once is amateur hour.');
    tips.push('Loop the last 4 bars of the outro — gives you an extra 16 beats to nail the transition.');
    tips.push('Watch the crowd\'s feet, not their phones. Feet tell you the truth about whether they\'re feeling it.');
    tips.push('High-pass filter into the next track creates tension. Cut the filter at the drop for maximum impact.');
    tips.push('The best DJs play for the room, not for themselves. Your personal taste is the starting point, not the destination.');
    tips.push('Dead air is death. Always have your next track cued and ready before the current one hits the outro.');
    tips.push('If you\'re reaching for the mic, you better have something worth saying. Let the music do the talking.');
    tips.push('Three bangers in a row, then a breather. The human body literally can\'t sustain peak energy for more than 10 minutes.');
    tips.push('The transition IS the performance. Anyone can play great songs — the mix in between is where DJs earn respect.');
    tips.push('Never apologize for your track selection on the mic. Confidence is contagious — own every song you play.');

    // Shuffle for variety
    for (let i = tips.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tips[i], tips[j]] = [tips[j], tips[i]];
    }

    return tips;
}

// Pop-up bubble positions
const POPUP_POSITIONS = [
    { top: '8%', left: '5%' },
    { top: '12%', right: '5%' },
    { top: '35%', left: '3%' },
    { top: '40%', right: '3%' },
    { top: '55%', left: '5%' },
    { top: '60%', right: '5%' },
];

export default function JukeboxPlayer({
    currentSong,
    videoId,
    playlist,
    onClose,
    onNextSong,
    onVote,
    onKarmaEarned,
    visitorId,
    streamMode = false,
    viewerCount = 0,
    currentTheme,
    liveActivity = [],
    playlistTitle,
}: JukeboxPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(true);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [watchTime, setWatchTime] = useState(0);
    const [karmaEarned, setKarmaEarned] = useState(false);
    const [showNextHint, setShowNextHint] = useState(false);
    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const [bannerIndex, setBannerIndex] = useState(0);
    const [nextLiveCountdown, setNextLiveCountdown] = useState('');
    const [eqBars, setEqBars] = useState<number[]>(Array(16).fill(20));
    const [glowIntensity, setGlowIntensity] = useState(0);

    // 🎛️ DJ INTEL CARD state
    const [djTips, setDjTips] = useState<string[]>([]);
    const [currentDJTipIndex, setCurrentDJTipIndex] = useState(0);

    // 🌊 WAVEFORM VISUALIZATION
    const waveformRef = useRef<HTMLCanvasElement>(null);


    // 🎬 POP-UP VIDEO FACTS (dual-bubble VH1 style)
    const [popUpFacts, setPopUpFacts] = useState<PopUpFact[]>([]);
    const [currentFact, setCurrentFact] = useState<PopUpFact | null>(null);
    const [secondFact, setSecondFact] = useState<PopUpFact | null>(null);
    const [factPosition, setFactPosition] = useState(0);
    const [secondFactPosition, setSecondFactPosition] = useState(1);
    const factIndexRef = useRef(0);

    // 🔴 LIVE ACTIVITY FEED - Real-time engagement visibility
    interface ActivityItem {
        id: string;
        type: 'vote' | 'reaction' | 'newSong' | 'rankChange';
        text: string;
        icon: string;
        timestamp: number;
    }
    const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
    const seenServerActivityRef = useRef<Set<string>>(new Set());
    const [lastScore, setLastScore] = useState<number | null>(null);
    const [lastRank, setLastRank] = useState<number | null>(null);
    const [scoreAnimation, setScoreAnimation] = useState<{ delta: number; key: number } | null>(null);
    const [rankAlert, setRankAlert] = useState<{ from: number; to: number; key: number } | null>(null);
    const [showCTA, setShowCTA] = useState(false);

    // 📺 BROADCAST MODE STATE
    interface SongAlert {
        id: string;
        songName: string;
        artistName: string;
        albumArt: string;
        addedBy: string;
        addedByLocation?: string;
        timestamp: number;
    }
    interface Achievement {
        id: string;
        text: string;
        emoji: string;
        timestamp: number;
    }
    const [songAlerts, setSongAlerts] = useState<SongAlert[]>([]);
    const [hypeLevel, setHypeLevel] = useState(0);
    const [showLowerThird, setShowLowerThird] = useState(false);
    const [eraCountdown, setEraCountdown] = useState('');
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const previousPlaylistRef = useRef<Song[]>([]);
    const hypeRef = useRef(0);
    const [totalVotes, setTotalVotes] = useState(0);
    const [currentTime, setCurrentTime] = useState('');
    const voteCountRef = useRef(0);

    // 🎨 TESLA-STYLE AMBIENT COLORS — extracted from album art
    const [ambientColors, setAmbientColors] = useState<{ primary: string; secondary: string; accent: string }>({
        primary: 'rgba(20, 15, 10, 0.6)',
        secondary: 'rgba(15, 10, 20, 0.4)',
        accent: 'rgba(10, 15, 20, 0.3)',
    });
    const ambientCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Dopamine-inducing gamification tips
    const gameTips = [
        { icon: '🔥', text: 'Vote for your favorites to push them to #1!' },
        { icon: '📦', text: 'Scan the QR to download songs & grab the Spotify playlist!' },
        { icon: '🔥', text: 'You\'re shaping the future of dance music!' },
        { icon: '📦', text: 'Your karma unlocks bonus votes!' },
        { icon: '🎧', text: 'You\'re collaborating with DJs right now!' },
        { icon: '📦', text: 'Watch 60 secs to earn +1 karma!' },
    ];

    // 📰 DJ INTELLIGENCE HEADLINES — Live from Future DJ newsletter RSS + fallback intel
    const fallbackHeadlines = [
        '📊 Wedding season peak: June–Oct bookings are up — build your crate now',
        '🎵 Trend: Latin crossover tracks dominating open format sets nationally',
        '🎙️ Pro tip: Always carry backup gear — 48% of DJ emergencies are cable failures',
        '📈 Club insight: Friday peaks at 12:30am, Saturdays peak at 1:15am',
        '🎶 Genre watch: Afrobeats +340% in US club play over 3 years',
        '💍 Wedding intel: First dance requests trending toward R&B classics',
        '🌍 Global: Amapiano continues crossover momentum into mainstream US clubs',
        '🏛️ Venue tip: Always do a sound check during the quietest part of setup',
        '📱 Tech: 73% of attendees Shazam at least 1 song per event',
        '🏆 Industry: Crate digging is back — DJs who curate playlists earn 2x more bookings',
    ];
    const [djIntelHeadlines, setDjIntelHeadlines] = useState<string[]>(fallbackHeadlines);
    const [djIntelIndex, setDjIntelIndex] = useState(0);

    // 🎤 ON THIS DAY IN MUSIC — daily rotating music history
    const [onThisDayFacts, setOnThisDayFacts] = useState<string[]>([]);
    const [onThisDayIndex, setOnThisDayIndex] = useState(0);

    // 🎙️ AI DJ COMMENTARY — ESPN-style live color commentary
    const [djCommentary, setDjCommentary] = useState<string>('');

    // 🎨 AMBIENT GLOW CSS VARS — for Tesla-style card glow
    const [ambientGlowVars, setAmbientGlowVars] = useState<Record<string, string>>({});

    // 🎯 Dynamic banner headlines — rotates per song, explains the vibe
    const bannerHeadlines = [
        { title: 'You\'re Building This Playlist Live', subtitle: 'Every vote shapes what plays next — this is YOUR soundtrack' },
        { title: 'The Crowd Is the DJ Tonight', subtitle: 'Add songs, vote them up, and watch them climb the ranks' },
        { title: 'Welcome to the Crate Hackers Jukebox', subtitle: 'A live, crowd-powered playlist — scan the QR to jump in' },
        { title: 'This Playlist Builds Itself', subtitle: 'The audience picks the music — vote to keep the vibes going' },
        { title: 'Every Vote Counts Right Now', subtitle: 'Push your favorites to #1 before the next track drops' },
        { title: 'What Plays Next Is Up to You', subtitle: 'Real-time voting decides the queue — get your picks in' },
        { title: 'The Playlist That Never Sleeps', subtitle: 'Songs are battling for the top spot — cast your vote now' },
        { title: 'Live Music Democracy in Action', subtitle: 'Scan the code, pick a name, and start shaping the sound' },
        { title: 'New Here? Jump In!', subtitle: 'Scan the QR code to add songs and vote — it\'s free and instant' },
        { title: 'Your Votes Are Moving the Needle', subtitle: 'Watch the leaderboard shift in real time as votes pour in' },
        { title: 'Don\'t Just Listen — Participate', subtitle: 'This isn\'t a playlist. It\'s a live experiment. Join in.' },
        { title: 'Can Your Song Reach #1?', subtitle: 'Add it, rally the votes, and watch it climb' },
    ];

    // 🎬 FETCH FACTS FROM GENIUS + PERPLEXITY (VH1-STYLE ENRICHMENT)
    useEffect(() => {
        const fetchAllFacts = async () => {
            // Fetch from Genius and Perplexity in parallel
            const [geniusResult, perplexityResult] = await Promise.allSettled([
                fetch(`/api/genius?artist=${encodeURIComponent(currentSong.artist)}&title=${encodeURIComponent(currentSong.name)}`)
                    .then(r => r.ok ? r.json() : null),
                fetch(`/api/song-facts?artist=${encodeURIComponent(currentSong.artist)}&title=${encodeURIComponent(currentSong.name)}`)
                    .then(r => r.ok ? r.json() : null),
            ]);

            const geniusData = geniusResult.status === 'fulfilled' ? geniusResult.value : null;
            const perplexityData = perplexityResult.status === 'fulfilled' ? perplexityResult.value : null;

            // Parse Perplexity facts (highest quality — real trivia)
            const perplexityFacts: PopUpFact[] = (perplexityData?.facts || []).map((text: string, i: number) => {
                // Extract leading emoji (first 1-2 characters if non-ASCII)
                const firstChar = text.codePointAt(0) || 0;
                const hasEmoji = firstChar > 255; // Non-ASCII = likely emoji
                const emojiLen = hasEmoji ? (firstChar > 0xFFFF ? 2 : 1) : 0;
                // Check for variation selector (️) following the emoji
                const nextChar = emojiLen > 0 ? text.charCodeAt(emojiLen) : 0;
                const fullEmojiLen = nextChar === 0xFE0F ? emojiLen + 1 : emojiLen;
                const emoji = hasEmoji ? text.slice(0, fullEmojiLen) : '💎';
                const cleanText = hasEmoji ? text.slice(fullEmojiLen).trim() : text;
                return {
                    category: 'Trivia',
                    emoji,
                    text: cleanText,
                    id: `pplx-${i}-${Date.now()}`,
                };
            });

            console.log(`🎯 Perplexity: ${perplexityFacts.length} facts | Source: ${perplexityData?.source || 'none'}`);

            // Parse Genius facts (structured metadata)
            const geniusFacts: PopUpFact[] = geniusData
                ? (geniusData.facts || []).map((text: string, i: number) => ({
                    category: text.startsWith('📅') ? 'Release' :
                        text.startsWith('🎛️') ? 'Production' :
                            text.startsWith('✍️') ? 'Credits' :
                                text.startsWith('🎤') ? 'Artist' :
                                    text.startsWith('💿') ? 'Album' :
                                        text.startsWith('🔥') || text.startsWith('👀') ? 'Stats' :
                                            text.startsWith('📝') ? 'Info' : 'Fact',
                    emoji: text.substring(0, 2),
                    text: text.substring(2).trim(),
                    id: `genius-${i}-${Date.now()}`,
                }))
                : [];

            // Generate era facts as cultural context filler
            const releaseYear = geniusData?.releaseDate
                ? parseInt(geniusData.releaseDate.split(', ')[1] || geniusData.releaseDate.split(' ')[2] || '2020')
                : new Date().getFullYear();
            const eraFacts = generateFacts(currentSong.name, currentSong.artist, releaseYear)
                // Filter out generic filler that dilutes VH1 feel
                .filter(f => ![
                    'Vote to keep', 'Upvote to push', 'Your votes shape',
                    'heating up the playlist', 'Perfect track for the moment',
                    'knows how to deliver a hit', 'has influenced countless',
                    'top-voted songs make', 'reach the top 3',
                ].some(filler => f.text.includes(filler)));

            // Priority merge: Perplexity (real trivia) → Genius (metadata) → Era (culture)
            // Include ALL facts to ensure full song coverage without repeats
            const allFacts = [
                ...perplexityFacts,
                ...geniusFacts,
                ...eraFacts,
            ];

            // Shuffle within priority bands (keep Perplexity facts weighted toward front)
            const shuffled: PopUpFact[] = [];
            // Band 1: Perplexity + Genius interleaved
            const premiumFacts = [...perplexityFacts, ...geniusFacts];
            for (let i = premiumFacts.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [premiumFacts[i], premiumFacts[j]] = [premiumFacts[j], premiumFacts[i]];
            }
            // Band 2: Era facts shuffled
            const eraSlice = [...eraFacts];
            for (let i = eraSlice.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [eraSlice[i], eraSlice[j]] = [eraSlice[j], eraSlice[i]];
            }
            shuffled.push(...premiumFacts, ...eraSlice);

            console.log(`📺 Pop-Up Video: ${shuffled.length} total facts (${perplexityFacts.length} Perplexity + ${geniusFacts.length} Genius + ${eraSlice.length} era)`);

            setPopUpFacts(shuffled.length > 0 ? shuffled : generateFacts(currentSong.name, currentSong.artist, releaseYear));
            factIndexRef.current = 0;
        };

        fetchAllFacts();
    }, [currentSong.id, currentSong.name, currentSong.artist]);

    // 📰 Fetch live DJ news headlines from RSS feed on mount
    useEffect(() => {
        fetch('/api/dj-news')
            .then(res => res.json())
            .then(data => {
                if (data.headlines && data.headlines.length > 0) {
                    // Prefix real headlines with 📰 and merge with fallback intel
                    const rssItems = data.headlines.map((h: string) => `📰 ${h}`);
                    setDjIntelHeadlines([...rssItems, ...fallbackHeadlines]);
                }
            })
            .catch(() => { /* keep fallback headlines */ });
    }, []);

    // 🎤 Fetch "On This Day in Music" facts on mount
    useEffect(() => {
        fetch('/api/on-this-day')
            .then(res => res.json())
            .then(data => {
                if (data.facts && data.facts.length > 0) {
                    setOnThisDayFacts(data.facts);
                }
            })
            .catch(() => { /* keep empty */ });
    }, []);

    // 🎤 Rotate On This Day facts every 15 seconds
    useEffect(() => {
        if (onThisDayFacts.length <= 1) return;
        const interval = setInterval(() => {
            setOnThisDayIndex(prev => (prev + 1) % onThisDayFacts.length);
        }, 15000);
        return () => clearInterval(interval);
    }, [onThisDayFacts.length]);

    // 🎙️ Fetch AI DJ Commentary every 90 seconds
    useEffect(() => {
        const fetchCommentary = () => {
            const topSong = playlist.length > 0 ? playlist[0] : null;
            fetch('/api/dj-commentary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentSong: currentSong.name,
                    currentArtist: currentSong.artist,
                    topSong: topSong?.name || 'N/A',
                    topArtist: topSong?.artist || 'N/A',
                    topScore: topSong?.score || 0,
                    totalSongs: playlist.length,
                    totalVotes: playlist.reduce((s, t) => s + Math.abs(t.score), 0),
                    contributors: new Set(playlist.map(s => s.addedByName).filter(Boolean)).size,
                    recentActivity: activityFeed.slice(0, 3).map(a => a.text).join('. ') || 'Votes are coming in',
                }),
            })
                .then(res => res.json())
                .then(data => {
                    if (data.commentary) setDjCommentary(data.commentary);
                })
                .catch(() => { /* keep previous */ });
        };
        fetchCommentary();
        const interval = setInterval(fetchCommentary, 90000);
        return () => clearInterval(interval);
    }, [currentSong.id]);

    // 🎛️ DJ INTEL: Generate tips when song changes
    useEffect(() => {
        const tips = generateDJTips(currentSong);
        setDjTips(tips);
        setCurrentDJTipIndex(0);
    }, [currentSong.id]);

    // 🎨 TESLA-STYLE: Extract dominant colors from album art
    useEffect(() => {
        if (!currentSong.albumArt) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = ambientCanvasRef.current || document.createElement('canvas');
                ambientCanvasRef.current = canvas;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return;

                // Sample at small size for performance
                canvas.width = 32;
                canvas.height = 32;
                ctx.drawImage(img, 0, 0, 32, 32);
                const data = ctx.getImageData(0, 0, 32, 32).data;

                // Sample colors from different regions
                const regions = [
                    { x: 8, y: 8 },   // top-left quadrant center
                    { x: 24, y: 8 },   // top-right
                    { x: 16, y: 24 },  // bottom-center
                ];

                const colors = regions.map(({ x, y }) => {
                    // Average a 5x5 area around each sample point
                    let r = 0, g = 0, b = 0, count = 0;
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const px = Math.max(0, Math.min(31, x + dx));
                            const py = Math.max(0, Math.min(31, y + dy));
                            const idx = (py * 32 + px) * 4;
                            r += data[idx];
                            g += data[idx + 1];
                            b += data[idx + 2];
                            count++;
                        }
                    }
                    return {
                        r: Math.round(r / count),
                        g: Math.round(g / count),
                        b: Math.round(b / count),
                    };
                });

                // Apply with subtle opacity for background wash
                setAmbientColors({
                    primary: `rgba(${colors[0].r}, ${colors[0].g}, ${colors[0].b}, 0.12)`,
                    secondary: `rgba(${colors[1].r}, ${colors[1].g}, ${colors[1].b}, 0.08)`,
                    accent: `rgba(${colors[2].r}, ${colors[2].g}, ${colors[2].b}, 0.06)`,
                });

                // 🎨 TESLA GLOW — Higher opacity CSS vars for sidebar card glows
                setAmbientGlowVars({
                    '--glow-primary': `rgba(${colors[0].r}, ${colors[0].g}, ${colors[0].b}, 0.35)`,
                    '--glow-secondary': `rgba(${colors[1].r}, ${colors[1].g}, ${colors[1].b}, 0.25)`,
                    '--glow-accent': `rgba(${colors[2].r}, ${colors[2].g}, ${colors[2].b}, 0.20)`,
                    '--glow-border': `rgba(${colors[0].r}, ${colors[0].g}, ${colors[0].b}, 0.30)`,
                    '--glow-r': `${colors[0].r}`,
                    '--glow-g': `${colors[0].g}`,
                    '--glow-b': `${colors[0].b}`,
                });
            } catch {
                // CORS or canvas errors — keep defaults silently
            }
        };
        img.onerror = () => { /* keep defaults */ };
        img.src = currentSong.albumArt;
    }, [currentSong.id, currentSong.albumArt]);

    // 📰 DJ INTEL: Rotate headlines every 20s for Bloomberg ticker
    useEffect(() => {
        const interval = setInterval(() => {
            setDjIntelIndex(prev => (prev + 1) % djIntelHeadlines.length);
        }, 20000);
        return () => clearInterval(interval);
    }, [djIntelHeadlines.length]);

    // 🎛️ DJ INTEL: Rotate tips every 8 seconds
    useEffect(() => {
        if (djTips.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentDJTipIndex(prev => (prev + 1) % djTips.length);
        }, 8000);
        return () => clearInterval(interval);
    }, [djTips]);

    // 🌊 WAVEFORM: Animated canvas visualization
    useEffect(() => {
        const canvas = waveformRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animId: number;
        let phase = 0;
        // Randomized amplitude targets for organic movement
        const ampTargets = [0.6, 0.8, 0.5, 0.9, 0.7];
        const ampCurrent = [...ampTargets];

        const draw = () => {
            const { width, height } = canvas.getBoundingClientRect();
            canvas.width = width * 2; // Retina
            canvas.height = height * 2;
            ctx.scale(2, 2);
            ctx.clearRect(0, 0, width, height);

            const mid = height / 2;
            const playing = isPlaying;

            // Draw 3 layered waves
            const waves = [
                { freq: 0.02, amp: playing ? 0.35 : 0.05, speed: 0.04, color: 'rgba(211, 119, 29, 0.6)' },
                { freq: 0.015, amp: playing ? 0.25 : 0.03, speed: -0.03, color: 'rgba(251, 191, 36, 0.4)' },
                { freq: 0.03, amp: playing ? 0.18 : 0.02, speed: 0.05, color: 'rgba(224, 159, 36, 0.3)' },
            ];

            waves.forEach((wave, wi) => {
                ctx.beginPath();
                ctx.moveTo(0, mid);

                // Modulate amplitude with organic drift
                const ampIdx = wi % ampTargets.length;
                ampCurrent[ampIdx] += (ampTargets[ampIdx] - ampCurrent[ampIdx]) * 0.02;
                const modAmp = wave.amp * ampCurrent[ampIdx] * mid;

                for (let x = 0; x <= width; x++) {
                    const noise = Math.sin(x * 0.1 + phase * 2) * 0.15;
                    const y = mid + Math.sin(x * wave.freq + phase * wave.speed * 60 + wi) * modAmp * (1 + noise);
                    ctx.lineTo(x, y);
                }

                ctx.strokeStyle = wave.color;
                ctx.lineWidth = playing ? 2 : 1;
                ctx.stroke();

                // Fill below wave with gradient
                ctx.lineTo(width, height);
                ctx.lineTo(0, height);
                ctx.closePath();
                const gradient = ctx.createLinearGradient(0, mid, 0, height);
                gradient.addColorStop(0, wave.color.replace(/[\d.]+\)$/, '0.1)'));
                gradient.addColorStop(1, 'transparent');
                ctx.fillStyle = gradient;
                ctx.fill();
            });

            // Randomize amplitude targets periodically
            if (Math.random() < 0.02 && playing) {
                const idx = Math.floor(Math.random() * ampTargets.length);
                ampTargets[idx] = 0.4 + Math.random() * 0.6;
            }

            phase += playing ? 0.016 : 0.004;
            animId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animId);
    }, [isPlaying]);

    // 🎬 SHOW FACTS PERIODICALLY — Dual-bubble VH1 style
    useEffect(() => {
        if (popUpFacts.length === 0) return;

        const showFactPair = () => {
            // First fact
            const fact1 = popUpFacts[factIndexRef.current % popUpFacts.length];
            factIndexRef.current++;
            // Pick two non-overlapping positions
            const pos1 = Math.floor(Math.random() * POPUP_POSITIONS.length);
            setFactPosition(pos1);
            setCurrentFact(fact1);
            sfx.pop(); // 💡 VH1-style pop!

            // Second fact — staggered by 1.5s for dynamic VH1 feel
            if (popUpFacts.length > 1) {
                setTimeout(() => {
                    const fact2 = popUpFacts[factIndexRef.current % popUpFacts.length];
                    factIndexRef.current++;
                    // Pick a different position from the first
                    let pos2 = Math.floor(Math.random() * POPUP_POSITIONS.length);
                    while (pos2 === pos1 && POPUP_POSITIONS.length > 1) {
                        pos2 = Math.floor(Math.random() * POPUP_POSITIONS.length);
                    }
                    setSecondFactPosition(pos2);
                    setSecondFact(fact2);
                    sfx.pop(); // 💡 Second pop!
                    // Hide second fact after 8 seconds
                    setTimeout(() => setSecondFact(null), 8000);
                }, 1500);
            }

            // Hide first fact after 8 seconds (more time to read)
            setTimeout(() => setCurrentFact(null), 8000);
        };

        // Show first pair after 2 seconds
        const initialTimeout = setTimeout(showFactPair, 2000);

        // Then show a new pair every 10 seconds (gap between pairs)
        const interval = setInterval(showFactPair, 10000);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [popUpFacts]);

    // Rotate tips every 5 seconds
    useEffect(() => {
        const tipInterval = setInterval(() => {
            setCurrentTipIndex(prev => (prev + 1) % gameTips.length);
        }, 5000);
        return () => clearInterval(tipInterval);
    }, []);

    // 🎯 Rotate banner headline on song change
    useEffect(() => {
        setBannerIndex(Math.floor(Math.random() * bannerHeadlines.length));
    }, [currentSong.id]);

    // ⏰ Countdown to next Tuesday 8PM Eastern
    useEffect(() => {
        const calcCountdown = () => {
            // Get current time in Eastern
            const now = new Date();
            const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

            // Find next Tuesday
            const dayOfWeek = eastern.getDay(); // 0=Sun, 2=Tue
            let daysUntilTuesday = (2 - dayOfWeek + 7) % 7;

            // Target: next Tuesday 8PM Eastern
            const target = new Date(eastern);
            target.setDate(target.getDate() + daysUntilTuesday);
            target.setHours(20, 0, 0, 0);

            // If it's Tuesday but past 8pm (or during the show window 8pm-midnight), find next week
            if (daysUntilTuesday === 0 && eastern.getHours() >= 20) {
                // If currently live (Tue 8pm-midnight), show "LIVE NOW"
                if (eastern.getHours() < 24) {
                    setNextLiveCountdown('LIVE NOW');
                    return;
                }
                target.setDate(target.getDate() + 7);
            }

            const diff = target.getTime() - eastern.getTime();
            if (diff <= 0) {
                setNextLiveCountdown('LIVE NOW');
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            if (days > 0) {
                setNextLiveCountdown(`${days}d ${hours}h ${minutes}m`);
            } else if (hours > 0) {
                setNextLiveCountdown(`${hours}h ${minutes}m ${seconds}s`);
            } else {
                setNextLiveCountdown(`${minutes}m ${seconds}s`);
            }
        };

        calcCountdown();
        const countdownInterval = setInterval(calcCountdown, 1000);
        return () => clearInterval(countdownInterval);
    }, []);

    // 🔴 SCORE CHANGE DETECTION - Animate when votes come in
    useEffect(() => {
        const liveScore = playlist.find(s => s.id === currentSong.id)?.score ?? currentSong.score;
        const currentRank = playlist.findIndex(s => s.id === currentSong.id) + 1;

        if (lastScore !== null && liveScore !== lastScore) {
            const delta = liveScore - lastScore;
            setScoreAnimation({ delta, key: Date.now() });

            // Add to activity feed
            addActivity({
                type: 'vote',
                text: delta > 0 ? `+${delta} vote${delta > 1 ? 's' : ''} on "${currentSong.name}"!` : `${delta} vote on "${currentSong.name}"`,
                icon: delta > 0 ? '👍' : '👎',
            });
        }

        if (lastRank !== null && currentRank !== lastRank && currentRank > 0) {
            setRankAlert({ from: lastRank, to: currentRank, key: Date.now() });
        }

        setLastScore(liveScore);
        if (currentRank > 0) setLastRank(currentRank);
    }, [playlist, currentSong.id]);

    // Clear score animation after 1 second
    useEffect(() => {
        if (scoreAnimation) {
            const timeout = setTimeout(() => setScoreAnimation(null), 1200);
            return () => clearTimeout(timeout);
        }
    }, [scoreAnimation]);

    // Clear rank alert after 3 seconds
    useEffect(() => {
        if (rankAlert) {
            const timeout = setTimeout(() => setRankAlert(null), 3000);
            return () => clearTimeout(timeout);
        }
    }, [rankAlert]);

    // Periodic CTA flash (every 30 seconds)
    useEffect(() => {
        const ctaInterval = setInterval(() => {
            setShowCTA(true);
            setTimeout(() => setShowCTA(false), 5000);
        }, 30000);
        // Show once initially after 10 seconds
        const initialCTA = setTimeout(() => {
            setShowCTA(true);
            setTimeout(() => setShowCTA(false), 5000);
        }, 10000);
        return () => {
            clearInterval(ctaInterval);
            clearTimeout(initialCTA);
        };
    }, []);

    // 🎰 VEGAS-STYLE EMOJI BURST - Full screen celebration
    const [emojiBurst, setEmojiBurst] = useState<{ emojis: string[]; key: number } | null>(null);

    // 📺 Boost hype on activity (defined early so addActivity can reference it)
    const boostHype = useCallback((amount: number) => {
        hypeRef.current = Math.min(100, hypeRef.current + amount);
        setHypeLevel(Math.min(100, Math.round(hypeRef.current)));
        if (hypeRef.current >= 85) {
            SoundEffects.hypeBurst();
        }
    }, []);

    const triggerEmojiBurst = useCallback((type: 'vote' | 'upvote' | 'downvote') => {
        const emojiSets = {
            vote: ['🔊', '⚡', '📡', '💿', '🎧'],
            upvote: ['👍', '🔊', '📦', '⬆️', '🎚️'],
            downvote: ['👎', '💀', '📉', '❌', '💨'],
        };
        setEmojiBurst({ emojis: emojiSets[type], key: Date.now() });
        setTimeout(() => setEmojiBurst(null), 2000);
    }, []);

    // 🎪 IDLE MODE - Full-screen promo when no activity
    const [idleMode, setIdleMode] = useState(false);
    const [lastActivityTime, setLastActivityTime] = useState(Date.now());
    const [idleMessageIndex, setIdleMessageIndex] = useState(0);
    const IDLE_TIMEOUT = streamMode ? BROADCAST.idleTimeoutMs : 25000;

    // Rotating idle mode messages — clean, no emoji overload
    const idleMessages = [
        {
            headline: 'BE THE DJ',
            subtext: 'Add songs, cast votes, control the vibe',
            cta: 'JOIN IN',
        },
        {
            headline: 'SHAPE THE SOUND',
            subtext: 'Your picks determine what plays next',
            cta: 'SCAN NOW',
        },
        {
            headline: 'RUN THE BOOTH',
            subtext: 'Vote up the bangers, skip the duds',
            cta: 'GET IN',
        },
        {
            headline: "DON'T JUST WATCH",
            subtext: 'Scan the code and make your voice heard',
            cta: 'VOTE',
        },
        {
            headline: 'EARN KARMA',
            subtext: 'Vote more, gain power, unlock perks',
            cta: 'START NOW',
        },
    ];

    // Activity feed helper - also triggers emoji burst and resets idle timer
    const addActivity = useCallback((item: Omit<ActivityItem, 'id' | 'timestamp'>) => {
        const newItem: ActivityItem = {
            ...item,
            id: `${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
        };
        setActivityFeed(prev => [newItem, ...prev].slice(0, 50));
        setLastActivityTime(Date.now()); // Reset idle timer
        setIdleMode(false); // Exit idle mode on activity

        // Trigger Vegas-style burst + SFX!
        if (item.type === 'vote') {
            triggerEmojiBurst(item.icon === '👍' ? 'upvote' : 'downvote');
            if (item.icon === '👍') sfx.voteUp(); else sfx.voteDown();
            boostHype(8); // 📺 BROADCAST: Votes boost hype
        } else if (item.type === 'newSong') {
            sfx.newSong(); // 🎰 Slot machine jingle
            boostHype(15); // 📺 BROADCAST: New songs boost hype more
        }
    }, [triggerEmojiBurst, boostHype]);

    // 📢 Ingest server-side activity into the jukebox feed
    useEffect(() => {
        if (!liveActivity || liveActivity.length === 0) return;

        const newItems: ActivityItem[] = [];
        for (const sa of liveActivity) {
            if (seenServerActivityRef.current.has(sa.id)) continue;
            seenServerActivityRef.current.add(sa.id);

            const icon = sa.type === 'add' ? '💿' : sa.type === 'upvote' ? '👍' : '👎';
            const action = sa.type === 'add' ? 'added' : sa.type === 'upvote' ? 'upvoted' : 'downvoted';
            const shortSong = sa.songName.length > 18 ? sa.songName.slice(0, 18) + '…' : sa.songName;

            newItems.push({
                id: `srv-${sa.id}`,
                type: sa.type === 'add' ? 'newSong' : 'vote',
                text: `${sa.userName} ${action} "${shortSong}"`,
                icon,
                timestamp: sa.timestamp,
            });
        }

        if (newItems.length > 0) {
            setActivityFeed(prev => [...newItems, ...prev].slice(0, 50));
            setLastActivityTime(Date.now());
            setIdleMode(false);
            // Boost hype for server-side activity too + SFX
            newItems.forEach(item => {
                if (item.type === 'vote') {
                    boostHype(5);
                    sfx.notify(); // 🔔 Remote vote ping
                } else if (item.type === 'newSong') {
                    boostHype(12);
                    sfx.slotPull(); // 🎰 Someone added a song!
                }
            });
        }

        // Cap seen set to prevent memory leak in long sessions
        if (seenServerActivityRef.current.size > 300) {
            const entries = Array.from(seenServerActivityRef.current);
            seenServerActivityRef.current = new Set(entries.slice(entries.length - 150));
        }
    }, [liveActivity, boostHype]);

    // Check for idle mode every 5 seconds (desktop only - mobile users are active voters)
    useEffect(() => {
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
        if (isMobile) return; // Never show idle mode on mobile

        const idleCheck = setInterval(() => {
            const timeSinceActivity = Date.now() - lastActivityTime;
            if (timeSinceActivity >= IDLE_TIMEOUT && !idleMode) {
                // Pick a random message each time idle mode activates
                setIdleMessageIndex(Math.floor(Math.random() * idleMessages.length));
                setIdleMode(true);
                sfx.whoosh(); // 🌊 Cinematic transition
            }
        }, 5000);
        return () => clearInterval(idleCheck);
    }, [lastActivityTime, idleMode, idleMessages.length]);

    // Exit idle mode after showing for 8 seconds, then reset timer
    useEffect(() => {
        if (idleMode) {
            const exitIdle = setTimeout(() => {
                setIdleMode(false);
                setLastActivityTime(Date.now());
            }, 8000);
            return () => clearTimeout(exitIdle);
        }
    }, [idleMode]);

    // Running log — keep last 50 items, trim only at capacity (no time-expiry)
    // This ensures live activity always shows a running log of what's happened

    // Tick to keep relative timestamps fresh (re-render every 10s)
    const [, setLogTick] = useState(0);
    useEffect(() => {
        const tickInterval = setInterval(() => setLogTick(t => t + 1), 10000);
        return () => clearInterval(tickInterval);
    }, []);

    // 🎶 Simulated audio equalizer animation
    useEffect(() => {
        if (!isPlaying) return;
        const eqInterval = setInterval(() => {
            setEqBars(prev => prev.map((_, i) => {
                // Create musically plausible frequency distribution
                const bassBias = i < 4 ? 1.4 : i < 8 ? 1.0 : 0.7;
                const target = (15 + Math.random() * 70) * bassBias;
                return Math.min(100, target);
            }));
        }, 120);
        return () => clearInterval(eqInterval);
    }, [isPlaying]);

    // 💫 Glow intensity decays over time, boosted by activity
    useEffect(() => {
        const glowDecay = setInterval(() => {
            setGlowIntensity(prev => Math.max(0, prev - 0.02));
        }, 100);
        return () => clearInterval(glowDecay);
    }, []);

    // Boost glow when score changes
    useEffect(() => {
        if (scoreAnimation) {
            setGlowIntensity(1);
        }
    }, [scoreAnimation]);

    // 📺 BROADCAST: Detect new songs added to playlist → Song Request Alert
    useEffect(() => {
        if (!streamMode) return;
        const prevIds = new Set(previousPlaylistRef.current.map(s => s.id));
        const newSongs = playlist.filter(s => !prevIds.has(s.id));

        newSongs.forEach((song, i) => {
            setTimeout(() => {
                const alert: SongAlert = {
                    id: `alert-${song.id}-${Date.now()}`,
                    songName: song.name,
                    artistName: song.artist,
                    albumArt: song.albumArt,
                    addedBy: song.addedByName || 'Anonymous',
                    addedByLocation: song.addedByLocation,
                    timestamp: Date.now(),
                };
                setSongAlerts(prev => [alert, ...prev].slice(0, 3));
                SoundEffects.songRequest();

                // Add achievement for new song
                setAchievements(prev => [{
                    id: `ach-${Date.now()}-${i}`,
                    text: `${song.addedByName || 'Someone'} added "${song.name.slice(0, 20)}"`,
                    emoji: '💿',
                    timestamp: Date.now(),
                }, ...prev].slice(0, 5));

                // Auto-clear alert
                setTimeout(() => {
                    setSongAlerts(prev => prev.filter(a => a.id !== alert.id));
                }, BROADCAST.alertDurationMs);
            }, i * 1200); // Stagger multiple alerts
        });

        previousPlaylistRef.current = playlist;
    }, [playlist, streamMode]);

    // 📺 BROADCAST: Hype Meter — decaying activity gauge
    useEffect(() => {
        if (!streamMode) return;
        const hypeInterval = setInterval(() => {
            hypeRef.current = Math.max(0, hypeRef.current * BROADCAST.hypeDecayRate);
            setHypeLevel(Math.min(100, Math.round(hypeRef.current)));
        }, 1000);
        return () => clearInterval(hypeInterval);
    }, [streamMode]);


    // 📺 BROADCAST: Clock + era countdown
    useEffect(() => {
        if (!streamMode) return;
        const clockInterval = setInterval(() => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: 'America/Chicago',
            }));
            if (currentTheme?.endsAt) {
                const remaining = Math.max(0, currentTheme.endsAt - Date.now());
                const mins = Math.floor(remaining / 60000);
                const secs = Math.floor((remaining % 60000) / 1000);
                setEraCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
            }
        }, 1000);
        return () => clearInterval(clockInterval);
    }, [streamMode, currentTheme]);

    // 📺 BROADCAST: Lower third on song change
    useEffect(() => {
        if (!streamMode) return;
        setShowLowerThird(true);
        const timer = setTimeout(() => setShowLowerThird(false), BROADCAST.lowerThirdDurationMs);
        return () => clearTimeout(timer);
    }, [currentSong.id, streamMode]);

    // 📺 Track total votes for ticker (always-on Bloomberg-style)
    useEffect(() => {
        const total = playlist.reduce((sum, s) => sum + Math.abs(s.score), 0);
        setTotalVotes(total);
    }, [playlist]);

    // 📺 BROADCAST: Detect #1 changes for achievements
    useEffect(() => {
        if (!streamMode || playlist.length === 0) return;
        const topSong = playlist[0];
        // Check if the #1 song changed
        if (previousPlaylistRef.current.length > 0) {
            const prevTop = previousPlaylistRef.current[0];
            if (prevTop && topSong.id !== prevTop.id) {
                setAchievements(prev => [{
                    id: `ach-crown-${Date.now()}`,
                    text: `"${topSong.name.slice(0, 20)}" just hit #1!`,
                    emoji: '👑',
                    timestamp: Date.now(),
                }, ...prev].slice(0, 5));
                SoundEffects.achievementUnlock();
            }
        }
    }, [playlist, streamMode]);

    // 📺 BROADCAST: Auto-clear old achievements
    useEffect(() => {
        if (!streamMode) return;
        const cleanup = setInterval(() => {
            const now = Date.now();
            setAchievements(prev => prev.filter(a => now - a.timestamp < 15000));
        }, 3000);
        return () => clearInterval(cleanup);
    }, [streamMode]);

    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const watchTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Find current song index and next song
    const currentIndex = playlist.findIndex(s => s.id === currentSong.id);
    const nextSong = currentIndex >= 0 && currentIndex < playlist.length - 1
        ? playlist[currentIndex + 1]
        : null;

    // 🔧 REFS to avoid stale closures in YouTube player callbacks
    // The YT player is initialized once, so its event handlers would capture
    // the initial render's values. Refs ensure they always read the latest.
    const nextSongRef = useRef(nextSong);
    nextSongRef.current = nextSong;
    const onNextSongRef = useRef(onNextSong);
    onNextSongRef.current = onNextSong;
    const playlistRef = useRef(playlist);
    playlistRef.current = playlist;
    // onCloseRef is already defined elsewhere for back-button support

    // Load YouTube IFrame API
    useEffect(() => {
        if (window.YT && window.YT.Player) {
            initPlayer();
            return;
        }

        // Load the API
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
            initPlayer();
        };

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy();
            }
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
            }
            if (watchTimeIntervalRef.current) {
                clearInterval(watchTimeIntervalRef.current);
            }
        };
    }, []);


    // Initialize player when video changes
    useEffect(() => {
        if (isPlayerReady && playerRef.current && videoId) {
            playerRef.current.loadVideoById(videoId);
            setProgress(0);
            setWatchTime(0);
            setKarmaEarned(false);
        }
    }, [videoId, isPlayerReady]);

    const initPlayer = () => {
        if (!window.YT || !window.YT.Player) return;

        playerRef.current = new window.YT.Player('jukebox-player', {
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                mute: 1,
                controls: 1,
                modestbranding: 1,
                rel: 0,
                showinfo: 0,
                fs: 1,
                playsinline: 1,
            },
            events: {
                onReady: handlePlayerReady,
                onStateChange: handleStateChange,
                onError: handleError,
            },
        });
    };

    const handlePlayerReady = (event: any) => {
        setIsPlayerReady(true);
        setDuration(event.target.getDuration());

        // Start progress tracking
        progressIntervalRef.current = setInterval(() => {
            if (playerRef.current && playerRef.current.getCurrentTime) {
                const current = playerRef.current.getCurrentTime();
                const total = playerRef.current.getDuration();
                setProgress((current / total) * 100);
                setDuration(total);
            }
        }, 500);

        // Track watch time for karma
        watchTimeIntervalRef.current = setInterval(() => {
            if (playerRef.current && playerRef.current.getPlayerState() === 1) {
                setWatchTime(prev => prev + 1);
            }
        }, 1000);
    };

    const handleStateChange = (event: any) => {
        // 0 = ended, 1 = playing, 2 = paused
        if (event.data === 0) {
            // Video ended - auto advance to next song
            handleVideoEnd();
        } else if (event.data === 1) {
            setIsPlaying(true);
        } else if (event.data === 2) {
            setIsPlaying(false);
        }
    };

    const handleError = (event: any) => {
        console.error('YouTube player error:', event.data);
        // Skip to next song on error
        handleVideoEnd();
    };

    const handleVideoEnd = () => {
        // Read latest values from refs (avoids stale closure from YT player init)
        const latestNextSong = nextSongRef.current;
        const latestOnNextSong = onNextSongRef.current;
        const latestPlaylist = playlistRef.current;

        if (latestNextSong) {
            // Show next song hint, then advance
            setShowNextHint(true);
            sfx.whoosh(); // 🌊 Song transition
            setTimeout(() => {
                setShowNextHint(false);
                latestOnNextSong(latestNextSong.id);
            }, 2000);
        } else if (latestPlaylist.length > 0) {
            // End of playlist — loop back to the first song
            setShowNextHint(true);
            setTimeout(() => {
                setShowNextHint(false);
                latestOnNextSong(latestPlaylist[0].id);
            }, 2000);
        } else {
            // Playlist is truly empty — close jukebox
            onCloseRef.current();
        }
    };

    // Award karma after 60 seconds of watching
    useEffect(() => {
        if (watchTime >= 60 && !karmaEarned && visitorId) {
            setKarmaEarned(true);
            sfx.coin(); // 💰 Mario coin!
            onKarmaEarned?.();
        }
    }, [watchTime, karmaEarned, visitorId, onKarmaEarned]);

    const togglePlayPause = () => {
        if (!playerRef.current) return;
        if (isPlaying) {
            playerRef.current.pauseVideo();
        } else {
            playerRef.current.playVideo();
        }
    };

    const toggleMute = () => {
        if (!playerRef.current) return;
        if (isMuted) {
            playerRef.current.unMute();
        } else {
            playerRef.current.mute();
        }
        setIsMuted(!isMuted);
    };

    const skipToNext = () => {
        if (nextSong) {
            sfx.skip(); // 🎵 Vinyl scratch
            onNextSong(nextSong.id);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // 🔒 Ref to store onClose to avoid effect dependency issues
    // This prevents the effect from re-running when onClose reference changes due to parent re-renders
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    // 🔒 Track if component is mounted to prevent stale closures
    const isMountedRef = useRef(true);

    // 🔙 Browser back button support - push state when jukebox opens, pop to close
    useEffect(() => {
        isMountedRef.current = true;

        // Push a state so back button can close jukebox
        window.history.pushState({ jukebox: true }, '');

        const handlePopState = () => {
            // When back button is pressed, close the jukebox (only if still mounted)
            if (isMountedRef.current) {
                onCloseRef.current();
            }
        };

        window.addEventListener('popstate', handlePopState);

        return () => {
            isMountedRef.current = false;
            window.removeEventListener('popstate', handlePopState);
            // Note: We don't call history.back() here - let the history stay
            // This prevents triggering navigation during effect cleanup from re-renders
        };
    }, []); // No dependencies - only run on mount/unmount

    // 📺 BROADCAST: Compute hype level info
    const getHypeInfo = () => {
        const levels = BROADCAST.hypeLevels;
        for (let i = levels.length - 1; i >= 0; i--) {
            if (hypeLevel >= levels[i].threshold) return levels[i];
        }
        return levels[0];
    };
    const hypeInfo = getHypeInfo();

    // 📺 BROADCAST: Ticker content
    const uniqueContributors = new Set(playlist.map(s => s.addedByName).filter(Boolean)).size;
    const locations = Array.from(new Set(playlist.map(s => s.addedByLocation).filter((x): x is string => Boolean(x))));

    // Particle count scales with hype
    const particleCount = Math.max(8, Math.floor(hypeLevel / 3));

    return (
        <div className={`jukebox-overlay ${streamMode ? 'broadcast-mode' : ''}`} ref={containerRef}>

            {/* 🖼️ ALBUM ART BLURRED BACKDROP */}
            <div className="album-backdrop" key={`backdrop-${currentSong.id}`}>
                <img
                    src={currentSong.albumArt}
                    alt=""
                    className="backdrop-img"
                />
            </div>

            {/* 🎨 TESLA-STYLE AMBIENT COLOR GLOW — extracted from album art */}
            <div className="ambient-color-wash" style={{
                background: `
                    radial-gradient(ellipse at 0% 20%, ${ambientColors.primary} 0%, transparent 50%),
                    radial-gradient(ellipse at 100% 80%, ${ambientColors.secondary} 0%, transparent 50%),
                    radial-gradient(ellipse at 50% 100%, ${ambientColors.accent} 0%, transparent 40%)
                `,
            }} />

            {/* ✨ AMBIENT PARTICLE SYSTEM */}
            <div className="ambient-particles">
                {Array.from({ length: particleCount }).map((_, i) => (
                    <span
                        key={i}
                        className="particle"
                        style={{
                            left: `${(i * 37 + 13) % 100}%`,
                            animationDuration: `${8 + (i % 5) * 3}s`,
                            animationDelay: `${(i * 1.7) % 8}s`,
                            opacity: 0.15 + (i % 3) * 0.1,
                            width: `${2 + (i % 3)}px`,
                            height: `${2 + (i % 3)}px`,
                        }}
                    />
                ))}
            </div>


            {/* 📺 BROADCAST: Song Request Alerts */}
            {streamMode && songAlerts.length > 0 && (
                <div className="broadcast-alerts">
                    {songAlerts.map((alert) => (
                        <div key={alert.id} className="song-request-alert">
                            <img src={alert.albumArt} alt="" className="alert-album-art" />
                            <div className="alert-info">
                                <span className="alert-label">📦 SONG ADDED</span>
                                <span className="alert-song">{alert.songName}</span>
                                <span className="alert-artist">{alert.artistName}</span>
                                <span className="alert-by">
                                    Added by {alert.addedBy}
                                    {alert.addedByLocation && ` • ${alert.addedByLocation}`}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 📺 BROADCAST: Viewer Counter */}
            {streamMode && viewerCount > 0 && (
                <div className="broadcast-viewer-count">
                    <span className="viewer-dot" />
                    <span>👀 {viewerCount} watching</span>
                </div>
            )}

            {/* 📺 BROADCAST: Era Clock */}
            {streamMode && (
                <div className="broadcast-clock">
                    <span className="clock-time">{currentTime}</span>
                    {currentTheme && (
                        <div className="clock-era">
                            <span>{currentTheme.emoji} {currentTheme.name}</span>
                            {eraCountdown && <span className="era-countdown">{eraCountdown}</span>}
                        </div>
                    )}
                </div>
            )}

            {/* 🎰 VEGAS-STYLE EMOJI BURST */}
            {emojiBurst && (
                <div className="emoji-burst-container" key={emojiBurst.key}>
                    {Array.from({ length: 20 }).map((_, i) => (
                        <span
                            key={i}
                            className="burst-emoji"
                            style={{
                                left: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 0.5}s`,
                                fontSize: `${2 + Math.random() * 3}rem`,
                            }}
                        >
                            {emojiBurst.emojis[i % emojiBurst.emojis.length]}
                        </span>
                    ))}
                </div>
            )}

            {/* 🎪 IDLE MODE — clean, no floating emojis */}
            {idleMode && (
                <div className="idle-mode-overlay">
                    <div className="idle-content">

                        <h1 className="idle-headline">{idleMessages[idleMessageIndex].headline}</h1>
                        <p className="idle-subtext">{idleMessages[idleMessageIndex].subtext}</p>
                        <div className="idle-url-box">
                            <span className="idle-url">{APP_CONFIG.domain}</span>
                        </div>
                        <div className="idle-qr">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://${APP_CONFIG.domain}&bgcolor=000000&color=d3771d`}
                                alt="Scan to vote"
                            />
                            <span>Scan to Join</span>
                        </div>
                        <div className="idle-cta-btn">
                            <span>{idleMessages[idleMessageIndex].cta}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* 📊 DASHBOARD LAYOUT - 3 Columns */}
            <div className="jukebox-dashboard" style={ambientGlowVars as React.CSSProperties}>
                {/* LEFT SIDEBAR */}
                <div className="jukebox-sidebar left">
                    {/* 📺 Hype Meter */}
                    {streamMode && (
                        <div className="sidebar-section hype-section" style={{ borderColor: hypeInfo.color }}>
                            <h3 className="sidebar-title">📊 Hype Level</h3>
                            <div className="hype-meter">
                                <div className="hype-bar">
                                    <div
                                        className="hype-fill"
                                        style={{
                                            width: `${hypeLevel}%`,
                                            background: `linear-gradient(90deg, ${hypeInfo.color}, ${hypeInfo.color}dd)`,
                                            boxShadow: hypeLevel > 60 ? `0 0 20px ${hypeInfo.color}80` : 'none',
                                        }}
                                    />
                                </div>
                                <div className="hype-label">
                                    <span className="hype-emoji">{hypeInfo.emoji}</span>
                                    <span className="hype-text" style={{ color: hypeInfo.color }}>{hypeInfo.label}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Leaderboard */}
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">🧑‍💻 {streamMode ? 'Leaderboard' : 'Active Voters'}</h3>
                        <div className="mini-leaderboard">
                            {(() => {
                                const contributors = playlist
                                    .filter(s => s.addedByName)
                                    .reduce((acc, song) => {
                                        const name = song.addedByName!;
                                        if (!acc[name]) acc[name] = { count: 0, location: song.addedByLocation };
                                        acc[name].count += 1;
                                        return acc;
                                    }, {} as Record<string, { count: number; location?: string }>);

                                return Object.entries(contributors)
                                    .sort((a, b) => b[1].count - a[1].count)
                                    .slice(0, streamMode ? 3 : 2)
                                    .map(([name, data], i) => (
                                        <div key={name} className={`lb-row ${i === 0 ? 'lb-row-top' : ''}`}>
                                            <span className="lb-rank">{i === 0 ? '🎧' : `#${i + 1}`}</span>
                                            <span className="lb-name">{name}</span>
                                            {streamMode && data.location && (
                                                <span className="lb-location">{data.location}</span>
                                            )}
                                            <span className="lb-score">💿{data.count}</span>
                                        </div>
                                    ));
                            })()}
                        </div>
                    </div>

                    {/* Top Songs */}
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">🔊 Top Songs</h3>
                        <div className="mini-leaderboard">
                            {playlist.slice(0, 2).map((song, i) => (
                                <div key={song.id} className="lb-row">
                                    <span className="lb-rank">{i === 0 ? '👑' : `#${i + 1}`}</span>
                                    <span className="lb-name">
                                        {song.name.length > 12 ? (
                                            <span className="lb-name-scroll">
                                                {song.name}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{song.name}
                                            </span>
                                        ) : song.name}
                                    </span>
                                    <span className="lb-score">+{song.score}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live Activity — Running Log */}
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">🔥 Live Activity</h3>
                        <div className="sidebar-activity running-log">
                            {activityFeed.length === 0 ? (
                                <p className="activity-empty">Waiting for activity...</p>
                            ) : (
                                activityFeed.slice(0, 5).map((item) => {
                                    const ago = Math.floor((Date.now() - item.timestamp) / 1000);
                                    const timeLabel = ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}m`;
                                    return (
                                        <div key={item.id} className="sidebar-toast log-entry">
                                            <span className="log-icon">{item.icon}</span>
                                            <span className="log-text">{item.text}</span>
                                            <span className="log-time">{timeLabel}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 📅 Next Live Show Countdown */}
                    <div className="sidebar-section next-live-section">
                        <h3 className="sidebar-title">📡 Next Live Show</h3>
                        <div className="next-live-info">
                            <div className="next-live-host">
                                <img src="/dj-host.png" alt="Your Host" className="host-photo" />
                            </div>
                            <div className="next-live-details">
                                <span className="next-live-day">Tuesdays @ 8PM ET</span>
                                <div className={`next-live-countdown ${nextLiveCountdown === 'LIVE NOW' ? 'live-now' : ''}`}>
                                    <span className="countdown-value">{nextLiveCountdown || '...'}</span>
                                    {nextLiveCountdown === 'LIVE NOW' && <span className="live-pulse-dot" />}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CENTER - Main Jukebox */}
                <div className="jukebox-container">
                    <div className="crowdsource-banner">
                        <div className="crowdsource-label">
                            <span className="live-dot" />
                            <span>VOTING OPEN</span>
                        </div>
                        <h2 className="crowdsource-title" key={`banner-${currentSong.id}`}>{bannerHeadlines[bannerIndex].title}</h2>
                        <p className="crowdsource-subtitle">{bannerHeadlines[bannerIndex].subtitle}</p>
                    </div>

                    <div className="jukebox-header">
                        <div className="jukebox-now-playing">
                            <span className="jukebox-label">💿 NOW PLAYING</span>
                            <div className="jukebox-song-info">
                                <span className="jukebox-song-name">{currentSong.name}</span>
                                <span className="jukebox-artist-name">{currentSong.artist}</span>
                            </div>
                        </div>
                        <div className="jukebox-vote-badge" title="Current vote score">
                            <span className="vote-icon">🔥</span>
                            <span className={`vote-count ${(playlist.find(s => s.id === currentSong.id)?.score ?? currentSong.score) > 0 ? 'positive' : (playlist.find(s => s.id === currentSong.id)?.score ?? currentSong.score) < 0 ? 'negative' : ''}`}>
                                {(() => {
                                    const liveScore = playlist.find(s => s.id === currentSong.id)?.score ?? currentSong.score;
                                    return liveScore > 0 ? `+${liveScore}` : liveScore;
                                })()}
                            </span>
                            <span className="vote-label">votes</span>
                        </div>
                    </div>

                    <div className="jukebox-tips-banner">
                        <span className="tip-icon">{gameTips[currentTipIndex].icon}</span>
                        <span className="tip-text" key={currentTipIndex}>{gameTips[currentTipIndex].text}</span>
                    </div>

                    <div
                        className="jukebox-video-wrapper"
                        style={{ '--glow-intensity': glowIntensity } as React.CSSProperties}
                    >
                        <div id="jukebox-player" className="jukebox-video" />

                        {/* 🎵 SPINNING VINYL RECORD */}
                        <div className="vinyl-widget">
                            <div className={`vinyl-record ${isPlaying ? 'spinning' : ''}`}>
                                <div className="vinyl-grooves" />
                                <div className="vinyl-label">
                                    <img src={currentSong.albumArt} alt="" className="vinyl-art" />
                                </div>
                                <div className="vinyl-hole" />
                            </div>
                        </div>

                        <div className="jukebox-qr-overlay">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://${APP_CONFIG.domain}&bgcolor=1a1a1a&color=d3771d`}
                                alt="Scan to vote"
                                className="jukebox-qr-img"
                            />
                            <span className="jukebox-qr-label">Scan to Vote</span>
                        </div>

                        {currentFact && (
                            <div
                                className="popup-video-bubble"
                                style={{ ...POPUP_POSITIONS[factPosition], position: 'absolute' }}
                                key={currentFact.id}
                            >
                                <span className="popup-category">{currentFact.category}</span>
                                <div className="popup-content">
                                    <span className="popup-emoji">{currentFact.emoji}</span>
                                    <span className="popup-text">{currentFact.text}</span>
                                </div>
                            </div>
                        )}

                        {/* 🎬 SECOND POP-UP BUBBLE (VH1 dual-fact style) */}
                        {secondFact && (
                            <div
                                className="popup-video-bubble popup-video-bubble-second"
                                style={{ ...POPUP_POSITIONS[secondFactPosition], position: 'absolute' }}
                                key={secondFact.id}
                            >
                                <span className="popup-category">{secondFact.category}</span>
                                <div className="popup-content">
                                    <span className="popup-emoji">{secondFact.emoji}</span>
                                    <span className="popup-text">{secondFact.text}</span>
                                </div>
                            </div>
                        )}

                        {/* 📺 BROADCAST: Lower Third */}
                        {streamMode && showLowerThird && (
                            <div className="broadcast-lower-third">
                                <div className="lower-third-accent" />
                                <div className="lower-third-content">
                                    <span className="lower-third-label">NOW PLAYING</span>
                                    <span className="lower-third-song">{currentSong.name}</span>
                                    <span className="lower-third-artist">{currentSong.artist}</span>
                                </div>
                                <div className="lower-third-stats">
                                    <span>#{playlist.findIndex(s => s.id === currentSong.id) + 1}</span>
                                    <span>🔥 {playlist.find(s => s.id === currentSong.id)?.score ?? currentSong.score} votes</span>
                                    {currentSong.addedByName && <span>Added by {currentSong.addedByName}</span>}
                                </div>
                            </div>
                        )}

                        {showNextHint && nextSong && (
                            <div className="jukebox-next-hint">
                                <span className="next-label">UP NEXT</span>
                                <div className="next-song-info">
                                    <img src={nextSong.albumArt} alt="" className="next-album-art" />
                                    <div>
                                        <div className="next-song-name">{nextSong.name}</div>
                                        <div className="next-artist-name">{nextSong.artist}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {scoreAnimation && (
                            <div className={`jukebox-score-pop ${scoreAnimation.delta > 0 ? 'positive' : 'negative'}`} key={scoreAnimation.key}>
                                {scoreAnimation.delta > 0 ? `+${scoreAnimation.delta}` : scoreAnimation.delta}
                            </div>
                        )}

                        {rankAlert && (
                            <div className="jukebox-rank-alert" key={rankAlert.key}>
                                {rankAlert.to < rankAlert.from ? (
                                    <><span className="rank-icon">🚀</span><span className="rank-text">RISING to #{rankAlert.to}!</span></>
                                ) : rankAlert.to === 1 ? (
                                    <><span className="rank-icon">👑</span><span className="rank-text">NOW #1!</span></>
                                ) : (
                                    <><span className="rank-icon">📉</span><span className="rank-text">Dropped to #{rankAlert.to}</span></>
                                )}
                            </div>
                        )}

                        {showCTA && (
                            <div className="jukebox-cta-flash">
                                <div className="cta-content">
                                    <span className="cta-arrow">🔥</span>
                                    <span className="cta-text">Vote now at <strong>{APP_CONFIG.domain}</strong></span>
                                    <span className="cta-arrow">📦</span>
                                </div>
                            </div>
                        )}


                    </div>

                    {/* 🎚️ AUDIO EQUALIZER */}
                    {isPlaying && (
                        <div className="audio-equalizer">
                            {eqBars.map((h, i) => (
                                <div
                                    key={i}
                                    className="eq-bar"
                                    style={{ height: `${h}%` }}
                                />
                            ))}
                        </div>
                    )}

                    <div className="jukebox-progress">
                        <div className="progress-bar glow-progress">
                            <div className="progress-fill" style={{ width: `${progress}%` }}>
                                <span className="progress-spark" />
                            </div>
                        </div>
                        <div className="progress-time">
                            <span>{formatTime((progress / 100) * duration)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* 🌊 WAVEFORM — moved to right sidebar to spread out visualizers */}

                    {/* 🎙️ LIVE COMMENTARY — Center column inline */}
                    {djCommentary && (
                        <div className="commentary-inline">
                            <img src={currentSong.albumArt} alt="" className="commentary-inline-art" />
                            <span className="commentary-inline-text" key={djCommentary.slice(0, 20)}>{djCommentary}</span>
                            <span className="commentary-inline-votes">🔥 {playlist.find(s => s.id === currentSong.id)?.score ?? currentSong.score}</span>
                        </div>
                    )}

                    {/* 🗂️ UP NEXT — Compact strip filling the gap */}
                    <div className="upnext-strip">
                        <span className="upnext-strip-label">🗂️ UP NEXT</span>
                        <div className="upnext-strip-items">
                            {playlist.slice(currentIndex + 1, currentIndex + 4).map((song, i) => (
                                <div key={song.id} className="upnext-strip-item" onClick={() => onNextSong(song.id)} title={`Skip to: ${song.name}`}>
                                    <span className="upnext-strip-pos">{i + 1}</span>
                                    <img src={song.albumArt} alt="" className="upnext-strip-art" />
                                    <div className="upnext-strip-info">
                                        <span className="upnext-strip-name">{song.name.length > 22 ? song.name.slice(0, 22) + '…' : song.name}</span>
                                        <span className="upnext-strip-artist">{song.artist}</span>
                                    </div>
                                    <span className="upnext-strip-score">+{song.score}</span>
                                </div>
                            ))}
                            {playlist.length <= currentIndex + 1 && (
                                <p className="activity-empty">No more songs in queue</p>
                            )}
                        </div>
                    </div>

                    {/* 👻 Ghost controls — discreet corner widget for all modes */}
                    <div className="stream-controls-widget">
                        {!streamMode && (
                            <button className="stream-ctrl-btn stream-ctrl-back" onClick={onClose} title="Back to playlist (ESC)">
                                ←
                            </button>
                        )}
                        <button className="stream-ctrl-btn" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                            {isMuted ? '🔇' : '🔊'}
                        </button>
                        <button className="stream-ctrl-btn stream-ctrl-play" onClick={togglePlayPause}>
                            {isPlaying ? '⏸' : '▶'}
                        </button>
                        <button className="stream-ctrl-btn" onClick={skipToNext} disabled={!nextSong} title={nextSong ? `Next: ${nextSong.name}` : 'End of list'}>
                            ⏭
                        </button>
                        {!streamMode && watchTime > 0 && (
                            <span className="stream-ctrl-karma" title={karmaEarned ? 'Karma earned!' : `${watchTime}/60s`}>
                                {karmaEarned ? '⚡' : `🎧${watchTime}`}
                            </span>
                        )}
                    </div>

                </div>

                {/* RIGHT SIDEBAR — DJ Dashboard Widgets */}
                <div className="jukebox-sidebar right">
                    {/* 📦 THIS WEEK'S CRATE */}
                    <div className="sidebar-section crate-theme-section">
                        <h3 className="sidebar-title">📦 This Week's Crate</h3>
                        <div className="crate-theme-display">
                            <span className="crate-theme-name">{playlistTitle || 'Crate Hackers Playlist'}</span>
                            <span className="crate-theme-sub">You're building this playlist live</span>
                        </div>
                    </div>

                    {/* 📱 QR CODE WIDGET — Scan for songs & Spotify */}
                    <div className="sidebar-section qr-widget-section">
                        <h3 className="sidebar-title">📱 Scan & Save</h3>
                        <div className="qr-widget-content">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://${APP_CONFIG.domain}&bgcolor=141414&color=d3771d`}
                                alt="Scan to join"
                                className="qr-widget-img"
                            />
                            <div className="qr-widget-info">
                                <span className="qr-widget-hint">Download songs & grab the Spotify playlist</span>
                            </div>
                        </div>
                        <div className="qr-widget-url-row">
                            <span className="qr-widget-url">{APP_CONFIG.domain}</span>
                        </div>
                    </div>

                    {/* 🎙️ AI DJ COMMENTARY — ESPN-style live commentary */}
                    {djCommentary && (
                        <div className="sidebar-section commentary-section">
                            <h3 className="sidebar-title">🎙️ Live Commentary</h3>
                            <p className="commentary-text" key={djCommentary.slice(0, 20)}>{djCommentary}</p>
                        </div>
                    )}

                    {/* 🎤 ON THIS DAY IN MUSIC */}
                    {onThisDayFacts.length > 0 && (
                        <div className="sidebar-section on-this-day-section">
                            <h3 className="sidebar-title">📅 On This Day</h3>
                            <div className="otd-fact" key={onThisDayIndex}>
                                <span className="otd-text">{onThisDayFacts[onThisDayIndex]}</span>
                            </div>
                        </div>
                    )}

                    {/* 🌊 WAVEFORM VISUALIZATION — Spread out from equalizer */}
                    <div className="sidebar-section waveform-sidebar-section">
                        <div className="waveform-container sidebar-waveform">
                            <canvas ref={waveformRef} className="waveform-canvas" />
                        </div>
                    </div>

                    {/* 🏛️ CRATE COACH — DJ tips widget */}
                    <div className="sidebar-section coach-widget-section">
                        <h3 className="sidebar-title">🏛️ Crate Coach</h3>
                        {djTips.length > 0 ? (
                            <div className="coach-widget-tip">
                                <span className="coach-tip-text" key={currentDJTipIndex}>{djTips[currentDJTipIndex]}</span>
                            </div>
                        ) : (
                            <div className="coach-widget-tip">
                                <span className="coach-tip-text">Loading intel for this track...</span>
                            </div>
                        )}
                        {currentSong.bpm && (
                            <div className="coach-stats-mini">
                                {currentSong.bpm && <span className="coach-stat">⏱ {currentSong.bpm} BPM</span>}
                                {currentSong.camelotKey && <span className="coach-stat">🔑 {currentSong.camelotKey}</span>}
                                {currentSong.energy != null && <span className="coach-stat">⚡ {Math.round(currentSong.energy * 100)}%</span>}
                            </div>
                        )}
                    </div>

                    {/* 📰 FUTURE DJ — Live newsletter headlines */}
                    <div className="sidebar-section dj-news-section">
                        <h3 className="sidebar-title">📰 Future DJ</h3>
                        <div className="dj-news-headline" key={djIntelIndex}>
                            <span className="dj-news-text">{djIntelHeadlines[djIntelIndex]}</span>
                        </div>
                        <div className="dj-news-headline dj-news-secondary" key={`next-${djIntelIndex}`}>
                            <span className="dj-news-text">{djIntelHeadlines[(djIntelIndex + 1) % djIntelHeadlines.length]}</span>
                        </div>
                        <span className="dj-news-credit">via The Crate Hackers Newsletter</span>
                    </div>
                </div>
            </div>

            {/* 📺 BLOOMBERG-STYLE TICKER — Always visible data feed */}
            <div className="broadcast-ticker">
                <div className="ticker-label">CRATE LIVE</div>
                <div className="ticker-track">
                    <span className="ticker-content">
                        🔥 {playlist.length} songs battling &nbsp;•&nbsp;
                        🗳️ {totalVotes} votes cast &nbsp;•&nbsp;
                        👥 {uniqueContributors} DJs contributing &nbsp;•&nbsp;
                        {playlist.length > 0 && <>👑 #1: &ldquo;{playlist[0].name}&rdquo; by {playlist[0].artist} (+{playlist[0].score}) &nbsp;•&nbsp;</>}
                        📦 This Week: {playlistTitle || 'Crate Hackers Playlist'} &nbsp;•&nbsp;
                        🎧 You&apos;re shaping the future of dance music &nbsp;•&nbsp;
                        📱 Scan QR to download songs &amp; Spotify playlist &nbsp;•&nbsp;
                        {currentSong.bpm && <>⏱ {currentSong.bpm} BPM &nbsp;•&nbsp;</>}
                        {currentSong.camelotKey && <>🔑 Key: {currentSong.camelotKey} &nbsp;•&nbsp;</>}
                        {locations.length > 0 && <>🌎 Votes from {locations.slice(0, 4).join(', ')} &nbsp;•&nbsp;</>}
                        📡 Join at {APP_CONFIG.domain} &nbsp;•&nbsp;
                        {hypeInfo.emoji} Hype: {hypeInfo.label} &nbsp;•&nbsp;
                        📰 {djIntelHeadlines[djIntelIndex]} &nbsp;•&nbsp;
                        {onThisDayFacts.length > 0 && <>📅 {onThisDayFacts[onThisDayIndex]} &nbsp;•&nbsp;</>}
                        {djCommentary && <>🎙️ {djCommentary} &nbsp;•&nbsp;</>}
                        {playlist.length >= 2 && <>📈 #{2}: &ldquo;{playlist[1].name}&rdquo; (+{playlist[1].score}) &nbsp;•&nbsp;</>}
                        {playlist.length >= 3 && <>📉 #{3}: &ldquo;{playlist[2].name}&rdquo; (+{playlist[2].score}) &nbsp;•&nbsp;</>}
                        🤝 Collaborating with DJs in real time &nbsp;•&nbsp;
                    </span>
                    <span className="ticker-content" aria-hidden="true">
                        🔥 {playlist.length} songs battling &nbsp;•&nbsp;
                        🗳️ {totalVotes} votes cast &nbsp;•&nbsp;
                        👥 {uniqueContributors} DJs contributing &nbsp;•&nbsp;
                        {playlist.length > 0 && <>👑 #1: &ldquo;{playlist[0].name}&rdquo; by {playlist[0].artist} (+{playlist[0].score}) &nbsp;•&nbsp;</>}
                        📦 This Week: {playlistTitle || 'Crate Hackers Playlist'} &nbsp;•&nbsp;
                        🎧 You&apos;re shaping the future of dance music &nbsp;•&nbsp;
                        📱 Scan QR to download songs &amp; Spotify playlist &nbsp;•&nbsp;
                        {currentSong.bpm && <>⏱ {currentSong.bpm} BPM &nbsp;•&nbsp;</>}
                        {currentSong.camelotKey && <>🔑 Key: {currentSong.camelotKey} &nbsp;•&nbsp;</>}
                        {locations.length > 0 && <>🌎 Votes from {locations.slice(0, 4).join(', ')} &nbsp;•&nbsp;</>}
                        📡 Join at {APP_CONFIG.domain} &nbsp;•&nbsp;
                        {hypeInfo.emoji} Hype: {hypeInfo.label} &nbsp;•&nbsp;
                        📰 {djIntelHeadlines[djIntelIndex]} &nbsp;•&nbsp;
                        {onThisDayFacts.length > 0 && <>📅 {onThisDayFacts[onThisDayIndex]} &nbsp;•&nbsp;</>}
                        {djCommentary && <>🎙️ {djCommentary} &nbsp;•&nbsp;</>}
                        {playlist.length >= 2 && <>📈 #{2}: &ldquo;{playlist[1].name}&rdquo; (+{playlist[1].score}) &nbsp;•&nbsp;</>}
                        {playlist.length >= 3 && <>📉 #{3}: &ldquo;{playlist[2].name}&rdquo; (+{playlist[2].score}) &nbsp;•&nbsp;</>}
                        🤝 Collaborating with DJs in real time &nbsp;•&nbsp;
                    </span>
                </div>
            </div>
        </div>
    );
}
