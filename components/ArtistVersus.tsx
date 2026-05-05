'use client';

import { useEffect, useState } from 'react';
import './ArtistVersus.css';

interface ArtistVersusContestant {
    name: string;
    albumArt: string;
    sampleSongName: string;
    songCount: number;
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
}

interface ArtistVersusProps {
    state: ArtistVersusState;
}

// Brief explosion overlay duration (ms) after a bomb resolves
const EXPLOSION_DURATION_MS = 2500;

export default function ArtistVersus({ state }: ArtistVersusProps) {
    const currentRound = state.currentRound > 0 ? state.rounds[state.currentRound - 1] : null;

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

            {/* Damage Report (after all 3 rounds) */}
            {isDamageReport && <DamageReport state={state} />}

            {/* Active round split-screen */}
            {!isDamageReport && currentRound && (
                <>
                    <div className="av-arena">
                        <ContestantCard
                            contestant={currentRound.artistA}
                            side="A"
                            outcome={currentRound.outcome}
                            winner={currentRound.winner}
                            nukedArtist={currentRound.nukedArtist}
                        />
                        <div className="av-vs"><span>VS</span></div>
                        <ContestantCard
                            contestant={currentRound.artistB}
                            side="B"
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
    outcome: 'pick' | 'bomb' | null;
    winner: 'A' | 'B' | null;
    nukedArtist: 'A' | 'B' | null;
}

function ContestantCard({ contestant, side, outcome, winner, nukedArtist }: ContestantCardProps) {
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
            <img src={contestant.albumArt} alt="" className="av-album-art" />
            <div className="av-artist-name">{contestant.name}</div>
            <div className="av-sample-song">"{contestant.sampleSongName}"</div>
            <div className="av-song-count">{contestant.songCount} songs in playlist</div>

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
