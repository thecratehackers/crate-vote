'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import './JukeboxPlayer.css';
import { APP_CONFIG, BROADCAST } from '@/lib/config';
import { SoundEffects } from '@/lib/sounds';

interface Song {
    id: string;
    name: string;
    artist: string;
    albumArt: string;
    score: number;
    addedByName?: string;
    addedByLocation?: string;
    addedByColor?: string;
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


    // 🎬 POP-UP VIDEO FACTS
    const [popUpFacts, setPopUpFacts] = useState<PopUpFact[]>([]);
    const [currentFact, setCurrentFact] = useState<PopUpFact | null>(null);
    const [factPosition, setFactPosition] = useState(0);
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

    // Dopamine-inducing gamification tips
    const gameTips = [
        { icon: '🔊', text: 'Vote for your favorites to push them to #1!' },
        { icon: '⚡', text: 'Watch 60 secs to earn +1 karma!' },
        { icon: '🎚️', text: 'Top 3 songs earn extra karma!' },
        { icon: '🏆', text: 'Your karma unlocks bonus votes!' },
        { icon: '💿', text: 'Add your own songs to the queue!' },
        { icon: '📡', text: 'Stay active for surprise karma bonuses!' },
    ];

    // 🎬 FETCH FACTS FROM GENIUS API + ERA DATA
    useEffect(() => {
        const fetchGeniusFacts = async () => {
            try {
                const response = await fetch(
                    `/api/genius?artist=${encodeURIComponent(currentSong.artist)}&title=${encodeURIComponent(currentSong.name)}`
                );

                if (response.ok) {
                    const data = await response.json();

                    // Convert Genius facts to PopUpFact format
                    const geniusFacts: PopUpFact[] = (data.facts || []).map((text: string, i: number) => ({
                        category: text.startsWith('📅') ? 'Release' :
                            text.startsWith('🎛️') ? 'Production' :
                                text.startsWith('✍️') ? 'Credits' :
                                    text.startsWith('🎤') ? 'Artist' :
                                        text.startsWith('💿') ? 'Album' :
                                            text.startsWith('🔥') || text.startsWith('👀') ? 'Stats' :
                                                text.startsWith('📝') ? 'Info' : 'Fact',
                        emoji: text.substring(0, 2),
                        text: text.substring(2).trim(),
                        id: `genius-${i}-${Date.now()}`
                    }));

                    // Also generate era facts as backup
                    const releaseYear = data.releaseDate
                        ? parseInt(data.releaseDate.split(', ')[1] || data.releaseDate.split(' ')[2] || '2020')
                        : new Date().getFullYear();
                    const eraFacts = generateFacts(currentSong.name, currentSong.artist, releaseYear);

                    // Combine and shuffle: Genius facts first, then era facts
                    // Include MORE era facts for richer content - 12 instead of 8
                    const allFacts = [...geniusFacts, ...eraFacts.slice(0, 12)];

                    // Shuffle
                    for (let i = allFacts.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [allFacts[i], allFacts[j]] = [allFacts[j], allFacts[i]];
                    }

                    setPopUpFacts(allFacts);
                } else {
                    // Fallback to era facts only
                    const releaseYear = new Date().getFullYear() - Math.floor(Math.random() * 10);
                    const facts = generateFacts(currentSong.name, currentSong.artist, releaseYear);
                    setPopUpFacts(facts);
                }
            } catch (error) {
                console.error('Failed to fetch Genius facts:', error);
                // Fallback to era facts
                const releaseYear = new Date().getFullYear() - Math.floor(Math.random() * 10);
                const facts = generateFacts(currentSong.name, currentSong.artist, releaseYear);
                setPopUpFacts(facts);
            }

            factIndexRef.current = 0;
        };

        fetchGeniusFacts();
    }, [currentSong.id, currentSong.name, currentSong.artist]);

