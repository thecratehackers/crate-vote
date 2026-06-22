'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getGameAudioContext, useGameSound } from '@/lib/game-sound';
import './ArtistVersus.css';

interface ArtistVersusContestant {
    name: string;
    albumArt: string;
    sampleSongName: string;
    songCount: number;
    previewUrl?: string | null;
}

interface ArtistVersusAudioCue {
    cueId: string;
    side: 'A' | 'B';
    artistName: string;
    songName: string;
    previewUrl: string;
    startedAt: number;
    durationMs: number;
}

interface ArtistVersusRound {
    roundNumber: 1 | 2 | 3;
    artistA: ArtistVersusContestant;
    artistB: ArtistVersusContestant;
    outcome: 'pick' | 'bomb' | null;
    winner: 'A' | 'B' | null;
    nukedArtist: 'A' | 'B' | null;
    nukedSongIds?: string[];
    nukedArtistName?: string;
    completedAt?: number;
}

export interface ArtistVersusState {
    active: boolean;
    phase: 'lobby' | 'round' | 'awaitingNext' | 'damageReport';
    currentRound: 0 | 1 | 2 | 3;
    rounds: ArtistVersusRound[];
    bombUsed: boolean;
    playerName: string | null;
    startedAt: number;
    audioCue: ArtistVersusAudioCue | null;
}

interface ArtistVersusProps {
    state: ArtistVersusState;
}

// Brief explosion overlay duration (ms) after a bomb resolves
const EXPLOSION_DURATION_MS = 2500;

