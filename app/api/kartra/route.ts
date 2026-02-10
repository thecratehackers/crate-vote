import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/kartra
 * Creates a lead in Kartra and subscribes them to the Crate Hackers mailing list.
 * Called from the onboarding flow when users sign up.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, phone, firstName } = body;

        // Validate required fields
        if (!email || !email.includes('@')) {
            return NextResponse.json(
                { error: 'Valid email is required' },
                { status: 400 }
            );
        }

        const apiKey = process.env.KARTRA_API_KEY;
        const apiPassword = process.env.KARTRA_API_PASSWORD;
        const appId = process.env.KARTRA_APP_ID;
        const listName = process.env.KARTRA_LIST_NAME;

        if (!apiKey || !apiPassword || !appId || !listName) {
            console.error('Missing Kartra environment variables');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // Build the Kartra API request body as form-encoded
        // Kartra requires lead data in lead[...] namespace, actions in actions[...] namespace
        const params = new URLSearchParams();
        params.append('app_id', appId);
        params.append('api_key', apiKey);
        params.append('api_password', apiPassword);

        // Lead data (separate from actions)
        params.append('lead[email]', email);
        if (firstName) {
            params.append('lead[first_name]', firstName);
        }
        if (phone) {
            params.append('lead[phone]', phone);
        }

        // Action 1: Create the lead
        params.append('actions[0][cmd]', 'create_lead');

        // Action 2: Subscribe lead to the mailing list
        params.append('actions[1][cmd]', 'subscribe_lead_to_list');
        params.append('actions[1][list_name]', listName);

        const kartraResponse = await fetch('https://app.kartra.com/api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        const kartraData = await kartraResponse.json();

        if (kartraData.status === 'Error') {
            console.error('Kartra API error:', kartraData);
            // Still return success to the user — don't block onboarding
            // The lead creation might fail if the lead already exists, which is fine
            if (kartraData.message?.includes('already exists') || kartraData.message?.includes('Lead Not Found')) {
                // Lead exists — try subscribing them anyway
                console.log('Lead may already exist, continuing...');
            } else {
                return NextResponse.json(
                    { success: false, error: 'Failed to save to mailing list' },
                    { status: 502 }
                );
            }
        }

        console.log('Kartra lead created successfully:', email);
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Kartra API route error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
