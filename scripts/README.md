# Twitch Bot for Crate-Vote

This is the Twitch chat bot that listens for `!request` and `!sr` commands.

## Deploy to Render (Free)

1. Go to [render.com](https://render.com) and sign up/login
2. Click **New** → **Background Worker**
3. Connect your GitHub and select this repo
4. Set these options:
   - **Name**: `crate-vote-twitch-bot`
   - **Root Directory**: `scripts`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add Environment Variables:
   - `TWITCH_CHANNEL` = `thecratehackers`
   - `TWITCH_BOT_USERNAME` = `thecratehackers`
   - `TWITCH_OAUTH_TOKEN` = `oauth:a74tbr2otfdvxu421hnga4neacowm2`
   - `TWITCH_BOT_SECRET` = `crate-vote-twitch-secret-2024`
   - `CRATE_VOTE_API_URL` = `https://crate-vote.vercel.app`
6. Click **Create Background Worker**

The bot will run 24/7 automatically!
