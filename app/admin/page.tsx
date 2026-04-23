'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import './admin.css';

interface Tab {
    id: string;
    slug: string;
    name: string;
    description?: string;
    themeColor?: string;
    isMainTab: boolean;
    createdAt: number;
    settings: {
        maxSongsPerUser: number;
        maxPlaylistSize: number;
        requiresApproval: boolean;
        allowArchivedVoting: boolean;
    };
}

interface Show {
    id: string;
    tabId: string;
    showNumber: number;
    title: string;
    description?: string;
    status: 'draft' | 'active' | 'archived';
    startedAt: number | null;
    archivedAt: number | null;
    createdAt: number;
    locked: boolean;
}

interface MigrationStatus {
    mainTabExists: boolean;
    mainTabHasCurrentShow: boolean;
    mainTabShowCount: number;
}

export default function AdminPage() {
    const [adminKey, setAdminKey] = useState('');
    const [authed, setAuthed] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        try {
            const stored = sessionStorage.getItem('crate-admin-key') || localStorage.getItem('crate-admin-key');
            if (stored) {
                setAdminKey(stored);
                authenticate(stored);
            }
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const authenticate = async (key: string) => {
        setAuthError(null);
        try {
            const res = await fetch('/api/admin/tabs', {
                headers: { 'x-admin-key': key },
            });
            if (res.ok) {
                setAuthed(true);
                try {
                    sessionStorage.setItem('crate-admin-key', key);
                    localStorage.setItem('crate-admin-key', key);
                } catch {
                    // ignore
                }
            } else {
                setAuthError('Invalid admin password.');
            }
        } catch {
            setAuthError('Could not reach server.');
        }
    };

    if (!authed) {
        return (
            <div className="admin-login">
                <div className="admin-login-box">
                    <h1>CrateVote Admin</h1>
                    <p>Enter the admin password to manage tabs and shows.</p>
                    <input
                        type="password"
                        placeholder="Admin password"
                        value={adminKey}
                        onChange={(e) => setAdminKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && authenticate(adminKey)}
                    />
                    <button onClick={() => authenticate(adminKey)}>Enter</button>
                    {authError && <div className="admin-error">{authError}</div>}
                    <Link href="/" className="admin-back">← Back to CrateVote</Link>
                </div>
            </div>
        );
    }

    return <AdminDashboard adminKey={adminKey} />;
}

// ----------------------------------------------------------------------------
// Authenticated admin dashboard
// ----------------------------------------------------------------------------

function AdminDashboard({ adminKey }: { adminKey: string }) {
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
    const [shows, setShows] = useState<Show[]>([]);
    const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const headers = { 'x-admin-key': adminKey, 'Content-Type': 'application/json' };

    const refresh = useCallback(async () => {
        try {
            const [tabsRes, statusRes] = await Promise.all([
                fetch('/api/admin/tabs', { headers }),
                fetch('/api/admin/shows?status=true', { headers }),
            ]);
            if (tabsRes.ok) {
                const data = await tabsRes.json();
                setTabs(data.tabs || []);
                if (!selectedTabId && data.tabs?.length > 0) {
                    setSelectedTabId(data.tabs[0].id);
                }
            }
            if (statusRes.ok) {
                setMigrationStatus(await statusRes.json());
            }
        } catch (e) {
            console.error('refresh error', e);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adminKey, selectedTabId]);

    const refreshShows = useCallback(async () => {
        if (!selectedTabId) {
            setShows([]);
            return;
        }
        const tab = tabs.find((t) => t.id === selectedTabId);
        if (!tab) return;
        try {
            const res = await fetch(`/api/tabs/${tab.slug}/shows`);
            if (res.ok) {
                const data = await res.json();
                setShows(data.shows || []);
            }
        } catch (e) {
            console.error('shows refresh error', e);
        }
    }, [selectedTabId, tabs]);

    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => { refreshShows(); }, [refreshShows]);

    const flash = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    // ----- Migration actions -----

    const snapshotLegacyAsArchive = async () => {
        if (!confirm(
            'This will snapshot the current live CrateVote session into an archived show under the main tab. ' +
            'The live session will continue running. Proceed?'
        )) return;
        setBusy(true);
        try {
            const res = await fetch('/api/admin/shows', {
                method: 'POST',
                headers,
                body: JSON.stringify({ action: 'endLegacy', title: prompt('Title for the archived show?', 'CrateVote Show') || undefined }),
            });
            const data = await res.json();
            if (res.ok) {
                flash('success', `Archived as show ${data.showId}.`);
                refresh();
                refreshShows();
            } else {
                flash('error', data.error || 'Snapshot failed.');
            }
        } finally {
            setBusy(false);
        }
    };

    const cleanupDuplicates = async () => {
        if (!confirm('Purge orphan bootstrap shows from the main tab? Keeps the current active show.')) return;
        setBusy(true);
        try {
            const res = await fetch('/api/admin/shows', {
                method: 'POST',
                headers,
                body: JSON.stringify({ action: 'cleanupDuplicates' }),
            });
            const data = await res.json();
            if (res.ok) {
                flash('success', `Purged ${data.purged} duplicate(s). Kept ${data.keptShowId || 'none'}.`);
                refresh();
                refreshShows();
            } else {
                flash('error', data.error || 'Cleanup failed.');
            }
        } finally {
            setBusy(false);
        }
    };

    // ----- Tab actions -----

    const createTab = async () => {
        const name = prompt('Tab name (e.g., "Reggaeton")');
        if (!name) return;
        const slug = prompt('Tab slug (URL, e.g., "reggaeton")', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40));
        if (!slug) return;
        const description = prompt('Short description (optional)') || undefined;
        const themeColor = prompt('Theme accent color in hex (optional, e.g., #00ff99)') || undefined;

        setBusy(true);
        try {
            const res = await fetch('/api/admin/tabs', {
                method: 'POST',
                headers,
                body: JSON.stringify({ slug, name, description, themeColor }),
            });
            const data = await res.json();
            if (res.ok) {
                flash('success', `Created tab "${name}".`);
                refresh();
            } else {
                flash('error', data.error || 'Failed to create tab.');
            }
        } finally {
            setBusy(false);
        }
    };

    const deleteTab = async (tab: Tab) => {
        if (tab.isMainTab) return;
        if (!confirm(`Delete tab "${tab.name}"? Shows under this tab will need to be purged separately.`)) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/admin/tabs?id=${tab.id}`, {
                method: 'DELETE',
                headers,
            });
            const data = await res.json();
            if (res.ok) {
                flash('success', `Deleted tab "${tab.name}".`);
                if (selectedTabId === tab.id) setSelectedTabId(null);
                refresh();
            } else {
                flash('error', data.error || 'Delete failed.');
            }
        } finally {
            setBusy(false);
        }
    };

    // ----- Show actions -----

    const createShow = async (autoActivate: boolean) => {
        if (!selectedTabId) return;
        const title = prompt('Show title (optional)') || undefined;
        const description = prompt('Show description (optional)') || undefined;
        const archivePrev = autoActivate && confirm('Archive the current active show in this tab first?');

        setBusy(true);
        try {
            const res = await fetch('/api/admin/shows', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    action: 'create',
                    tabId: selectedTabId,
                    title,
                    description,
                    autoActivate,
                    archivePrevious: archivePrev,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                flash('success', `Created show ${data.show?.showNumber}.`);
                refresh();
                refreshShows();
            } else {
                flash('error', data.error || 'Create show failed.');
            }
        } finally {
            setBusy(false);
        }
    };

    const showAction = async (action: 'archive' | 'activate' | 'purge', show: Show) => {
        if (action === 'purge' && !confirm(`Permanently delete all data for show "${show.title}"?`)) return;
        setBusy(true);
        try {
            const res = await fetch('/api/admin/shows', {
                method: 'POST',
                headers,
                body: JSON.stringify({ action, showId: show.id }),
            });
            const data = await res.json();
            if (res.ok) {
                flash('success', `${action} succeeded.`);
                refresh();
                refreshShows();
            } else {
                flash('error', data.error || `${action} failed.`);
            }
        } finally {
            setBusy(false);
        }
    };

    const selectedTab = tabs.find((t) => t.id === selectedTabId) || null;

    return (
        <div className="admin-root">
            <header className="admin-header">
                <div>
                    <h1>CrateVote Admin</h1>
                    <p className="admin-sub">Manage tabs, shows, and the historical archive.</p>
                </div>
                <div className="admin-header-actions">
                    <Link href="/" className="admin-link">View Main Show</Link>
                    <Link href="/tabs" className="admin-link">Browse Tabs</Link>
                </div>
            </header>

            {message && (
                <div className={`admin-flash admin-flash-${message.type}`}>{message.text}</div>
            )}

            <section className="admin-section">
                <h2>Migration & Bootstrap</h2>
                <div className="admin-card">
                    {migrationStatus ? (
                        <ul className="admin-status-list">
                            <li>Main tab exists: {migrationStatus.mainTabExists ? '✓' : '✗'}</li>
                            <li>Main tab current show: {migrationStatus.mainTabHasCurrentShow ? '✓' : '✗'}</li>
                            <li>Main tab total shows: {migrationStatus.mainTabShowCount}</li>
                        </ul>
                    ) : (
                        <p>Loading status…</p>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            onClick={snapshotLegacyAsArchive}
                            disabled={busy}
                            className="admin-btn admin-btn-primary"
                        >
                            Snapshot legacy session → archived show
                        </button>
                        <button
                            onClick={cleanupDuplicates}
                            disabled={busy}
                            className="admin-btn"
                        >
                            Clean up duplicate bootstrap shows
                        </button>
                    </div>
                    <p className="admin-help">
                        Captures the current /api/songs (legacy) playlist into a new archived
                        Show under the main tab. The live session keeps running — use the legacy
                        admin reset separately if you also want to start a fresh round. Use
                        cleanup to remove orphan bootstrap shows that may have been created
                        by concurrent build workers during the first deploy.
                    </p>
                </div>
            </section>

            <section className="admin-section">
                <div className="admin-section-header">
                    <h2>Tabs</h2>
                    <button onClick={createTab} disabled={busy} className="admin-btn">+ New Tab</button>
                </div>

                <div className="admin-tabs-grid">
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={`admin-tab-card ${selectedTabId === tab.id ? 'selected' : ''}`}
                            onClick={() => setSelectedTabId(tab.id)}
                        >
                            <div className="admin-tab-card-head">
                                <h3>{tab.name}</h3>
                                {tab.isMainTab && <span className="admin-pill">MAIN</span>}
                            </div>
                            <div className="admin-tab-meta">/{tab.slug}</div>
                            {tab.description && <p className="admin-tab-desc">{tab.description}</p>}
                            {!tab.isMainTab && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteTab(tab);
                                    }}
                                    className="admin-btn admin-btn-danger admin-btn-sm"
                                    disabled={busy}
                                >
                                    Delete
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {selectedTab && (
                <section className="admin-section">
                    <div className="admin-section-header">
                        <h2>Shows in &ldquo;{selectedTab.name}&rdquo;</h2>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => createShow(false)} disabled={busy} className="admin-btn">
                                + New Draft
                            </button>
                            <button onClick={() => createShow(true)} disabled={busy} className="admin-btn admin-btn-primary">
                                + Start New Show
                            </button>
                        </div>
                    </div>

                    {shows.length === 0 ? (
                        <div className="admin-card">No shows yet for this tab.</div>
                    ) : (
                        <div className="admin-shows-list">
                            {shows.map((show) => (
                                <div key={show.id} className="admin-show-row">
                                    <div className="admin-show-num">#{show.showNumber}</div>
                                    <div className="admin-show-body">
                                        <div className="admin-show-title">{show.title}</div>
                                        <div className="admin-show-meta">
                                            <span className={`admin-status admin-status-${show.status}`}>
                                                {show.status.toUpperCase()}
                                            </span>
                                            <span>created {new Date(show.createdAt).toLocaleString()}</span>
                                            {show.archivedAt && (
                                                <span>archived {new Date(show.archivedAt).toLocaleString()}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="admin-show-actions">
                                        <Link
                                            href={`/tab/${selectedTab.slug}/show/${show.id}`}
                                            className="admin-btn admin-btn-sm"
                                        >
                                            View
                                        </Link>
                                        {show.status !== 'active' && (
                                            <button
                                                onClick={() => showAction('activate', show)}
                                                disabled={busy}
                                                className="admin-btn admin-btn-sm"
                                            >
                                                Activate
                                            </button>
                                        )}
                                        {show.status !== 'archived' && (
                                            <button
                                                onClick={() => showAction('archive', show)}
                                                disabled={busy}
                                                className="admin-btn admin-btn-sm"
                                            >
                                                Archive
                                            </button>
                                        )}
                                        <button
                                            onClick={() => showAction('purge', show)}
                                            disabled={busy}
                                            className="admin-btn admin-btn-danger admin-btn-sm"
                                        >
                                            Purge
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
