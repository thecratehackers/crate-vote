'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import './JukeboxPlayer.css';

interface Song {
    id: string;
    name: string;
    artist: string;
    albumArt: string;
    score: number;
    addedByName?: string;
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
    facts.push({ category: 'Release', emoji: '📅', text: `"${songName}" dropped in ${releaseYear}.`, id: `release-${Date.now()}` });
    if (yearsAgo > 0 && yearsAgo < 50) {
        facts.push({ category: 'Time', emoji: '⏰', text: `This track is ${yearsAgo} years old.`, id: `age-${Date.now()}` });
    }
    facts.push({ category: 'Artist', emoji: '🎤', text: `Performed by ${artistName}.`, id: `artist-${Date.now()}` });

    // Fashion
    era.fashion.forEach((item, i) => {
        facts.push({ category: 'Fashion', emoji: '👗', text: `In ${releaseYear}, ${item} were trending.`, id: `fashion-${i}` });
    });

    // Culture
    era.events.forEach((event, i) => {
        facts.push({ category: 'Culture', emoji: '🌍', text: `${eraName}: ${event}.`, id: `culture-${i}` });
    });

    // Tech
    era.tech.forEach((tech, i) => {
        facts.push({ category: 'Tech', emoji: '📱', text: `${eraName} tech: ${tech}.`, id: `tech-${i}` });
    });

    // Slang
    era.slang.forEach((slang, i) => {
        facts.push({ category: 'Slang', emoji: '🗣️', text: `People said "${slang}" back then.`, id: `slang-${i}` });
    });

    // Music
    era.music.forEach((fact, i) => {
        facts.push({ category: 'Music', emoji: '🎵', text: fact, id: `music-${i}` });
    });