    // 🎬 SHOW FACTS PERIODICALLY
    useEffect(() => {
        if (popUpFacts.length === 0) return;

        const showFact = () => {
            const fact = popUpFacts[factIndexRef.current % popUpFacts.length];
            factIndexRef.current++;
            setFactPosition(Math.floor(Math.random() * POPUP_POSITIONS.length));
            setCurrentFact(fact);

            // Hide after 6 seconds (longer visibility)
            setTimeout(() => setCurrentFact(null), 6000);
        };

        // Show first fact after 2 seconds (faster start)
        const initialTimeout = setTimeout(showFact, 2000);

        // Then show facts every 6 seconds (more frequent)
        const interval = setInterval(showFact, 6000);

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

    // Rotating idle mode messages for variety
    const idleMessages = [
        {
            headline: 'BE THE DJ!',
            subtext: 'Add songs • Cast votes • Control the vibe',
            cta: 'JOIN IN',
            emojis: ['🎛️', '💿', '🔊', '📦', '🎚️', '🎧']
        },
        {
            headline: 'SHAPE THE SOUND!',
            subtext: 'Your picks determine what plays next',
            cta: 'SCAN NOW',
            emojis: ['📱', '💿', '🎚️', '🔊', '📡', '🎧']
        },
        {
            headline: 'RUN THE BOOTH!',
            subtext: 'Vote up the bangers • Skip the duds',
            cta: 'GET IN',
            emojis: ['🎛️', '🎚️', '📦', '🔊', '💿', '⚡']
        },
        {
            headline: "DON'T JUST WATCH!",
            subtext: 'Scan the code • Make your voice heard',
            cta: 'VOTE!',
            emojis: ['🖥️', '📱', '🗳️', '📡', '💿', '🔊']
        },
        {
            headline: 'EARN KARMA!',
            subtext: 'Vote more • Gain power • Unlock perks',
            cta: 'START NOW',
            emojis: ['⚡', '💎', '🏆', '📡', '🎧', '🔊']
        },
    ];

    // Activity feed helper - also triggers emoji burst and resets idle timer
    const addActivity = useCallback((item: Omit<ActivityItem, 'id' | 'timestamp'>) => {
        const newItem: ActivityItem = {
            ...item,
            id: `${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
        };
        setActivityFeed(prev => [newItem, ...prev].slice(0, 8));
        setLastActivityTime(Date.now()); // Reset idle timer
        setIdleMode(false); // Exit idle mode on activity

        // Trigger Vegas-style burst!
        if (item.type === 'vote') {
            triggerEmojiBurst(item.icon === '👍' ? 'upvote' : 'downvote');
            boostHype(8); // 📺 BROADCAST: Votes boost hype
        } else if (item.type === 'newSong') {
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
            setActivityFeed(prev => [...newItems, ...prev].slice(0, 12));
            setLastActivityTime(Date.now());
            setIdleMode(false);
            // Boost hype for server-side activity too
            newItems.forEach(item => {
                if (item.type === 'vote') boostHype(5);
                else if (item.type === 'newSong') boostHype(12);
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

    // Auto-clear old activity items
    useEffect(() => {
        const displayMs = streamMode ? BROADCAST.activityDisplayMs : 8000;
        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            setActivityFeed(prev => prev.filter(item => now - item.timestamp < displayMs));
        }, 2000);
        return () => clearInterval(cleanupInterval);
    }, [streamMode]);

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

    // 📺 BROADCAST: Track total votes for ticker
    useEffect(() => {
        if (!streamMode) return;
        const total = playlist.reduce((sum, s) => sum + Math.abs(s.score), 0);
        setTotalVotes(total);
    }, [playlist, streamMode]);

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

    return (
        <div className={`jukebox-overlay ${streamMode ? 'broadcast-mode' : ''}`} ref={containerRef}>
            {/* 🔙 FIXED CLOSE BUTTON - Hidden in stream mode */}
            {!streamMode && (
                <button className="jukebox-close-fixed" onClick={onClose} aria-label="Close jukebox">
                    ← Back
                </button>
            )}

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

            {/* 🎪 IDLE MODE */}
            {idleMode && (
                <div className="idle-mode-overlay">
                    <div className="idle-content">
                        <div className="idle-emojis">
                            {idleMessages[idleMessageIndex].emojis.map((emoji, i) => (
                                <span key={i} className="idle-emoji" style={{ animationDelay: `${i * 0.15}s` }}>
                                    {emoji}
                                </span>
                            ))}
                        </div>
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
                            <span>Scan to Join!</span>
                        </div>
                        <div className="idle-arrows">
                            <span className="arrow-left">👉</span>
                            <span className="arrow-text">{idleMessages[idleMessageIndex].cta}</span>
                            <span className="arrow-right">👈</span>
                        </div>
                    </div>
                </div>
            )}

            {/* 📊 DASHBOARD LAYOUT - 3 Columns */}
            <div className="jukebox-dashboard">
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
                                    .slice(0, streamMode ? 6 : 4)
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
                            {playlist.slice(0, 3).map((song, i) => (
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

                    {/* Live Activity */}
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">⚡ Live Activity</h3>
                        <div className="sidebar-activity">
                            {activityFeed.length === 0 ? (
                                <p className="activity-empty">No activity yet</p>
                            ) : (
                                activityFeed.map((item) => (
                                    <div key={item.id} className="sidebar-toast">
                                        <span>{item.icon}</span>
                                        <span>{item.text}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* CENTER - Main Jukebox */}
                <div className="jukebox-container">
                    <div className="crowdsource-banner">
                        <div className="crowdsource-label">
                            <span className="live-dot" />
                            <span>🗳️ VOTING OPEN</span>
                        </div>
                        <h2 className="crowdsource-title">Building the Perfect Playlist</h2>
                        <p className="crowdsource-subtitle">Votes decide what plays next</p>
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

                    <div className="jukebox-video-wrapper">
                        <div id="jukebox-player" className="jukebox-video" />



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
                                    <span className="cta-arrow">👉</span>
                                    <span className="cta-text">Vote now at <strong>{APP_CONFIG.domain}</strong></span>
                                    <span className="cta-arrow">👈</span>
                                </div>
                            </div>
                        )}


                    </div>

                    <div className="jukebox-progress">
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="progress-time">
                            <span>{formatTime((progress / 100) * duration)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* 👻 Ghost controls — discreet corner widget for all modes */}
                    <div className="stream-controls-widget">
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

                    {playlist.length > 1 && (
                        <div className="jukebox-queue">
                            <span className="queue-label">🗂️ Up Next ({playlist.length - currentIndex - 1} songs)</span>
                            <div className="queue-items">
                                {playlist.slice(currentIndex + 1, currentIndex + 4).map((song, i) => (
                                    <div key={song.id} className="queue-item">
                                        <span className="queue-position">{i + 1}</span>
                                        <img src={song.albumArt} alt="" className="queue-album" onClick={() => onNextSong(song.id)} title="Skip to this song" />
                                        <div className="queue-info" onClick={() => onNextSong(song.id)}>
                                            <span className="queue-song">
                                                {song.name.length > 18 ? (
                                                    <span className="queue-song-scroll">{song.name}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{song.name}</span>
                                                ) : song.name}
                                            </span>
                                            <span className="queue-artist">{song.artist}</span>
                                        </div>
                                        <div className="queue-voting">
                                            <button className="queue-vote-btn up" onClick={(e) => { e.stopPropagation(); onVote?.(song.id, 1); addActivity({ type: 'vote', text: `Upvoted "${song.name.slice(0, 15)}..."`, icon: '👍' }); }} title="Upvote">👍</button>
                                            <span className="queue-score">{song.score}</span>
                                            <button className="queue-vote-btn down" onClick={(e) => { e.stopPropagation(); onVote?.(song.id, -1); addActivity({ type: 'vote', text: `Downvoted "${song.name.slice(0, 15)}..."`, icon: '👎' }); }} title="Downvote">👎</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!streamMode && (
                        <button className="jukebox-corner-close" onClick={onClose} title="Back to playlist (ESC)">✕</button>
                    )}
                </div>

                {/* RIGHT SIDEBAR */}
                <div className="jukebox-sidebar right">
                    {streamMode ? (
                        <>
                            <div className="sidebar-section">
                                <h3 className="sidebar-title">📡 Hype Zone</h3>
                                <div className="hype-zone-stats">
                                    <div className="hz-stat">
                                        <span className="hz-icon">🗳️</span>
                                        <span className="hz-value">{totalVotes}</span>
                                        <span className="hz-label">votes cast</span>
                                    </div>
                                    <div className="hz-stat">
                                        <span className="hz-icon">💿</span>
                                        <span className="hz-value">{playlist.length}</span>
                                        <span className="hz-label">songs battling</span>
                                    </div>
                                    <div className="hz-stat">
                                        <span className="hz-icon">🧑‍💻</span>
                                        <span className="hz-value">{uniqueContributors}</span>
                                        <span className="hz-label">DJs active</span>
                                    </div>
                                    {playlist.length > 0 && (
                                        <div className="hz-stat hz-top-song">
                                            <span className="hz-icon">👑</span>
                                            <span className="hz-value">{playlist[0].name.slice(0, 18)}</span>
                                            <span className="hz-label">#{1} with +{playlist[0].score}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="sidebar-section">
                                <h3 className="sidebar-title">🏆 Recent</h3>
                                <div className="achievements-feed">
                                    {achievements.length === 0 ? (
                                        <p className="activity-empty">Waiting for action...</p>
                                    ) : (
                                        achievements.map((ach) => (
                                            <div key={ach.id} className="achievement-item">
                                                <span className="ach-emoji">{ach.emoji}</span>
                                                <span className="ach-text">{ach.text}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="sidebar-section cta-section">
                                <div className="big-cta">
                                    <img src="/crate-hackers-logo.png" alt="Crate Hackers" className="cta-logo" />
                                    <span className="cta-label">JOIN NOW!</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="sidebar-section">
                                <h3 className="sidebar-title">📱 How to Vote</h3>
                                <div className="how-to-vote">
                                    <div className="vote-step"><span className="step-num">1</span><span>Scan QR or visit</span></div>
                                    <div className="vote-url">{APP_CONFIG.domain}</div>
                                    <div className="vote-step"><span className="step-num">2</span><span>Pick a name</span></div>
                                    <div className="vote-step"><span className="step-num">3</span><span>👍 Upvote favorites</span></div>
                                    <div className="vote-step"><span className="step-num">4</span><span>👎 Downvote songs you don&apos;t want</span></div>
                                </div>
                            </div>
                            <div className="sidebar-section">
                                <h3 className="sidebar-title">📋 Rules</h3>
                                <ul className="rules-list">
                                    <li>🎵 Add up to 5 songs</li>
                                    <li>⬆️ Top songs make the final playlist</li>
                                    <li>⬇️ Low votes = dropped</li>
                                    <li>⚡ Earn karma by voting</li>
                                    <li>🏆 Top DJs get bragging rights</li>
                                </ul>
                            </div>
                            <div className="sidebar-section cta-section">
                                <div className="big-cta">
                                    <img src="/crate-hackers-logo.png" alt="Crate Hackers" className="cta-logo" />
                                    <span className="cta-label">JOIN NOW!</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 📺 BROADCAST: News Ticker */}
            {streamMode && (
                <div className="broadcast-ticker">
                    <div className="ticker-track">
                        <span className="ticker-content">
                            🔥 {playlist.length} songs battling &nbsp;•&nbsp;
                            🗳️ {totalVotes} votes cast &nbsp;•&nbsp;
                            👥 {uniqueContributors} DJs active &nbsp;•&nbsp;
                            {playlist.length > 0 && <>👑 #1: &ldquo;{playlist[0].name}&rdquo; by {playlist[0].artist} (+{playlist[0].score}) &nbsp;•&nbsp;</>}
                            {locations.length > 0 && <>🌎 Votes from {locations.slice(0, 4).join(', ')} &nbsp;•&nbsp;</>}
                            📱 Join at {APP_CONFIG.domain} &nbsp;•&nbsp;
                            {hypeInfo.emoji} Hype: {hypeInfo.label} &nbsp;•&nbsp;
                        </span>
                        <span className="ticker-content" aria-hidden="true">
                            🔥 {playlist.length} songs battling &nbsp;•&nbsp;
                            🗳️ {totalVotes} votes cast &nbsp;•&nbsp;
                            👥 {uniqueContributors} DJs active &nbsp;•&nbsp;
                            {playlist.length > 0 && <>👑 #1: &ldquo;{playlist[0].name}&rdquo; by {playlist[0].artist} (+{playlist[0].score}) &nbsp;•&nbsp;</>}
                            {locations.length > 0 && <>🌎 Votes from {locations.slice(0, 4).join(', ')} &nbsp;•&nbsp;</>}
                            📱 Join at {APP_CONFIG.domain} &nbsp;•&nbsp;
                            {hypeInfo.emoji} Hype: {hypeInfo.label} &nbsp;•&nbsp;
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
