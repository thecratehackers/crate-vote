'use client';

import { useEffect } from 'react';

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
    useEffect(() => {
        // Log the error to console in development
        console.error('Application error:', error);
    }, [error]);

    return (
        <div className="error-page">
            <div className="error-card">
                <div className="error-icon">⚠️</div>
                <h1>Something went wrong</h1>
                <p className="error-message">
                    Don't worry, your data is safe. Try refreshing the page.
                </p>
                <div className="error-actions">
                    <button onClick={reset} className="retry-btn">
                        Try Again
                    </button>
                    <button onClick={() => window.location.href = '/'} className="home-btn">
                        Go Home
                    </button>
                </div>
                {process.env.NODE_ENV === 'development' && (
                    <details className="error-details">
                        <summary>Technical Details</summary>
                        <pre>{error.message}</pre>
                        {error.digest && <p>Error ID: {error.digest}</p>}
                    </details>
                )}
            </div>

            <style jsx>{`
                .error-page {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    background: var(--bg-primary, #0a0a0a);
                }
                .error-card {
                    background: var(--bg-secondary, #141414);
                    border: 1px solid var(--border-color, rgba(211, 119, 29, 0.2));
                    border-radius: 20px;
                    padding: 48px 40px;
                    text-align: center;
                    max-width: 450px;
                    width: 100%;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                }
                .error-icon {
                    font-size: 4rem;
                    margin-bottom: 16px;
                }
                h1 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    margin: 0 0 12px;
                    color: var(--text-primary, #fff);
                }
                .error-message {
                    color: var(--text-secondary, #a0a0a0);
                    font-size: 1rem;
                    margin-bottom: 28px;
                    line-height: 1.5;
                }
                .error-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                .retry-btn, .home-btn {
                    padding: 12px 24px;
                    border-radius: 50px;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }
                .retry-btn {
                    background: linear-gradient(135deg, #d3771d 0%, #e09f24 100%);
                    color: white;
                }
                .retry-btn:hover {
                    transform: scale(1.02);
                    box-shadow: 0 4px 16px rgba(211, 119, 29, 0.4);
                }
                .home-btn {
                    background: var(--bg-tertiary, #1a1a1a);
                    color: var(--text-primary, #fff);
                    border: 1px solid var(--border-color, rgba(211, 119, 29, 0.2));
                }
                .home-btn:hover {
                    border-color: var(--orange-primary, #d3771d);
                }
                .error-details {
                    margin-top: 24px;
                    text-align: left;
                    font-size: 0.85rem;
                    color: var(--text-muted, #666);
                }
                .error-details summary {
                    cursor: pointer;
                    margin-bottom: 8px;
                }
                .error-details pre {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 12px;
                    border-radius: 8px;
                    overflow-x: auto;
                    font-size: 0.8rem;
                }
            `}</style>
        </div>
    );
}
