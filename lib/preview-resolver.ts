import { searchTracks } from './itunes';

export interface PreviewLookupResult {
    previewUrl: string | null;
    source: 'existing' | 'itunes' | 'none';
    matchedArtist?: string;
    matchedTrack?: string;
}

function isPlayablePreviewUrl(url: string | null | undefined): url is string {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export async function resolvePreviewUrl({
    artist,
    songName,
    existingPreviewUrl,
}: {
    artist: string;
    songName?: string | null;
    existingPreviewUrl?: string | null;
}): Promise<PreviewLookupResult> {
    if (isPlayablePreviewUrl(existingPreviewUrl)) {
        return { previewUrl: existingPreviewUrl, source: 'existing' };
    }

    const artistName = artist.trim();
    if (!artistName) {
        return { previewUrl: null, source: 'none' };
    }

    const query = songName?.trim()
        ? `${artistName} ${songName.trim()}`
        : artistName;

    const results = await searchTracks(query, 5);
    const hit = results.find(result => isPlayablePreviewUrl(result.previewUrl));

    if (!hit?.previewUrl) {
        return { previewUrl: null, source: 'none' };
    }

    return {
        previewUrl: hit.previewUrl,
        source: 'itunes',
        matchedArtist: hit.artist,
        matchedTrack: hit.name,
    };
}
