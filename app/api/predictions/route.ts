import { NextResponse } from 'next/server';
import {
    makePrediction,
    getUserPrediction,
    arePredictionsLocked,
    lockPredictions,
    unlockPredictions,
    getPredictionStats,
    revealPredictions,
    clearPredictions,
    getSortedSongs
} from '@/lib/redis-store';
import { getVisitorIdFromRequest } from '@/lib/fingerprint';

// POST - Make a prediction or admin actions
export async function POST(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);
    const adminKey = request.headers.get('x-admin-key');
    const isAdmin = adminKey === process.env.ADMIN_PASSWORD;

    try {
        const body = await request.json();
        const { action, songId } = body;

        // Admin actions
        if (action === 'lock' && isAdmin) {
            await lockPredictions();
            return NextResponse.json({ success: true, message: 'Predictions locked!' });
        }

        if (action === 'unlock' && isAdmin) {
            await unlockPredictions();
            return NextResponse.json({ success: true, message: 'Predictions unlocked!' });
        }

        if (action === 'reveal' && isAdmin) {
            // Get the current #1 song
            const songs = await getSortedSongs();
            if (songs.length === 0) {
                return NextResponse.json({ error: 'No songs in playlist' }, { status: 400 });
            }

            const winningSongId = songs[0].id;
            const result = await revealPredictions(winningSongId);

            return NextResponse.json({
                success: true,
                winningSong: { id: songs[0].id, name: songs[0].name, artist: songs[0].artist },
                winners: result.winners,
                losers: result.losers,
                message: `${result.winners} users predicted correctly and earned +3 karma!`
            });
        }

        if (action === 'clear' && isAdmin) {
            await clearPredictions();
            return NextResponse.json({ success: true, message: 'Predictions cleared for new session.' });
        }

        // User making a prediction
        if (!visitorId) {
            return NextResponse.json({ error: 'Session required' }, { status: 400 });
        }

        if (!songId) {
            return NextResponse.json({ error: 'Select a song to predict' }, { status: 400 });
        }

        const result = await makePrediction(visitorId, songId);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: 'Prediction locked in! 🎯' });
    } catch (error) {
        console.error('Prediction error:', error);
        return NextResponse.json({ error: 'Failed to process prediction' }, { status: 500 });
    }
}

// GET - Get user's prediction and prediction status
export async function GET(request: Request) {
    const visitorId = getVisitorIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get('stats') === 'true';

    try {
        const isLocked = await arePredictionsLocked();
        const userPrediction = visitorId ? await getUserPrediction(visitorId) : null;

        const response: {
            isLocked: boolean;
            userPrediction: string | null;
            stats?: { total: number; bySong: Record<string, number> };
        } = {
            isLocked,
            userPrediction,
        };

        // Only include stats for admin requests
        if (includeStats) {
            response.stats = await getPredictionStats();
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('Get prediction error:', error);
        return NextResponse.json({ error: 'Failed to get prediction status' }, { status: 500 });
    }
}
