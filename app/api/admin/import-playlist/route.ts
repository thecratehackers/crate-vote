import { NextResponse } from 'next/server';
import { getPlaylistTracks } from '@/lib/spotify';
import { adminAddSong, setPlaylistTitle } from '@/lib/redis-store';

// POST - Import a Spotify playlist
export async function POST(request: Request) {
    const adminKey = request.headers.get('x-admin-key');

    if (adminKey !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { playlistUrl } = await request.json();

        if (!playlistUrl) {
            return NextResponse.json({ error: 'Playlist URL required' }, { status: 400 });
        }

        // Fetch tracks from Spotify (max 100)
        const { playlistName, tracks } = await getPlaylistTracks(playlistUrl, 100);

        // Add each track as a song - skip duplicates
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const track of tracks) {
            const songData = {
                id: track.id,
                spotifyUri: track.spotifyUri,
                name: track.name,
                artist: track.artist,
                album: track.album,
                albumArt: track.albumArt,
                previewUrl: track.previewUrl,
                addedBy: 'admin-import',
                addedByName: 'Imported',
                popularity: track.popularity,
                bpm: track.bpm,
                energy: track.energy,
                valence: track.valence,
                danceability: track.danceability,
            };

            const result = await adminAddSong(songData);

            if (result.success) {
                imported++;
            } else if (result.error?.includes('already in playlist')) {
                skipped++;
            } else {
                errors.push(`${track.name}: ${result.error}`);
            }
        }

        // Set the playlist title to the imported playlist name
        if (imported > 0) {
            await setPlaylistTitle(playlistName);
        }

        return NextResponse.json({
            success: true,
            playlistName,
            imported,
            skipped,
            total: tracks.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('Import playlist error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to import playlist' },
            { status: 500 }
        );
    }
}
