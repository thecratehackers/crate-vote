import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { Providers } from './providers';
import { APP_CONFIG } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
    title: `${APP_CONFIG.name} - ${APP_CONFIG.tagline}`,
    description: APP_CONFIG.description,
    keywords: APP_CONFIG.keywords,
    icons: {
        icon: '/favicon.png',
        apple: '/favicon.png',
    },
    openGraph: {
        title: APP_CONFIG.name,
        description: APP_CONFIG.description,
        type: 'website',
    },
    twitter: {
        card: 'summary',
        title: APP_CONFIG.name,
        description: APP_CONFIG.description,
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&display=swap"
                />
            </head>
            <body>
                <Providers>
                    {children}
                </Providers>
                <Analytics />
            </body>
        </html>
    );
}
