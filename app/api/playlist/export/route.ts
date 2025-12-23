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
        let user;
        try {
            user = await getCurrentUser(accessToken);
        } catch (userError) {
            console.error('Failed to get Spotify user:', userError);
            return NextResponse.json({ error: 'Spotify session expired. Please sign out and sign in again.' }, { status: 401 });
        }

        // Get playlist data
        const songs = await getSortedSongs();

        if (songs.length === 0) {
            return NextResponse.json({ error: 'No songs in the playlist to export.' }, { status: 400 });
        }

        // Filter: Only export songs with positive score (score > 0)
        // If all songs have score 0, export all songs instead
        let validSongs = songs.filter(s => s.score > 0);
        if (validSongs.length === 0) {
            // No songs have positive score - export all songs
            validSongs = songs;
            console.log('No positive scores - exporting all songs');
        }

        // Filter to only valid Spotify URIs
        const songsWithValidUri = validSongs.filter(s =>
            s.spotifyUri && s.spotifyUri.startsWith('spotify:track:')
        );

        if (songsWithValidUri.length === 0) {
            const hasItunesUris = validSongs.some(s => s.spotifyUri?.startsWith('itunes:'));
            if (hasItunesUris) {
                return NextResponse.json({
                    error: 'These songs were added with an older version. Please wipe the playlist and add fresh songs to export.'
                }, { status: 400 });
            }
            return NextResponse.json({ error: 'No valid Spotify tracks to export.' }, { status: 400 });
        }

        const trackUris = songsWithValidUri.map((s) => s.spotifyUri);

        console.log(`Exporting ${trackUris.length} tracks to Spotify for user ${user.id}`);

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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({
            error: `Export failed: ${errorMessage}. Try signing out and back in.`
        }, { status: 500 });
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
