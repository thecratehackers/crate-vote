'use client';

import { useState, useEffect, useRef } from 'react';
import './VideoPreview.css';

interface VideoPreviewProps {
    videoId: string;
    songName: string;
    artistName: string;
    anchorRect: DOMRect;
    onClose: () => void;
}

export default function VideoPreview({
    videoId,
    songName,
    artistName,
    anchorRect,
    onClose,
}: VideoPreviewProps) {
    const [isMuted, setIsMuted] = useState(true);
    const [isLoaded, setIsLoaded] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    // Position popup near the album art
    const getPosition = () => {
        if (!anchorRect) return { top: 0, left: 0 };

        const popupWidth = 320;
        const popupHeight = 240;
        const padding = 12;

        // Try to position to the right of the album art
        let left = anchorRect.right + padding;
        let top = anchorRect.top;

        // If it would go off the right edge, position to the left
        if (left + popupWidth > window.innerWidth - padding) {
            left = anchorRect.left - popupWidth - padding;
        }

        // If it would go off the left edge, center it below
        if (left < padding) {
            left = Math.max(padding, (window.innerWidth - popupWidth) / 2);
            top = anchorRect.bottom + padding;
        }

        // Ensure it doesn't go off the bottom
        if (top + popupHeight > window.innerHeight - padding) {
            top = window.innerHeight - popupHeight - padding;
        }

        // Ensure it doesn't go off the top
        top = Math.max(padding, top);

        return { top, left };
    };

    const position = getPosition();

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        // Delay adding listener to prevent immediate close
        const timeout = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [onClose]);

    // Build YouTube embed URL with appropriate parameters
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&modestbranding=1&rel=0&showinfo=0`;

    return (
        <div
            ref={popupRef}
            className="video-preview-popup"
            style={{
                top: position.top,
                left: position.left,
            }}
            role="dialog"
            aria-label={`Music video preview for ${songName} by ${artistName}`}
        >
            {/* Header */}
            <div className="video-preview-header">
                <div className="video-preview-title">
                    <span className="song-name">{songName}</span>
                    <span className="artist-name">{artistName}</span>
                </div>
                <button
                    className="close-btn"
                    onClick={onClose}
                    aria-label="Close video preview"
                >
                    ×
                </button>
            </div>

            {/* Video Container */}
            <div className="video-container">
                {!isLoaded && (
                    <div className="video-loading">
                        <div className="spinner" />
                        <span>Loading video...</span>
                    </div>
                )}
                <iframe
                    src={embedUrl}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onLoad={() => setIsLoaded(true)}
                    title={`${songName} music video`}
                />
            </div>

            {/* Controls */}
            <div className="video-preview-controls">
                <button
                    className={`mute-btn ${isMuted ? 'muted' : 'unmuted'}`}
                    onClick={() => setIsMuted(!isMuted)}
                    aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                >
                    {isMuted ? '🔇 Tap to unmute' : '🔊 Playing'}
                </button>
                <a
                    href={`https://www.youtube.com/watch?v=${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="youtube-link"
                >
                    Open in YouTube ↗
                </a>
            </div>
        </div>
    );
}
