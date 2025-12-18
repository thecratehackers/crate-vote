# Crate Vote 🎵

A collaborative playlist voting app for Twitch streamers. Let your viewers build and vote on the playlist together!

## Features

- **Reddit-style voting**: Viewers can upvote/downvote songs
- **Anti-griefing safeguards**: 
  - Max 2 songs per user per session
  - 5-minute cooldown between adds
  - Songs can't be voted below -3 (prevents wiping)
- **DJ admin controls**: Remove songs, ban users, lock playlist
- **Spotify integration**: Search songs and export final playlist
- **Anonymous voting**: No login required for viewers (uses browser fingerprinting)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Spotify Developer App

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add redirect URIs:
   - `http://localhost:3000/api/auth/callback/spotify` (for local dev)
   - `https://your-domain.vercel.app/api/auth/callback/spotify` (for production)

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:
- `SPOTIFY_CLIENT_ID` - From Spotify Developer Dashboard
- `SPOTIFY_CLIENT_SECRET` - From Spotify Developer Dashboard
- `NEXTAUTH_SECRET` - Random string (generate with `openssl rand -base64 32`)
- `ADMIN_PASSWORD` - Password for accessing admin panel

### 4. Run locally

```bash
npm run dev
```

- Viewer page: http://localhost:3000
- Admin panel: http://localhost:3000/admin

## Deployment to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Update Spotify redirect URI to your Vercel domain

## Usage

1. **Start a stream**: Open the admin panel at `/admin`
2. **Share the link**: Give viewers the main page URL
3. **Moderate**: Use admin controls to manage the playlist
4. **Export**: When done, export to Spotify or download for Crate Hackers

## Crate Hackers Integration

The "Export for Crate Hackers" button downloads a JSON file with the playlist data. Once the Crate Hackers API is available, this can be updated to push directly to the API.

## License

MIT
