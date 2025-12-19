'use client';

import './Skeleton.css';

interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
}

export function Skeleton({ className = '', width, height, borderRadius }: SkeletonProps) {
    const style: React.CSSProperties = {};
    if (width) style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) style.height = typeof height === 'number' ? `${height}px` : height;
    if (borderRadius) style.borderRadius = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius;

    return <div className={`skeleton ${className}`} style={style} />;
}

// Song card skeleton - matches the layout of actual song cards
export function SongCardSkeleton() {
    return (
        <div className="song-card-skeleton">
            <Skeleton className="rank" width={32} height={20} />
            <Skeleton className="album-art" width={44} height={44} borderRadius={6} />
            <div className="info">
                <Skeleton width="70%" height={14} />
                <Skeleton width="50%" height={12} />
            </div>
            <div className="votes">
                <Skeleton width={32} height={26} borderRadius={4} />
                <Skeleton width={28} height={16} />
                <Skeleton width={32} height={26} borderRadius={4} />
            </div>
        </div>
    );
}

// Playlist skeleton - shows multiple song card skeletons
export function PlaylistSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div className="playlist-skeleton">
            {Array.from({ length: count }).map((_, i) => (
                <SongCardSkeleton key={i} />
            ))}
        </div>
    );
}

// Header stats skeleton
export function HeaderStatsSkeleton() {
    return (
        <div className="header-stats-skeleton">
            <Skeleton width={50} height={24} borderRadius={12} />
            <Skeleton width={50} height={24} borderRadius={12} />
            <Skeleton width={50} height={24} borderRadius={12} />
        </div>
    );
}

// Search result skeleton
export function SearchResultSkeleton() {
    return (
        <div className="search-result-skeleton">
            <Skeleton width={48} height={48} borderRadius={6} />
            <div className="info">
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={12} />
            </div>
            <Skeleton width={60} height={32} borderRadius={6} />
        </div>
    );
}
