import { NextAuthOptions } from 'next-auth';
import SpotifyProvider from 'next-auth/providers/spotify';

const scopes = [
    'playlist-modify-public',
    'playlist-modify-private',
    'user-read-email',
].join(' ');

async function refreshAccessToken(token: any) {
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(
                    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
                ).toString('base64')}`,
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: token.refreshToken,
            }),
        });

        const refreshedTokens = await response.json();

        if (!response.ok) {
            throw refreshedTokens;
        }

        return {
            ...token,
            accessToken: refreshedTokens.access_token,
            expiresAt: Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,
            refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
        };
    } catch (error) {
        console.error('Error refreshing access token:', error);
        return {
            ...token,
            error: 'RefreshAccessTokenError',
        };
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        SpotifyProvider({
            clientId: process.env.SPOTIFY_CLIENT_ID!,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
            authorization: {
                params: { scope: scopes, show_dialog: true },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account, profile }) {
            // Initial sign in
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.expiresAt = account.expires_at;
            }
            // Store Spotify user ID from profile
            if (profile) {
                // @ts-expect-error - Spotify profile has id
                token.spotifyId = profile.id;
            }

            // Return previous token if the access token has not expired yet
            // Check if token expires in less than 5 minutes (300 seconds buffer)
            if (token.expiresAt && Date.now() / 1000 < (token.expiresAt as number) - 300) {
                return token;
            }

            // Access token has expired or is about to expire, refresh it
            if (token.refreshToken) {
                return refreshAccessToken(token);
            }

            return token;
        },
        async session({ session, token }) {
            // @ts-expect-error - extending session type
            session.accessToken = token.accessToken;
            // @ts-expect-error - extending session type
            session.error = token.error;
            // Add Spotify user ID to session.user
            if (session.user) {
                // @ts-expect-error - extending user type
                session.user.id = token.spotifyId || token.sub;
            }
            return session;
        },
    },
    pages: {
        signIn: '/export',  // Redirect to export page for login
    },
};
