'use client';

import { useState, useEffect, useCallback } from 'react';
import './VersusBattle.css';

interface VersusBattleSong {
    id: string;
    name: string;
    artist: string;
    albumArt: string;
}

interface VersusBattleState {
    active: boolean;
    songA?: VersusBattleSong;
    songB?: VersusBattleSong;
    endTime?: number;
    remaining?: number;
    phase?: 'voting' | 'lightning' | 'resolved';
    isLightningRound?: boolean;
    winner?: 'A' | 'B' | null;
    userVote?: 'A' | 'B' | null;
    votesA?: number;
    votesB?: number;
}

interface VersusBattleProps {
    battle: VersusBattleState;
    visitorId: string;
    onVote: (choice: 'A' | 'B') => Promise<void>;
    isVoting: boolean;
}

export default function VersusBattle({ battle, visitorId, onVote, isVoting }: VersusBattleProps) {
    const [countdown, setCountdown] = useState(0);

    // Countdown timer
    useEffect(() => {
        if (!battle.active || !battle.endTime) {
            setCountdown(0);
            return;
        }

        const interval = setInterval(() => {
            const remaining = Math.max(0, battle.endTime! - Date.now());
            setCountdown(remaining);
        }, 100);

        return () => clearInterval(interval);
    }, [battle.active, battle.endTime]);

    if (!battle.active || !battle.songA || !battle.songB) {
        return null;
    }

    const handleVote = async (choice: 'A' | 'B') => {
        if (battle.userVote || battle.phase === 'resolved' || isVoting) return;
        await onVote(choice);
    };

    const countdownSeconds = Math.ceil(countdown / 1000);
    const isUrgent = countdown <= 5000;

    return (
        <div className={`versus-battle-banner ${battle.isLightningRound ? 'lightning' : ''}`}>
            {/* Header */}
            <div className="battle-header">
                <h2 className="battle-title">
                    {battle.phase === 'resolved'
                        ? '🏆 BATTLE RESULTS'
                        : battle.isLightningRound
                            ? '⚡ LIGHTNING ROUND'
                            : '⚔️ VERSUS BATTLE'}
                </h2>
                {battle.phase !== 'resolved' && (
                    <div className={`battle-countdown ${isUrgent ? 'urgent' : ''}`}>
                        {countdownSeconds}s
                    </div>
                )}
            </div>

            {/* Song Cards */}
            <div className="battle-arena">
                {/* Song A */}
                <div
                    className={`battle-song ${battle.userVote === 'A' ? 'voted' : ''} ${battle.winner === 'A' ? 'winner' : ''} ${battle.winner === 'B' ? 'loser' : ''}`}
                    onClick={() => handleVote('A')}
                    role="button"
                    tabIndex={0}
                    aria-label={`Vote for ${battle.songA.name} by ${battle.songA.artist}`}
                >
                    <img
                        src={battle.songA.albumArt}
                        alt=""
                        className="battle-album-art"
                    />
                    <div className="battle-song-name">{battle.songA.name}</div>
                    <div className="battle-song-artist">{battle.songA.artist}</div>
                    {battle.userVote === 'A' && (
                        <div className="vote-badge">✓ Your Vote</div>
                    )}
                    {battle.winner === 'A' && (
                        <div className="winner-badge">🏆 WINNER</div>
                    )}
                    {battle.winner === 'B' && (
                        <div className="loser-badge">❌ ELIMINATED</div>
                    )}
                    {/* Show vote count after battle resolved */}
                    {battle.phase === 'resolved' && battle.votesA !== undefined && (
                        <div className="vote-count">{battle.votesA} votes</div>
                    )}
                </div>

                {/* VS Divider */}
                <div className="battle-vs">
                    <span>VS</span>
                </div>

                {/* Song B */}
                <div
                    className={`battle-song ${battle.userVote === 'B' ? 'voted' : ''} ${battle.winner === 'B' ? 'winner' : ''} ${battle.winner === 'A' ? 'loser' : ''}`}
                    onClick={() => handleVote('B')}
                    role="button"
                    tabIndex={0}
                    aria-label={`Vote for ${battle.songB.name} by ${battle.songB.artist}`}
                >
                    <img
                        src={battle.songB.albumArt}
                        alt=""
                        className="battle-album-art"
                    />
                    <div className="battle-song-name">{battle.songB.name}</div>
                    <div className="battle-song-artist">{battle.songB.artist}</div>
                    {battle.userVote === 'B' && (
                        <div className="vote-badge">✓ Your Vote</div>
                    )}
                    {battle.winner === 'B' && (
                        <div className="winner-badge">🏆 WINNER</div>
                    )}
                    {battle.winner === 'A' && (
                        <div className="loser-badge">❌ ELIMINATED</div>
                    )}
                    {battle.phase === 'resolved' && battle.votesB !== undefined && (
                        <div className="vote-count">{battle.votesB} votes</div>
                    )}
                </div>
            </div>

            {/* Instructions */}
            {battle.phase !== 'resolved' && !battle.userVote && (
                <div className="battle-instructions">
                    Tap a song to vote. One chance.
                </div>
            )}
            {battle.userVote && battle.phase !== 'resolved' && (
                <div className="battle-instructions voted">
                    ✓ Vote locked in — results coming...
                </div>
            )}
        </div>
    );
}
