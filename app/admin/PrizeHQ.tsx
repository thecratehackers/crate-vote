'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PrizeRevealMode, PrizeTemplate, PrizeTemplateId } from '@/lib/prize-templates';

interface PrizeDropHistoryItem {
    id: string;
    winnerVisitorId: string;
    winnerName: string;
    timestamp: number;
    prizeType: PrizeTemplateId;
    prizeTemplateId: PrizeTemplateId;
    revealMode: PrizeRevealMode;
}

interface PrizeEligibilitySummary {
    eligibleActiveUsers: number;
    blockedRecentWinners: number;
    freshEligibleUsers: number;
    cooldownDays: number;
    lastWinner: PrizeDropHistoryItem | null;
}

interface PrizeRevealModeOption {
    id: PrizeRevealMode;
    label: string;
    description: string;
}

interface PrizeHQProps {
    adminKey: string;
    adminId: string;
    onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
}

const prizeViewerRules = [
    'The host starts the prize drop.',
    'Only active eligible viewers can win.',
    'Recent winners sit out for 30 days.',
    'The screen picks the winner.',
    'The host confirms the prize after the reveal.',
];

const prizeHostScript =
    'Prize drop time. If you are active and eligible, you are in the pool. Recent winners sit this one out so more people get a shot. The screen is going to pick the winner.';

const prizeRunSteps = [
    'Pick an approved prize.',
    'Pick the reveal style.',
    'Check Ready To Win before starting.',
    'Press Activate Prize Drop.',
    'Read the winner name from the front screen.',
    'Use Prize History if anyone asks about repeat winners.',
];

