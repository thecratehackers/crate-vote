import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSortedSongs, getPlaylistTitle } from '@/lib/redis-store';
import { createPlaylist, getCurrentUser } from '@/lib/spotify';

// POST - Export playlist to Spotify
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);

    // @ts-expect-error - custom session type
    if (!session?.accessToken) {
        return NextResponse.json({ error: 'Please sign in with Spotify first to export playlists. Click the "Sign in" button above.' }, { status: 401 });
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

        // Filter: Only export songs with positive score
        const validSongs = songs.filter(s => s.score > 0);

        const exportData = validSongs.map(s => ({
            id: s.id,
            spotifyUri: s.spotifyUri,
            name: s.name,
            artist: s.artist,
            albumArt: s.albumArt,
            score: s.score,
        }));

        if (exportData.length === 0) {
            return NextResponse.json({ error: 'No songs with positive scores to export. Songs need upvotes before they can be saved to Spotify.' }, { status: 400 });
        }

        // Create playlist - use the provided name (already cleaned by client)
        const trackUris = exportData.map((s) => s.spotifyUri);
        const result = await createPlaylist(
            accessToken,
            user.id,
            name || 'Hackathon Playlist',
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
        return NextResponse.json({ error: 'Could not export to Spotify. Please try signing in again.' }, { status: 500 });
    }
}

// GET - Get export data (JSON for preview, CSV for download)
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    const [songs, playlistTitle] = await Promise.all([
        getSortedSongs(),
        getPlaylistTitle(),
    ]);

    // Filter: Only export songs with positive score
    const validSongs = songs.filter(s => s.score > 0);

    // CSV format for download
    if (format === 'csv') {
        const header = 'Track Name,Artist,Score,Spotify URI,Added By\n';
        const rows = validSongs.map(s => {
            const name = s.name.replace(/"/g, '""');
            const artist = s.artist.replace(/"/g, '""');
            const addedBy = s.addedByName.replace(/"/g, '""');
            return `"${name}","${artist}",${s.score},"${s.spotifyUri}","${addedBy}"`;
        }).join('\n');

        return new NextResponse(header + rows, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${playlistTitle}-${new Date().toISOString().split('T')[0]}.csv"`,
            },
        });
    }

    // JSON format for preview page - includes playlist title
    const exportData = validSongs.map(s => ({
        id: s.id,
        spotifyUri: s.spotifyUri,
        name: s.name,
        artist: s.artist,
        albumArt: s.albumArt,
        score: s.score,
    }));

    return NextResponse.json({
        tracks: exportData,
        playlistTitle,
        exportedAt: new Date().toISOString(),
    });
}
