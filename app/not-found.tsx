import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="notfound-page">
            <div className="notfound-card">
                <div className="notfound-icon">💿</div>
                <h1>404 - Page Not Found</h1>
                <p className="notfound-message">
                    Looks like this track got lost in the shuffle.
                </p>
                <Link href="/" className="home-link">
                    <span className="link-icon">🎵</span>
                    <span>Back to the Playlist</span>
                </Link>
            </div>

            <style>{`
                .notfound-page {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    background: var(--bg-primary, #0a0a0a);
                }
                .notfound-card {
                    background: var(--bg-secondary, #141414);
                    border: 1px solid var(--border-color, rgba(211, 119, 29, 0.2));
                    border-radius: 20px;
                    padding: 48px 40px;
                    text-align: center;
                    max-width: 400px;
                    width: 100%;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                }
                .notfound-icon {
                    font-size: 4rem;
                    margin-bottom: 16px;
                    opacity: 0.7;
                }
                .notfound-card h1 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin: 0 0 12px;
                    color: var(--text-primary, #fff);
                }
                .notfound-message {
                    color: var(--text-secondary, #a0a0a0);
                    font-size: 1rem;
                    margin-bottom: 28px;
                    line-height: 1.5;
                }
                .home-link {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    padding: 14px 28px;
                    background: linear-gradient(135deg, #d3771d 0%, #e0a030 100%);
                    border: none;
                    color: #000;
                    text-decoration: none;
                    border-radius: 50px;
                    font-weight: 700;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(211, 119, 29, 0.4);
                }
                .home-link:hover {
                    transform: translateY(-2px) scale(1.02);
                    box-shadow: 0 8px 30px rgba(211, 119, 29, 0.5);
                    background: linear-gradient(135deg, #e0a030 0%, #d3771d 100%);
                }
                .home-link .link-icon {
                    font-size: 1.2rem;
                }
            `}</style>
        </div>
    );
}
