# Crate Vote — Production Deployment

Boring, repeatable steps to ship and not get embarrassed live. Do them in order.

---

## 1. Environment variables (Vercel → Settings → Environment Variables)

Set these for the **Production** environment. See `.env.example` for the full annotated list.

### Required — the app fails closed without these

| Variable | What it does | If missing |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Redis storage (songs/votes/karma) | API returns `503` |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth | API returns `503` |
| `ADMIN_PASSWORD` | `/admin` master key (no fallback) | Admin login disabled |
| `VOTER_SECRET` | Signs the anti-cheat voter cookie | Falls back to `ADMIN_PASSWORD` (works, but rotating admin pw logs voters out) |
| `SPOTIFY_CLIENT_ID` | Song search | Search fails |
| `SPOTIFY_CLIENT_SECRET` | Song search | Search fails |

> `KV_REST_API_URL` / `KV_REST_API_TOKEN` are accepted as alternatives to the `UPSTASH_*` pair if you use Vercel KV.

### Optional — app runs fine without them

| Variable | What it does |
|---|---|
| `YOUTUBE_API_KEY` | Music-video previews |
| `TWITCH_*`, `CRATE_VOTE_API_URL` | Twitch chat bot (the live Twitch embed does NOT need these) |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Only if auth flows are enabled |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_BASE_URL` | Branding / SEO |

**Rules:**
- Use long, random values for `ADMIN_PASSWORD` and `VOTER_SECRET` (make them different).
- Never paste secrets into the repo. `.env.example` holds placeholders only.

---

## 2. Deploy

```bash
# from the project root, on the branch you want to ship
vercel --prod
```

Or push to the production branch if the repo is git-connected to Vercel.

Build is verified: `next build` passes clean, no TS/ESLint suppression in `next.config.js`, Node pinned to `>=18.18.0`.

---

## 3. Final pre-launch test checklist

Run this against the **live production URL** right before the show. ~10 minutes.

### Boot / config
- [ ] Site loads with an empty playlist (no crash on empty DB)
- [ ] `/admin` loads, login rejects a wrong password, accepts the real one
- [ ] Confirm env vars point at the **production** Redis, not a test DB

### Core flow (do it from a phone on cell data, not wifi)
- [ ] Enter a name, add a song, see it appear
- [ ] Upvote then downvote — score updates, can't double-count
- [ ] Spam-tap the vote button — no errors, no double counting (per-user lock holds)
- [ ] Open the app in two tabs — votes stay consistent across both
- [ ] Refresh mid-session — identity/votes persist (signed cookie)

### Lock / round control
- [ ] Admin locks the playlist → normal users can't vote or add (gets a clear message)
- [ ] Admin unlocks → voting works again

### Live-show safety
- [ ] Set a "now playing" song, bomb it from a couple devices — threshold + skip works, and a single device can't stack bombs
- [ ] Trigger the Twitch auto-switch test (Tue 6:50 PM CT → Twitch, 8:50 PM → YouTube) at least once before showtime
- [ ] Confirm the embed renders inside the hackathon iframe (cookie works cross-origin)

### Abuse / edge
- [ ] Paste a weird/very long song or user name — sanitized, no layout break, no script execution
- [ ] Hammer voting fast — gets rate-limited (`429`) instead of erroring out
- [ ] Hit an admin API route without the key (e.g. `curl`) — returns `401`

### Day-of readiness
- [ ] Clear last session's data so you start clean
- [ ] Admin password reachable on your phone
- [ ] Someone other than you has tested adding+voting from their own phone

---

## 4. Known residual risks (accepted, non-blocking)

Low-impact, abuse-limited, and **not** worth changing right before launch:

- A few non-critical participant endpoints (`predictions`, `crate-crack/result`, `window-delete`, `reactions`, `karma`) identify the user by the `x-visitor-id` header rather than the signed cookie. They are protected by per-user dedupe and/or cooldowns, so the worst case is a user farming a little of their own throwaway karma — it can't disrupt the room or crash the app. (`vote`, `add song`, and `bomb` use the hardened signed identity.)
- During a Redis outage, the rate limiter degrades to a per-instance in-memory limiter (fails closed-ish, not fully open). Expected behavior.

Tighten these post-event if desired; they are not launch blockers.
