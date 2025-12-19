/**
 * Twitch Chat Bot for Crate-Vote Song Requests
 * 
 * Commands:
 *   !request <song name>  - Add a song to the playlist
 *   !sr <song name>       - Shorthand for !request
 * 
 * Run with: npm run twitch-bot
 */

import * as tmi from 'tmi.js';

// Configuration from environment variables
const config = {
    channel: process.env.TWITCH_CHANNEL || '',
    botUsername: process.env.TWITCH_BOT_USERNAME || '',
    oauthToken: process.env.TWITCH_OAUTH_TOKEN || '',
    botSecret: process.env.TWITCH_BOT_SECRET || '',
    apiUrl: process.env.CRATE_VOTE_API_URL || 'http://localhost:3000',
};

// Validate configuration
function validateConfig(): boolean {
    const missing: string[] = [];
    if (!config.channel) missing.push('TWITCH_CHANNEL');
    if (!config.botUsername) missing.push('TWITCH_BOT_USERNAME');
    if (!config.oauthToken) missing.push('TWITCH_OAUTH_TOKEN');
    if (!config.botSecret) missing.push('TWITCH_BOT_SECRET');

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(v => console.error(`   - ${v}`));
        console.error('\nPlease set these in your .env.local file and try again.');
        return false;
    }
    return true;
}

// Cooldown tracking (per-user, in milliseconds)
const COOLDOWN_MS = 30 * 1000; // 30 seconds
const userCooldowns = new Map<string, number>();

function isOnCooldown(username: string): boolean {
    const lastRequest = userCooldowns.get(username);
    if (!lastRequest) return false;
    return Date.now() - lastRequest < COOLDOWN_MS;
}

function getCooldownRemaining(username: string): number {
    const lastRequest = userCooldowns.get(username);
    if (!lastRequest) return 0;
    return Math.ceil((COOLDOWN_MS - (Date.now() - lastRequest)) / 1000);
}

function setCooldown(username: string): void {
    userCooldowns.set(username, Date.now());
}

// Request a song via the API
async function requestSong(query: string, username: string): Promise<{ success: boolean; message: string }> {
    try {
        const response = await fetch(`${config.apiUrl}/api/twitch-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.botSecret}`,
            },
            body: JSON.stringify({ query, username }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            return {
                success: true,
                message: data.message || `Added "${data.song?.name}" to the playlist!`,
            };
        } else {
            return {
                success: false,
                message: data.message || data.error || 'Failed to add song',
            };
        }
    } catch (error) {
        console.error('API request error:', error);
        return {
            success: false,
            message: 'Connection error - is the crate-vote server running?',
        };
    }
}

// Main bot initialization
async function main() {
    console.log('🎵 Crate-Vote Twitch Bot Starting...\n');

    if (!validateConfig()) {
        process.exit(1);
    }

    // Create TMI client
    const client = new tmi.Client({
        options: { debug: false },
        identity: {
            username: config.botUsername,
            password: config.oauthToken,
        },
        channels: [config.channel],
    });

    // Handle connection
    client.on('connected', (address, port) => {
        console.log(`✅ Connected to Twitch IRC at ${address}:${port}`);
        console.log(`📺 Joined channel: #${config.channel}`);
        console.log(`🤖 Bot username: ${config.botUsername}`);
        console.log(`🌐 API URL: ${config.apiUrl}`);
        console.log('\n🎧 Listening for !request and !sr commands...\n');
    });

    // Handle messages
    client.on('message', async (channel, tags, message, self) => {
        // Ignore messages from the bot itself
        if (self) return;

        const username = tags.username || 'anonymous';
        const displayName = tags['display-name'] || username;
        const msg = message.trim();

        // Check for song request commands
        let query: string | null = null;

        if (msg.toLowerCase().startsWith('!request ')) {
            query = msg.slice(9).trim();
        } else if (msg.toLowerCase().startsWith('!sr ')) {
            query = msg.slice(4).trim();
        }

        if (!query) return;

        console.log(`📥 Request from ${displayName}: "${query}"`);

        // Check cooldown
        if (isOnCooldown(username)) {
            const remaining = getCooldownRemaining(username);
            client.say(channel, `@${displayName} Please wait ${remaining}s before requesting another song.`);
            console.log(`   ⏳ Cooldown: ${remaining}s remaining`);
            return;
        }

        // Make the request
        const result = await requestSong(query, displayName);

        if (result.success) {
            client.say(channel, `@${displayName} ✅ ${result.message}`);
            setCooldown(username);
            console.log(`   ✅ Success: ${result.message}`);
        } else {
            client.say(channel, `@${displayName} ❌ ${result.message}`);
            console.log(`   ❌ Failed: ${result.message}`);
        }
    });

    // Handle disconnection
    client.on('disconnected', (reason) => {
        console.log(`❌ Disconnected: ${reason}`);
        console.log('Attempting to reconnect in 5 seconds...');
        setTimeout(() => {
            client.connect().catch(console.error);
        }, 5000);
    });

    // Connect to Twitch
    try {
        await client.connect();
    } catch (error) {
        console.error('❌ Failed to connect to Twitch:', error);
        process.exit(1);
    }
}

// Run the bot
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