export default function ArtistVersus({ state }: ArtistVersusProps) {
    const currentRound = state.currentRound > 0 ? state.rounds[state.currentRound - 1] : null;
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCueIdRef = useRef<string | null>(null);
    const currentCueRef = useRef<ArtistVersusAudioCue | null>(null);

    // Shared, app-wide game sound: ON by default, one mute for every game.
    const { soundOn, toggleMuted } = useGameSound();
    const [needsTap, setNeedsTap] = useState(false);
    const [nowPreviewing, setNowPreviewing] = useState<string | null>(null);

    const soundOnRef = useRef(soundOn);
    soundOnRef.current = soundOn;
    const needsTapRef = useRef(needsTap);
    needsTapRef.current = needsTap;

    // Show explosion overlay briefly when a round just resolved with a bomb
    const [showExplosion, setShowExplosion] = useState(false);
    useEffect(() => {
        if (currentRound?.outcome === 'bomb' && currentRound?.completedAt) {
            const elapsed = Date.now() - currentRound.completedAt;
            if (elapsed < EXPLOSION_DURATION_MS) {
                setShowExplosion(true);
                const t = setTimeout(() => setShowExplosion(false), EXPLOSION_DURATION_MS - elapsed);
                return () => clearTimeout(t);
            }
        }
        setShowExplosion(false);
    }, [currentRound?.outcome, currentRound?.completedAt]);

    const stopAudiencePreview = useCallback(() => {
        if (audioStopTimeoutRef.current) {
            clearTimeout(audioStopTimeoutRef.current);
            audioStopTimeoutRef.current = null;
        }
        if (audioRef.current) {
            try {
                audioRef.current.pause();
                audioRef.current.src = '';
            } catch (error) {
                // Browser cleanup can fail if the media element is already gone.
            }
            audioRef.current = null;
        }
        setNowPreviewing(null);
    }, []);

    const playAudioCue = useCallback((cue: ArtistVersusAudioCue) => {
        stopAudiencePreview();

        const elapsedMs = Math.max(0, Date.now() - cue.startedAt);
        const remainingMs = Math.max(0, cue.durationMs - elapsedMs);
        if (remainingMs <= 0) return;

        try {
            const audio = new Audio(cue.previewUrl);
            audio.volume = 0.8;
            audioRef.current = audio;
            if (elapsedMs > 1000) {
                audio.currentTime = elapsedMs / 1000;
            }
            setNowPreviewing(`${cue.artistName} — "${cue.songName}"`);

            audio.play().then(() => {
                setNeedsTap(false);
            }).catch(error => {
                // Browser blocked autoplay (no interaction yet). Keep sound ON;
                // the next tap anywhere on the page will start it.
                console.warn('Audience preview playback blocked:', error);
                setNeedsTap(true);
            });

            audioStopTimeoutRef.current = setTimeout(stopAudiencePreview, remainingMs);
            audio.addEventListener('ended', stopAudiencePreview);
        } catch (error) {
            console.warn('Audience preview init failed:', error);
            stopAudiencePreview();
        }
    }, [stopAudiencePreview]);

    // If a preview was blocked (no interaction yet), retry it on the next tap/keypress.
    useEffect(() => {
        const unlock = () => {
            getGameAudioContext();
            if (needsTapRef.current) {
                const cue = currentCueRef.current;
                if (soundOnRef.current && cue) {
                    lastCueIdRef.current = cue.cueId;
                    playAudioCue(cue);
                }
                setNeedsTap(false);
            }
        };
        const opts: AddEventListenerOptions = { passive: true };
        window.addEventListener('pointerdown', unlock, opts);
        window.addEventListener('touchstart', unlock, opts);
        window.addEventListener('keydown', unlock, opts);
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, [playAudioCue]);

    useEffect(() => {
        const cue = state.audioCue;
        currentCueRef.current = (state.active && state.phase === 'round') ? (cue || null) : null;
        if (!state.active || state.phase !== 'round' || !cue) {
            lastCueIdRef.current = null;
            stopAudiencePreview();
            return;
        }

        if (lastCueIdRef.current === cue.cueId) return;
        lastCueIdRef.current = cue.cueId;

        if (!soundOn) {
            stopAudiencePreview();
            return;
        }

        playAudioCue(cue);
    }, [soundOn, playAudioCue, state.active, state.audioCue, state.phase, stopAudiencePreview]);

    // React to the shared mute toggle: start/stop the current preview immediately.
    useEffect(() => {
        if (soundOn) {
            const cue = currentCueRef.current;
            if (cue) {
                lastCueIdRef.current = cue.cueId;
                playAudioCue(cue);
            }
        } else {
            stopAudiencePreview();
        }
    }, [soundOn, playAudioCue, stopAudiencePreview]);

    const handleToggleAudienceAudio = () => {
        if (!soundOn) setNeedsTap(false);
        toggleMuted();
    };

    if (!state.active) return null;

    const isDamageReport = state.phase === 'damageReport';
    const playerLabel = state.playerName
        ? `${state.playerName.toUpperCase()}${isDamageReport ? ' PLAYED' : ' IS PICKING'}`
        : (isDamageReport ? 'AUDIENCE PLAYED' : 'AUDIENCE PLAYER');

    return (
        <div className="artist-versus-banner">
            {/* Header */}
            <div className="av-header">
                <div className="av-player-banner">{playerLabel}</div>
                <h2 className="av-title">
                    {isDamageReport ? 'damage report' : '1s and 0s'}
                </h2>
                {!isDamageReport && currentRound && (
                    <div className="av-round-counter">ROUND {currentRound.roundNumber} OF 3</div>
                )}
                {!isDamageReport && (
                    <div className={`av-bomb-status ${state.bombUsed ? 'used' : 'armed'}`}>
                        {state.bombUsed ? 'BOMB USED' : 'BOMB ARMED'}
                    </div>
                )}
            </div>

            {!isDamageReport && currentRound && (
                <div className={`av-audio-consent ${soundOn ? 'enabled' : ''}`}>
                    <div>
                        <strong>{soundOn ? '🔊 Sound on' : '🔇 Muted'}</strong>
                        <span>
                            {soundOn
                                ? (needsTap
                                    ? 'Tap anywhere to start the previews.'
                                    : (nowPreviewing ? `Now previewing ${nowPreviewing}` : 'Clips play for the whole room when the host taps play.'))
                                : 'Previews are muted on this device only.'}
                        </span>
                    </div>
                    <button type="button" onClick={handleToggleAudienceAudio}>
                        {soundOn ? 'Mute' : 'Unmute'}
                    </button>
                </div>
            )}

            {!isDamageReport && currentRound && (
                <div className="av-twitch-rules" aria-label="Twitch chat voting rules">
                    <div className="av-rule-card left">
                        <span className="av-rule-logo" aria-hidden="true">
                            <img src={currentRound.artistA.albumArt} alt="" />
                            <b>1</b>
                        </span>
                        <div>
                            <strong>Type 1 in Twitch chat</strong>
                            <span>Vote for the left side: {currentRound.artistA.name}</span>
                        </div>
                    </div>
                    <div className="av-rule-vs">CHAT VOTE</div>
                    <div className="av-rule-card right">
                        <span className="av-rule-logo" aria-hidden="true">
                            <img src={currentRound.artistB.albumArt} alt="" />
                            <b>0</b>
                        </span>
                        <div>
                            <strong>Type 0 in Twitch chat</strong>
                            <span>Vote for the right side: {currentRound.artistB.name}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Damage Report (after all 3 rounds) */}
            {isDamageReport && <DamageReport state={state} />}

            {/* Active round split-screen */}
            {!isDamageReport && currentRound && (
                <>
                    <div className="av-arena">
                        <ContestantCard
                            contestant={currentRound.artistA}
                            side="A"
                            chatVote="1"
                            outcome={currentRound.outcome}
                            winner={currentRound.winner}
                            nukedArtist={currentRound.nukedArtist}
                        />
                        <div className="av-vs"><span>VS</span></div>
                        <ContestantCard
                            contestant={currentRound.artistB}
                            side="B"
                            chatVote="0"
                            outcome={currentRound.outcome}
                            winner={currentRound.winner}
                            nukedArtist={currentRound.nukedArtist}
                        />
                    </div>

                    {/* Round result strip */}
                    <RoundStrip rounds={state.rounds} currentRound={state.currentRound} />

                    {/* Status line */}
                    {state.phase === 'round' && (
                        <div className="av-instructions">Player picking now...</div>
                    )}
                    {state.phase === 'awaitingNext' && currentRound.outcome === 'pick' && (
                        <div className="av-instructions resolved">
                            +1 to {currentRound.winner === 'A' ? currentRound.artistA.name : currentRound.artistB.name}
                            {' / '}-1 to {currentRound.winner === 'A' ? currentRound.artistB.name : currentRound.artistA.name}
                        </div>
                    )}
                    {state.phase === 'awaitingNext' && currentRound.outcome === 'bomb' && (
                        <div className="av-instructions resolved nuked">
                            NUKED: {currentRound.nukedArtistName || (currentRound.nukedArtist === 'A' ? currentRound.artistA.name : currentRound.artistB.name)}
                            {currentRound.nukedSongIds ? ` (${currentRound.nukedSongIds.length} songs wiped)` : ''}
                        </div>
                    )}
                </>
            )}

            {/* Bomb explosion overlay */}
            {showExplosion && currentRound?.outcome === 'bomb' && (
                <div className="av-explosion" role="presentation">
                    <div className="av-explosion-flash">BOOM</div>
                    <div className="av-explosion-detail">
                        {currentRound.nukedArtistName || ''} — {currentRound.nukedSongIds?.length || 0} SONGS WIPED
                    </div>
                </div>
            )}
        </div>
    );
}

// ============ Subcomponents ============

interface ContestantCardProps {
    contestant: ArtistVersusContestant;
    side: 'A' | 'B';
    chatVote: '1' | '0';
    outcome: 'pick' | 'bomb' | null;
    winner: 'A' | 'B' | null;
    nukedArtist: 'A' | 'B' | null;
}

function ContestantCard({ contestant, side, chatVote, outcome, winner, nukedArtist }: ContestantCardProps) {
    const isWinner = outcome === 'pick' && winner === side;
    const isLoser = outcome === 'pick' && winner !== null && winner !== side;
    const isNuked = outcome === 'bomb' && nukedArtist === side;
    const isSurvivor = outcome === 'bomb' && nukedArtist !== null && nukedArtist !== side;

    const className = [
        'av-contestant',
        isWinner ? 'winner' : '',
        isLoser ? 'loser' : '',
        isNuked ? 'nuked' : '',
        isSurvivor ? 'survivor' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={className}>
            <div className="av-chat-vote-badge">
                <span>{chatVote}</span>
                <small>{side === 'A' ? 'LEFT' : 'RIGHT'}</small>
            </div>
            <img src={contestant.albumArt} alt="" className="av-album-art" />
            <div className="av-artist-name">{contestant.name}</div>
            <div className="av-sample-song">"{contestant.sampleSongName}"</div>
            <div className="av-song-count">Type {chatVote} in Twitch chat</div>

            {isWinner && <div className="av-badge winner-badge">+1</div>}
            {isLoser && <div className="av-badge loser-badge">-1</div>}
            {isNuked && <div className="av-badge nuked-badge">NUKED</div>}
            {isSurvivor && <div className="av-badge survivor-badge">SURVIVED</div>}
        </div>
    );
}

interface RoundStripProps {
    rounds: ArtistVersusRound[];
    currentRound: number;
}

function RoundStrip({ rounds, currentRound }: RoundStripProps) {
    return (
        <div className="av-round-strip">
            {[1, 2, 3].map(roundNum => {
                const round = rounds.find(r => r.roundNumber === roundNum);
                const isCurrent = roundNum === currentRound;
                const isPending = !round;
                const isResolved = round?.outcome !== null && round?.outcome !== undefined;

                let label = 'TBD';
                if (round && isResolved) {
                    if (round.outcome === 'pick') {
                        label = round.winner === 'A' ? round.artistA.name : round.artistB.name;
                    } else if (round.outcome === 'bomb') {
                        label = `NUKED ${round.nukedArtistName || ''}`;
                    }
                } else if (round && !isResolved) {
                    label = 'LIVE';
                }

                const cls = [
                    'av-round-pip',
                    isCurrent ? 'current' : '',
                    isPending ? 'pending' : '',
                    isResolved ? 'resolved' : '',
                    round?.outcome === 'bomb' ? 'bomb' : '',
                ].filter(Boolean).join(' ');

                return (
                    <div key={roundNum} className={cls}>
                        <div className="av-round-pip-num">R{roundNum}</div>
                        <div className="av-round-pip-label">{label}</div>
                    </div>
                );
            })}
        </div>
    );
}

interface DamageReportProps {
    state: ArtistVersusState;
}

function DamageReport({ state }: DamageReportProps) {
    const nukedRounds = state.rounds.filter(r => r.outcome === 'bomb');
    const pickRounds = state.rounds.filter(r => r.outcome === 'pick');

    return (
        <div className="av-damage-report">
            <div className="av-damage-header">
                {state.playerName ? `${state.playerName.toUpperCase()}'S DAMAGE` : 'PLAYER DAMAGE'}
            </div>

            {nukedRounds.length > 0 && (
                <div className="av-damage-section nuked-section">
                    <div className="av-damage-section-title">NUKED ARTISTS</div>
                    {nukedRounds.map(r => (
                        <div key={r.roundNumber} className="av-damage-row nuked-row">
                            <span className="av-damage-round">R{r.roundNumber}</span>
                            <span className="av-damage-name">
                                {r.nukedArtistName || (r.nukedArtist === 'A' ? r.artistA.name : r.artistB.name)}
                            </span>
                            <span className="av-damage-impact">
                                {r.nukedSongIds?.length || 0} songs wiped
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {pickRounds.length > 0 && (
                <div className="av-damage-section">
                    <div className="av-damage-section-title">PICKS</div>
                    {pickRounds.map(r => {
                        const winnerName = r.winner === 'A' ? r.artistA.name : r.artistB.name;
                        const loserName = r.winner === 'A' ? r.artistB.name : r.artistA.name;
                        return (
                            <div key={r.roundNumber} className="av-damage-row">
                                <span className="av-damage-round">R{r.roundNumber}</span>
                                <span className="av-damage-name">{winnerName}</span>
                                <span className="av-damage-impact">over {loserName}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {nukedRounds.length === 0 && pickRounds.length === 0 && (
                <div className="av-damage-empty">No rounds completed.</div>
            )}
        </div>
    );
}
