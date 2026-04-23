import Link from 'next/link';
import type { Show } from '@/lib/entities';
import './ShowArchiveList.css';

interface ShowArchiveListProps {
    tabSlug: string;
    tabName: string;
    shows: Show[];
}

export default function ShowArchiveList({ tabSlug, tabName, shows }: ShowArchiveListProps) {
    if (shows.length === 0) {
        return (
            <div className="archive-empty">
                <h2>{tabName} Archive</h2>
                <p>No shows yet.</p>
            </div>
        );
    }

    const active = shows.filter((s) => s.status === 'active');
    const archived = shows.filter((s) => s.status === 'archived');
    const draft = shows.filter((s) => s.status === 'draft');

    return (
        <div className="archive-root">
            <header className="archive-header">
                <Link href={`/tab/${tabSlug}`} className="archive-back">
                    ← {tabName}
                </Link>
                <h1>Archive</h1>
                <p className="archive-sub">
                    Every show preserved. Click any to view its songs and (per tab settings) keep voting.
                </p>
            </header>

            {active.length > 0 && (
                <Section title="Live now">
                    {active.map((s) => (
                        <ShowCard key={s.id} tabSlug={tabSlug} show={s} />
                    ))}
                </Section>
            )}

            {archived.length > 0 && (
                <Section title="Past shows">
                    {archived.map((s) => (
                        <ShowCard key={s.id} tabSlug={tabSlug} show={s} />
                    ))}
                </Section>
            )}

            {draft.length > 0 && (
                <Section title="Drafts">
                    {draft.map((s) => (
                        <ShowCard key={s.id} tabSlug={tabSlug} show={s} />
                    ))}
                </Section>
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="archive-section">
            <h2 className="archive-section-title">{title}</h2>
            <div className="archive-list">{children}</div>
        </section>
    );
}

function ShowCard({ tabSlug, show }: { tabSlug: string; show: Show }) {
    const date =
        show.archivedAt || show.startedAt || show.createdAt;

    return (
        <Link href={`/tab/${tabSlug}/show/${show.id}`} className="archive-card">
            <div className="archive-card-num">#{show.showNumber}</div>
            <div className="archive-card-body">
                <div className="archive-card-title">{show.title}</div>
                {show.description && (
                    <div className="archive-card-desc">{show.description}</div>
                )}
                <div className="archive-card-date">
                    {new Date(date).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                    })}
                </div>
            </div>
            <div className={`archive-card-status archive-status-${show.status}`}>
                {show.status === 'active' ? 'LIVE' : show.status === 'archived' ? 'ARCHIVED' : 'DRAFT'}
            </div>
        </Link>
    );
}
