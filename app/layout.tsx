import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Hackathon - Collaborative Playlist Voting',
    description: 'Vote on songs and build the ultimate playlist together',
    keywords: ['playlist', 'voting', 'spotify', 'music', 'collaborative', 'hackathon'],
    icons: {
        icon: '/favicon.png',
        apple: '/favicon.png',
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
            </head>
            <body>{children}</body>
        </html>
    );
}