    // Era
    facts.push({ category: 'Era', emoji: '🎭', text: `This song is from ${era.name}.`, id: `era-${Date.now()}` });

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
}: JukeboxPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
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
    const [lastScore, setLastScore] = useState<number | null>(null);
    const [lastRank, setLastRank] = useState<number | null>(null);
    const [scoreAnimation, setScoreAnimation] = useState<{ delta: number; key: number } | null>(null);
    const [rankAlert, setRankAlert] = useState<{ from: number; to: number; key: number } | null>(null);
    const [showCTA, setShowCTA] = useState(false);

    // Dopamine-inducing gamification tips
    const gameTips = [
        { icon: '🔥', text: 'Vote for your favorites to push them to #1!' },
        { icon: '⚡', text: 'Earn karma by watching - 60 secs = +1 karma!' },
        { icon: '🎯', text: 'Top 3 songs get extra visibility!' },
        { icon: '💥', text: 'Downvote songs you want to skip!' },
        { icon: '🏆', text: 'Your karma unlocks bonus votes!' },
        { icon: '🎵', text: 'Add your own songs to the queue!' },
        { icon: '⬆️', text: 'Upvote to save songs from elimination!' },
        { icon: '🎉', text: 'Stay active for surprise karma bonuses!' },
        { icon: '📈', text: 'The more you vote, the more power you have!' },
        { icon: '💎', text: 'High karma = playlist VIP status!' },
    ];

    // 🎬 GENERATE FACTS WHEN SONG CHANGES
    useEffect(() => {
        // Default to current year if no release info
        // In production, this would come from Genius API
        const releaseYear = new Date().getFullYear() - Math.floor(Math.random() * 10); // Simulate varied years
        const facts = generateFacts(currentSong.name, currentSong.artist, releaseYear);
        setPopUpFacts(facts);
        factIndexRef.current = 0;
    }, [currentSong.id]);

    // 🎬 SHOW FACTS PERIODICALLY
    useEffect(() => {
        if (popUpFacts.length === 0) return;

        const showFact = () => {
            const fact = popUpFacts[factIndexRef.current % popUpFacts.length];
            factIndexRef.current++;
            setFactPosition(Math.floor(Math.random() * POPUP_POSITIONS.length));
            setCurrentFact(fact);

            // Hide after 5 seconds
            setTimeout(() => setCurrentFact(null), 5000);
        };

        // Show first fact after 3 seconds
        const initialTimeout = setTimeout(showFact, 3000);

        // Then show facts every 8 seconds
        const interval = setInterval(showFact, 8000);

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

    const triggerEmojiBurst = useCallback((type: 'vote' | 'upvote' | 'downvote') => {
        const emojiSets = {
            vote: ['🔥', '⚡', '✨', '💫', '🎵'],
            upvote: ['👍', '🔥', '💪', '⬆️', '✨'],
            downvote: ['👎', '💀', '📉', '❌', '💨'],
        };
        setEmojiBurst({ emojis: emojiSets[type], key: Date.now() });
        setTimeout(() => setEmojiBurst(null), 2000);
    }, []);

    // 🎪 IDLE MODE - Full-screen promo when no activity
    const [idleMode, setIdleMode] = useState(false);
    const [lastActivityTime, setLastActivityTime] = useState(Date.now());
    const [idleMessageIndex, setIdleMessageIndex] = useState(0);
    const IDLE_TIMEOUT = 25000; // 25 seconds

    // Rotating idle mode messages for variety
    const idleMessages = [
        {
            headline: 'YOUR VOTE MATTERS!',
            subtext: 'Shape the playlist • Earn karma • Win bragging rights',
            cta: 'VOTE NOW',
            emojis: ['🎧', '🔥', '🎵', '⚡', '🏆', '💿']
        },
        {
            headline: 'BE THE DJ!',
            subtext: 'Add songs • Cast votes • Control the vibe',
            cta: 'JOIN IN',
            emojis: ['🎛️', '💿', '🔊', '✨', '🎶', '🎤']
        },
        {
            headline: 'SHAPE THE SOUND!',
            subtext: 'Your picks determine what plays next',
            cta: 'SCAN NOW',
            emojis: ['📱', '🎵', '👆', '🔥', '💫', '🎧']
        },
        {
            headline: 'JOIN THE PARTY!',
            subtext: 'Vote up the bangers • Skip the duds',
            cta: 'GET IN',
            emojis: ['🎉', '🕺', '💃', '🔥', '🎵', '⚡']
        },
        {
            headline: "DON'T JUST WATCH!",
            subtext: 'Scan the code • Make your voice heard',
            cta: 'VOTE!',
            emojis: ['👀', '📱', '🗳️', '✊', '🎵', '💪']
        },
        {
            headline: 'CROWD CONTROL!',
            subtext: 'The audience decides what plays',
            cta: 'JOIN NOW',
            emojis: ['👥', '🎛️', '🎵', '🔥', '🏆', '💿']
        },
        {
            headline: 'EARN KARMA!',
            subtext: 'Vote more • Gain power • Unlock perks',
            cta: 'START NOW',
            emojis: ['⚡', '💎', '🏆', '📈', '✨', '🔥']
        },
        {
            headline: 'WHAT PLAYS NEXT?',
            subtext: 'You decide! Upvote your favorites',
            cta: 'VOTE UP',
            emojis: ['❓', '🎵', '👍', '⬆️', '🔥', '🎧']
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
        }
    }, [triggerEmojiBurst]);

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
        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            setActivityFeed(prev => prev.filter(item => now - item.timestamp < 8000));
        }, 2000);
        return () => clearInterval(cleanupInterval);
    }, []);

    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const watchTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Find current song index and next song
    const currentIndex = playlist.findIndex(s => s.id === currentSong.id);
    const nextSong = currentIndex >= 0 && currentIndex < playlist.length - 1
        ? playlist[currentIndex + 1]
        : null;

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
        // Show next song hint
        if (nextSong) {
            setShowNextHint(true);
            // Auto-advance after 2 seconds
            setTimeout(() => {
                setShowNextHint(false);
                onNextSong(nextSong.id);
            }, 2000);
        } else {
            // No more songs - close jukebox
            onClose();
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

    return (
        <div className="jukebox-overlay" ref={containerRef}>
            {/* 🎰 VEGAS-STYLE EMOJI BURST - Full screen celebration */}
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

            {/* 🎪 IDLE MODE - Full-screen promo when no activity */}
            {idleMode && (
                <div className="idle-mode-overlay">
                    <div className="idle-content">
                        <div className="idle-emojis">
                            {idleMessages[idleMessageIndex].emojis.map((emoji, i) => (
                                <span
                                    key={i}
                                    className="idle-emoji"
                                    style={{ animationDelay: `${i * 0.15}s` }}
                                >
                                    {emoji}
                                </span>
                            ))}
                        </div>
                        <h1 className="idle-headline">{idleMessages[idleMessageIndex].headline}</h1>
                        <p className="idle-subtext">{idleMessages[idleMessageIndex].subtext}</p>
                        <div className="idle-url-box">
                            <span className="idle-url">crateoftheweek.com</span>
                        </div>
                        <div className="idle-qr">
                            <img
                                src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://www.crateoftheweek.com&bgcolor=000000&color=d3771d"
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
                {/* LEFT SIDEBAR - Contributors + Top Songs + Activity */}
                <div className="jukebox-sidebar left">
                    {/* Top Contributors - actual users */}
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">👥 Active DJs</h3>
                        <div className="mini-leaderboard">
                            {(() => {
                                // Get unique contributors with song counts
                                const contributors = playlist
                                    .filter(s => s.addedByName)
                                    .reduce((acc, song) => {
                                        const name = song.addedByName!;
                                        acc[name] = (acc[name] || 0) + 1;
                                        return acc;
                                    }, {} as Record<string, number>);

                                return Object.entries(contributors)
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 4)
                                    .map(([name, count], i) => (
                                        <div key={name} className="lb-row">
                                            <span className="lb-rank">{i === 0 ? '🎧' : `#${i + 1}`}</span>
                                            <span className="lb-name">{name}</span>
                                            <span className="lb-score">🎵{count}</span>
                                        </div>
                                    ));
                            })()}
                        </div>
                    </div>

                    {/* Top 3 Songs */}
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">🔥 Top Songs</h3>
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

                    <div className="sidebar-section">
                        <h3 className="sidebar-title">⚡ Live Activity</h3>
                        <div className="sidebar-activity">
                            {activityFeed.length === 0 ? (
                                <p className="activity-empty">Waiting for votes...</p>
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
                    {/* 🎯 CROWDSOURCE MISSION BANNER */}
                    <div className="crowdsource-banner">
                        <div className="crowdsource-label">
                            <span className="live-dot" />
                            <span>LIVE CROWDSOURCING</span>
                        </div>
                        <h2 className="crowdsource-title">Building the Perfect Playlist</h2>
                        <p className="crowdsource-subtitle">Real-time votes from the crowd determine what plays next</p>
                    </div>

                    {/* Header */}
                    <div className="jukebox-header">
                        <div className="jukebox-now-playing">
                            <span className="jukebox-label">🎵 NOW PLAYING</span>
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
                        <button className="jukebox-close" onClick={onClose} aria-label="Close jukebox">
                            ✕
                        </button>
                    </div>

                    {/* Gamification Tips Banner */}
                    <div className="jukebox-tips-banner">
                        <span className="tip-icon">{gameTips[currentTipIndex].icon}</span>
                        <span className="tip-text" key={currentTipIndex}>{gameTips[currentTipIndex].text}</span>
                    </div>

                    {/* Video Player */}
                    <div className="jukebox-video-wrapper">
                        <div id="jukebox-player" className="jukebox-video" />

                        {/* QR Code Overlay for Stream Viewers */}
                        <div className="jukebox-qr-overlay">
                            <img
                                src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://www.crateoftheweek.com&bgcolor=1a1a1a&color=d3771d"
                                alt="Scan to vote"
                                className="jukebox-qr-img"
                            />
                            <span className="jukebox-qr-label">Vote Now!</span>
                        </div>

                        {/* 🎬 POP-UP VIDEO FACT BUBBLE */}
                        {currentFact && (
                            <div
                                className="popup-video-bubble"
                                style={{
                                    ...POPUP_POSITIONS[factPosition],
                                    position: 'absolute',
                                }}
                                key={currentFact.id}
                            >
                                <span className="popup-category">{currentFact.category}</span>
                                <div className="popup-content">
                                    <span className="popup-emoji">{currentFact.emoji}</span>
                                    <span className="popup-text">{currentFact.text}</span>
                                </div>
                            </div>
                        )}

                        {/* Next Song Hint Overlay */}
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

                        {/* 🔴 SCORE ANIMATION - Floats when votes come in */}
                        {scoreAnimation && (
                            <div
                                className={`jukebox-score-pop ${scoreAnimation.delta > 0 ? 'positive' : 'negative'}`}
                                key={scoreAnimation.key}
                            >
                                {scoreAnimation.delta > 0 ? `+${scoreAnimation.delta}` : scoreAnimation.delta}
                            </div>
                        )}

                        {/* 🔴 RANK CHANGE ALERT - Big splash when position changes */}
                        {rankAlert && (
                            <div className="jukebox-rank-alert" key={rankAlert.key}>
                                {rankAlert.to < rankAlert.from ? (
                                    <>
                                        <span className="rank-icon">🚀</span>
                                        <span className="rank-text">RISING to #{rankAlert.to}!</span>
                                    </>
                                ) : rankAlert.to === 1 ? (
                                    <>
                                        <span className="rank-icon">👑</span>
                                        <span className="rank-text">NOW #1!</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="rank-icon">📉</span>
                                        <span className="rank-text">Dropped to #{rankAlert.to}</span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* 🔴 CTA FLASH - Periodic call to action */}
                        {showCTA && (
                            <div className="jukebox-cta-flash">
                                <div className="cta-content">
                                    <span className="cta-arrow">👉</span>
                                    <span className="cta-text">Join the vote at <strong>crateoftheweek.com</strong></span>
                                    <span className="cta-arrow">👈</span>
                                </div>
                            </div>
                        )}

                        {/* 🔴 LIVE ACTIVITY FEED - Floating toasts */}
                        <div className="jukebox-activity-feed">
                            {activityFeed.map((item) => (
                                <div key={item.id} className={`activity-toast activity-${item.type}`}>
                                    <span className="activity-icon">{item.icon}</span>
                                    <span className="activity-text">{item.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="jukebox-progress">
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="progress-time">
                            <span>{formatTime((progress / 100) * duration)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="jukebox-controls">
                        <button className="control-btn" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                            {isMuted ? '🔇' : '🔊'}
                        </button>
                        <button className="control-btn play-btn" onClick={togglePlayPause}>
                            {isPlaying ? '⏸' : '▶'}
                        </button>
                        <button
                            className="control-btn"
                            onClick={skipToNext}
                            disabled={!nextSong}
                            title={nextSong ? `Skip to: ${nextSong.name}` : 'No more songs'}
                        >
                            ⏭
                        </button>
                    </div>

                    {/* Karma Indicator */}
                    {watchTime > 0 && (
                        <div className="jukebox-karma">
                            {karmaEarned ? (
                                <span className="karma-earned">✨ +1 Karma earned!</span>
                            ) : (
                                <span className="karma-progress">
                                    🎧 Watching: {watchTime}s / 60s for karma
                                </span>
                            )}
                        </div>
                    )}

                    {/* Playlist Queue - with voting! */}
                    {playlist.length > 1 && (
                        <div className="jukebox-queue">
                            <span className="queue-label">📋 Up Next ({playlist.length - currentIndex - 1} songs)</span>
                            <div className="queue-items">
                                {playlist.slice(currentIndex + 1, currentIndex + 4).map((song, i) => (
                                    <div key={song.id} className="queue-item">
                                        <span className="queue-position">{i + 1}</span>
                                        <img
                                            src={song.albumArt}
                                            alt=""
                                            className="queue-album"
                                            onClick={() => onNextSong(song.id)}
                                            title="Skip to this song"
                                        />
                                        <div className="queue-info" onClick={() => onNextSong(song.id)}>
                                            <span className="queue-song">
                                                {song.name.length > 18 ? (
                                                    <span className="queue-song-scroll">
                                                        {song.name}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{song.name}
                                                    </span>
                                                ) : song.name}
                                            </span>
                                            <span className="queue-artist">{song.artist}</span>
                                        </div>
                                        {/* Voting buttons */}
                                        <div className="queue-voting">
                                            <button
                                                className="queue-vote-btn up"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onVote?.(song.id, 1);
                                                    addActivity({
                                                        type: 'vote',
                                                        text: `Upvoted "${song.name.slice(0, 15)}..."`,
                                                        icon: '👍',
                                                    });
                                                }}
                                                title="Upvote"
                                            >
                                                👍
                                            </button>
                                            <span className="queue-score">{song.score}</span>
                                            <button
                                                className="queue-vote-btn down"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onVote?.(song.id, -1);
                                                    addActivity({
                                                        type: 'vote',
                                                        text: `Downvoted "${song.name.slice(0, 15)}..."`,
                                                        icon: '👎',
                                                    });
                                                }}
                                                title="Downvote"
                                            >
                                                👎
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Small corner hint */}
                    <button className="jukebox-corner-close" onClick={onClose} title="Return to voting (ESC)">
                        ✕
                    </button>
                </div>
                {/* END CENTER */}

                {/* RIGHT SIDEBAR - Rules + How to Vote */}
                <div className="jukebox-sidebar right">
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">📱 How to Vote</h3>
                        <div className="how-to-vote">
                            <div className="vote-step">
                                <span className="step-num">1</span>
                                <span>Scan QR or visit</span>
                            </div>
                            <div className="vote-url">crateoftheweek.com</div>
                            <div className="vote-step">
                                <span className="step-num">2</span>
                                <span>Enter your name</span>
                            </div>
                            <div className="vote-step">
                                <span className="step-num">3</span>
                                <span>👍 Upvote favorites</span>
                            </div>
                            <div className="vote-step">
                                <span className="step-num">4</span>
                                <span>👎 Downvote skips</span>
                            </div>
                        </div>
                    </div>

                    <div className="sidebar-section">
                        <h3 className="sidebar-title">📋 Rules</h3>
                        <ul className="rules-list">
                            <li>🎵 Add up to 3 songs</li>
                            <li>⬆️ Top songs get exported</li>
                            <li>⬇️ Low votes = eliminated</li>
                            <li>⚡ Earn karma by voting</li>
                            <li>🏆 Top DJs get bragging rights</li>
                        </ul>
                    </div>

                    <div className="sidebar-section cta-section">
                        <div className="big-cta">
                            <img src="/crate-hackers-logo.svg" alt="Crate Hackers" className="cta-logo" />
                            <span className="cta-label">JOIN NOW!</span>
                        </div>
                    </div>
                </div>
            </div>
            {/* END DASHBOARD */}
        </div>
    );
}
