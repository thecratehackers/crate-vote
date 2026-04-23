import Link from 'next/link';
import { listTabs } from '@/lib/stores/tab-store';
import { getCurrentShowForTab } from '@/lib/stores/show-store';
import { ensureMainTabHasShow } from '@/lib/migration/legacy-to-multi-tab';
import './tabs.css';

// Tab discovery page - lists all public tabs (main + community)
export default async function TabsBrowsePage() {
    await ensureMainTabHasShow();
    const tabs = await listTabs();

    const enriched = await Promise.all(
        tabs.map(async (t) => ({
            tab: t,
            currentShow: await getCurrentShowForTab(t.id),
        }))
    );

    return (
        <div className="tabs-browse-root">
            <header className="tabs-browse-header">
                <h1>CrateVote Tabs</h1>
                <p>The main show plus every community-curated voting space.</p>
            </header>

            <div className="tabs-browse-grid">
                {enriched.map(({ tab, currentShow }) => (
                    <Link
                        key={tab.id}
                        href={tab.isMainTab ? '/' : `/tab/${tab.slug}`}
                        className={`tab-card ${tab.isMainTab ? 'tab-card-main' : ''}`}
                        style={
                            tab.themeColor
                                ? ({ '--tab-accent': tab.themeColor } as React.CSSProperties)
                                : undefined
                        }
                    >
                        <div className="tab-card-header">
                            <h2>{tab.name}</h2>
                            {tab.isMainTab && <span className="tab-badge">MAIN</span>}
                        </div>
                        {tab.description && <p className="tab-card-desc">{tab.description}</p>}
                        <div className="tab-card-footer">
                            {currentShow ? (
                                <span className="tab-card-show">
                                    LIVE · {currentShow.title}
                                </span>
                            ) : (
                                <span className="tab-card-show tab-card-show-quiet">
                                    No active show
                                </span>
                            )}
                            <span className="tab-card-arrow">→</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
