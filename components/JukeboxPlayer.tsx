'use client';

// JukeboxPlayer was deleted from the repo (see git status). This is a
// no-op stub that preserves the import contract in app/page.tsx so the
// build succeeds. The full jukebox experience can be restored later by
// reinstating the original implementation.

import { useEffect } from 'react';

interface JukeboxPlayerProps {
    currentSong: unknown;
    videoId: string;
    playlist: unknown[];
    onClose: () => void;
    onNextSong: (nextSongId: string) => void | Promise<void>;
    onVote: (songId: string, delta: number) => void;
    onKarmaEarned?: (amount: number) => void;
    visitorId?: string;
    streamMode?: boolean;
    liveActivity?: unknown;
    playlistTitle?: string;
}

export default function JukeboxPlayer({ onClose }: JukeboxPlayerProps) {
    useEffect(() => {
        // Auto-dismiss because the component is currently a stub
        onClose();
    }, [onClose]);

    return null;
}
