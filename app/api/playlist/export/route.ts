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
            return NextResponse.json({ error: 'No qualified songs (score > 0) to export' }, { status: 400 });
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

// GET - Get export data (JSON for preview, CSV for download)
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    const songs = await getSortedSongs();

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
                'Content-Disposition': `attachment; filename="crate-hackers-playlist-${new Date().toISOString().split('T')[0]}.csv"`,
            },
        });
    }

    // JSON format for preview page
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
        exportedAt: new Date().toISOString(),
    });
}