export default function PrizeHQ({ adminKey, adminId, onMessage }: PrizeHQProps) {
    const [templates, setTemplates] = useState<PrizeTemplate[]>([]);
    const [revealModes, setRevealModes] = useState<PrizeRevealModeOption[]>([]);
    const [history, setHistory] = useState<PrizeDropHistoryItem[]>([]);
    const [eligibility, setEligibility] = useState<PrizeEligibilitySummary | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState<PrizeTemplateId | null>(null);
    const [selectedRevealMode, setSelectedRevealMode] = useState<PrizeRevealMode>('spin');
    const [isLoading, setIsLoading] = useState(false);
    const [isDropping, setIsDropping] = useState(false);

    const selectedTemplate = useMemo(() => {
        return templates.find(template => template.id === selectedTemplateId) || templates[0] || null;
    }, [selectedTemplateId, templates]);

    const fetchPrizeHQ = useCallback(async () => {
        if (!adminKey) return;
        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/prize-drop', {
                headers: {
                    'x-admin-key': adminKey,
                    'x-admin-id': adminId,
                },
            });
            const data = await res.json();
            if (!res.ok) {
                onMessage({ type: 'error', text: data.error || 'Could not load Prize HQ.' });
                return;
            }
            setTemplates(data.templates || []);
            setRevealModes(data.revealModes || []);
            setHistory(data.history || []);
            setEligibility(data.eligibility || null);
            if (!selectedTemplateId && data.templates?.[0]?.id) {
                setSelectedTemplateId(data.templates[0].id);
            }
        } catch (error) {
            onMessage({ type: 'error', text: 'Prize HQ failed to load - network error.' });
        } finally {
            setIsLoading(false);
        }
    }, [adminId, adminKey, onMessage, selectedTemplateId]);

    useEffect(() => {
        fetchPrizeHQ();
    }, [fetchPrizeHQ]);

    const triggerPrizeDrop = async () => {
        if (!selectedTemplate) {
            onMessage({ type: 'error', text: 'Pick an approved prize first.' });
            return;
        }

        setIsDropping(true);
        try {
            const res = await fetch('/api/admin/prize-drop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': adminKey,
                    'x-admin-id': adminId,
                },
                body: JSON.stringify({
                    prizeTemplateId: selectedTemplate.id,
                    revealMode: selectedRevealMode,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                onMessage({ type: 'error', text: data.error || 'Could not trigger prize drop.' });
                return;
            }
            onMessage({
                type: 'success',
                text: `${selectedTemplate.title}: ${data.winner?.name || 'Someone'} won. Front screen is live.`,
            });
            fetchPrizeHQ();
        } catch (error) {
            onMessage({ type: 'error', text: 'Prize drop failed - network error.' });
        } finally {
            setIsDropping(false);
        }
    };

    const formatPrizeDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const isAdminWinner = (winner: PrizeDropHistoryItem) => {
        return winner.winnerVisitorId.startsWith('admin-') || winner.winnerName.trim().toLowerCase().includes('admin');
    };

    return (
        <div className="prize-hq-shell">
            <div className="prize-hq-hero">
                <div>
                    <div className="prize-hq-kicker">Host Safe Mode</div>
                    <h2>Prize HQ</h2>
                    <p>
                        Trigger approved prize drops, pick the reveal style, and let the front screen do the game-show moment.
                    </p>
                </div>
                <button className="admin-btn admin-btn-sm" onClick={fetchPrizeHQ} disabled={isLoading}>
                    {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            <section className="host-guide-card prize-host-guide">
                <div className="host-guide-header">
                    <span>Host Script</span>
                    <h3>Prize Drop Host Guide</h3>
                </div>
                <div className="host-guide-grid">
                    <div className="host-guide-block viewer">
                        <h4>Rules For The Screen</h4>
                        <ul>
                            {prizeViewerRules.map(rule => (
                                <li key={rule}>{rule}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="host-guide-block script">
                        <h4>Say This</h4>
                        <p>{prizeHostScript}</p>
                    </div>
                    <div className="host-guide-block run">
                        <h4>How To Run It</h4>
                        <ul>
                            {prizeRunSteps.map(step => (
                                <li key={step}>{step}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <div className="prize-hq-stats">
                <div className="prize-hq-stat">
                    <span>{eligibility?.freshEligibleUsers ?? 0}</span>
                    <strong>Ready To Win</strong>
                </div>
                <div className="prize-hq-stat blocked">
                    <span>{eligibility?.blockedRecentWinners ?? 0}</span>
                    <strong>30-Day Blocked</strong>
                </div>
                <div className="prize-hq-stat">
                    <span>{eligibility?.eligibleActiveUsers ?? 0}</span>
                    <strong>Active Eligible</strong>
                </div>
            </div>

            <div className="prize-hq-grid">
                <section className="prize-hq-panel">
                    <div className="prize-hq-panel-head">
                        <h3>1. Pick Approved Prize</h3>
                        <p>Host can trigger these only. Codes and links are locked.</p>
                    </div>
                    <div className="prize-template-grid">
                        {templates.map(template => (
                            <button
                                key={template.id}
                                type="button"
                                className={`prize-template-card ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                                onClick={() => setSelectedTemplateId(template.id)}
                            >
                                <img src={template.imageUrl} alt="" />
                                <div>
                                    <span className="prize-template-icon">{template.icon}</span>
                                    <strong>{template.title}</strong>
                                    <small>{template.description}</small>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="prize-hq-panel">
                    <div className="prize-hq-panel-head">
                        <h3>2. Pick Reveal</h3>
                        <p>Choose how dramatic the front screen should feel.</p>
                    </div>
                    <div className="prize-reveal-grid">
                        {revealModes.map(mode => (
                            <button
                                key={mode.id}
                                type="button"
                                className={`prize-reveal-card ${selectedRevealMode === mode.id ? 'selected' : ''}`}
                                onClick={() => setSelectedRevealMode(mode.id)}
                            >
                                <strong>{mode.label}</strong>
                                <span>{mode.description}</span>
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            <section className="prize-hq-launch">
                <div>
                    <h3>3. Activate Live Drop</h3>
                    <p>
                        {selectedTemplate
                            ? `${selectedTemplate.title} with ${revealModes.find(mode => mode.id === selectedRevealMode)?.label || 'selected reveal'}.`
                            : 'Pick a prize to continue.'}
                    </p>
                    <small>
                        Recent winners stay blocked for {eligibility?.cooldownDays || 30} days. Admin host stays eligible for testing.
                    </small>
                </div>
                <button
                    className="prize-hq-drop-btn"
                    onClick={triggerPrizeDrop}
                    disabled={isDropping || !selectedTemplate || (eligibility?.freshEligibleUsers ?? 0) <= 0}
                >
                    {isDropping ? 'Dropping...' : 'Activate Prize Drop'}
                </button>
            </section>

            <section className="prize-hq-panel">
                <div className="prize-hq-panel-head">
                    <h3>Prize History</h3>
                    <p>Use this for historic reference and repeat-winner checks.</p>
                </div>
                {history.length === 0 ? (
                    <div className="prize-history-empty">No prize winners saved yet.</div>
                ) : (
                    <div className="prize-history-list">
                        {history.map((winner, index) => {
                            const adminWinner = isAdminWinner(winner);
                            const wonRecently = !adminWinner && Date.now() - winner.timestamp < 30 * 24 * 60 * 60 * 1000;
                            return (
                                <div key={winner.id} className="prize-history-row">
                                    <div className="prize-history-rank">#{index + 1}</div>
                                    <div className="prize-history-main">
                                        <strong>{winner.winnerName}</strong>
                                        <span>{formatPrizeDate(winner.timestamp)}</span>
                                    </div>
                                    <div className={`prize-history-status ${wonRecently ? 'blocked' : 'clear'}`}>
                                        {adminWinner ? 'Admin exempt' : wonRecently ? '30-day block' : 'Eligible'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
