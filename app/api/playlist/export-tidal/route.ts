import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSortedSongs, getPlaylistTitle } from '@/lib/redis-store';
import {
    getTidalClientToken,
    getSpotifyISRCs,
    batchResolveTidalTracks,
    searchTidalTrack,
    createTidalPlaylist,
} from '@/lib/tidal';

// POST /api/playlist/export-tidal — Export playlist to TIDAL
export async function POST(request: Request) {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('tidal_access_token')?.value;

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Please connect your TIDAL account first.' },
            { status: 401 }
        );
    }

    try {
        const body = await request.json();
        const { name, description } = body;

        // Get sorted playlist from Redis
        const songs = await getSortedSongs();

        if (songs.length === 0) {
            return NextResponse.json(
                { error: 'No songs in the playlist to export.' },
                { status: 400 }
            );
        }

        // Cap at 100 songs
        const validSongs = songs.slice(0, 100);

        // Filter to songs with Spotify URIs (we need these for ISRC lookup)
        const songsWithSpotifyUri = validSongs.filter(
            s => s.spotifyUri && s.spotifyUri.startsWith('spotify:track:')
        );

        if (songsWithSpotifyUri.length === 0) {
            return NextResponse.json(
                { error: 'No valid tracks to export. Songs need Spotify metadata for cross-platform transfer.' },
                { status: 400 }
            );
        }

        console.log(`🎵 TIDAL Export: Starting for ${songsWithSpotifyUri.length} tracks`);

        // Step 1: Get Spotify Client Token for ISRC lookup
        const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
        const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

        if (!spotifyClientId || !spotifyClientSecret) {
            return NextResponse.json(
                { error: 'Spotify credentials not configured for ISRC resolution.' },
                { status: 500 }
            );
        }

        // Get a fresh Spotify client token
        const spotifyTokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${spotifyClientId}:${spotifyClientSecret}`).toString('base64')}`,
            },
            body: 'grant_type=client_credentials',
            cache: 'no-store',
        });

        if (!spotifyTokenResponse.ok) {
            throw new Error('Failed to get Spotify token for ISRC lookup');
        }

        const spotifyTokenData = await spotifyTokenResponse.json();
        const spotifyToken = spotifyTokenData.access_token;

        // Step 2: Resolve Spotify track IDs → ISRCs
        const spotifyTrackIds = songsWithSpotifyUri.map(s => {
            // Extract ID from spotify:track:ABC123
            return s.spotifyUri.replace('spotify:track:', '');
        });

        const isrcMap = await getSpotifyISRCs(spotifyToken, spotifyTrackIds);
        console.log(`🎵 TIDAL Export: Got ${isrcMap.size} ISRCs from ${spotifyTrackIds.length} Spotify tracks`);
        if (isrcMap.size === 0) {
            console.warn('🎵 TIDAL Export: No ISRCs resolved — Spotify token may be invalid or tracks may not have ISRCs');
        }

        // Step 3: Get TIDAL client token for catalog lookups
        const tidalCatalogToken = await getTidalClientToken();

        // Step 4: Resolve ISRCs → TIDAL track IDs
        const isrcs = Array.from(isrcMap.values());
        const tidalTrackMap = await batchResolveTidalTracks(tidalCatalogToken, isrcs);
        console.log(`🎵 TIDAL Export: ISRC batch matched ${tidalTrackMap.size}/${isrcs.length} tracks`);

        // Step 5: For tracks that didn't match by ISRC, try name-based search
        const resolvedTidalIds: string[] = [];
        const missingTracks: { name: string; artist: string }[] = [];

        for (const song of songsWithSpotifyUri) {
            const spotifyId = song.spotifyUri.replace('spotify:track:', '');
            const isrc = isrcMap.get(spotifyId);

            if (isrc) {
                const tidalId = tidalTrackMap.get(isrc);
                if (tidalId) {
                    resolvedTidalIds.push(tidalId);
                    continue;
                }
            }

            // Fallback: search by name
            const searchQuery = `${song.artist} ${song.name}`;
            const fallbackId = await searchTidalTrack(tidalCatalogToken, searchQuery);
            if (fallbackId) {
                resolvedTidalIds.push(fallbackId);
            } else {
                missingTracks.push({ name: song.name, artist: song.artist });
            }
        }

        if (resolvedTidalIds.length === 0) {
            return NextResponse.json(
                { error: 'Could not find any matching tracks on TIDAL.' },
                { status: 400 }
            );
        }

        console.log(`🎵 TIDAL Export: Resolved ${resolvedTidalIds.length}/${songsWithSpotifyUri.length} tracks`);

        // Step 6: Create the TIDAL playlist using the user's auth token
        const result = await createTidalPlaylist(
            accessToken,
            name || 'Crate Hackers Playlist',
            description || `Collaborative playlist from Crate Hackers. ${resolvedTidalIds.length} crowd-approved songs 🎧`,
            resolvedTidalIds
        );

        return NextResponse.json({
            success: true,
            playlistUrl: result.playlistUrl,
            playlistId: result.playlistId,
            trackCount: resolvedTidalIds.length,
            totalAttempted: songsWithSpotifyUri.length,
            missingTracks: missingTracks.length > 0 ? missingTracks : undefined,
        });
    } catch (error) {
        console.error('TIDAL export error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `TIDAL export failed: ${errorMessage}` },
            { status: 500 }
        );
    }
}
