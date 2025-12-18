import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSortedSongs } from '@/lib/redis-store';
import { createPlaylist, getCurrentUser } from '@/lib/spotify';

// POST - Export playlist to Spotify
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    // @ts-expect-error - custom session type
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Not authenticated with Spotify' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { name, description } = body;

        // @ts-expect-error - custom session type
        const accessToken = session.accessToken as string;

        // Get user ID
        const user = await getCurrentUser(accessToken);

        // Get playlist data
        const songs = await getSortedSongs();
        const exportData = songs.map(s => ({
            id: s.id,
            spotifyUri: s.spotifyUri,
            name: s.name,
            artist: s.artist,
            albumArt: s.albumArt,
            score: s.score,
        }));

        if (exportData.length === 0) {
            return NextResponse.json({ error: 'No songs to export' }, { status: 400 });
        }

        // Create playlist
        const trackUris = exportData.map((s) => s.spotifyUri);
        const result = await createPlaylist(
            accessToken,
            user.id,
            name || `Hackathon - ${new Date().toLocaleDateString()}`,
            description || 'Created with Hackathon',
            trackUris
        );

        return NextResponse.json({
            success: true,
            playlistUrl: result.playlistUrl,
            playlistId: result.playlistId,
            trackCount: trackUris.length,
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ error: 'Failed to export playlist' }, { status: 500 });
    }
}

// GET - Get export data for integrations
export async function GET() {
    const songs = await getSortedSongs();
    const exportData = songs.map(s => ({
        id: s.id,
        spotifyUri: s.spotifyUri,
        name: s.name,
        artist: s.artist,
        albumArt: s.albumArt,
        score: s.score,
    }));

    return NextResponse.json({
        tracks: exportData,
        exportedAt: new Date().toISOString(),
    });
}
