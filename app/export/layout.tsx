'use client';

import { SessionProvider } from 'next-auth/react';
import { Suspense } from 'react';

export default function ExportLayout({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <Suspense fallback={
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                </div>
            }>
                {children}
            </Suspense>
        </SessionProvider>
    );
}
