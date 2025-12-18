import { NextAuthOptions } from 'next-auth';
import SpotifyProvider from 'next-auth/providers/spotify';

const scopes = [
    'playlist-modify-public',
    'playlist-modify-private',
    'user-read-email',
].join(' ');

export const authOptions: NextAuthOptions = {
    providers: [
        SpotifyProvider({
            clientId: process.env.SPOTIFY_CLIENT_ID!,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
            authorization: {
                params: { scope: scopes },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account, profile }) {
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
            return token;
        },
        async session({ session, token }) {
            // @ts-expect-error - extending session type
            session.accessToken = token.accessToken;
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
