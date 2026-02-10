# 🔁 Retention Readiness Audit — Crate Vote

**Date:** 2026-02-10
**Method:** Code trace across `page.tsx` (3,394 lines), `config.ts`, `redis-store.ts`, component tree, existing UX/Copy/Performance audits, and First-Time User Simulation
**Product:** Crate Vote — live collaborative playlist voting for Crate Hackers events

---

## Framing Questions

### 1. Why would a user come back tomorrow?

**Honest answer: There is currently no reason to.**

The product is **event-locked**. Value only exists during the ~3-hour Tuesday 8 PM ET broadcast window. Outside that window, a returning user sees:

- A countdown timer ("NEXT LIVE EVENT 6d 22h 14m")
- An empty playlist or stale data from the last session
- A mailing list signup (which they may have already completed)
- Zero history of their previous participation

There is **no persistent identity, no carry-over state, no content to browse, and no social graph** between sessions. The entire Redis store wipes clean after each event. A returning user is essentially indistinguishable from a new visitor who happens to have a localStorage cookie.

**Key metric this impacts:** D1 retention is structurally capped near 0% for non-event days, and weekly retention depends entirely on whether the user remembers the Tuesday schedule and manually returns.

### 2. Is value visible fast enough?

**During a live session: Yes (≈25-30 seconds with skip).**

The glassmorphism overlay showing live activity behind it is excellent FOMO design. After onboarding (Name → Skip), the user can search and add a song within 15 seconds. The "★ YOURS" badge, sound effects, and toast confirmation create a clear aha moment.

**Outside a live session: No.**

A first-time visitor arriving on Wednesday sees a countdown, an empty state, and a mailing list form. There is no demonstration of product value, no historical playlist to browse, no social proof of past sessions. Time-to-value for off-peak visitors is effectively **infinite** — they cannot experience the product at all.

### 3. Are there clear progress loops?

**Partially.** Within a single session:

| Loop | Mechanic | Visible? | Satisfying? |
|------|----------|----------|-------------|
| Add songs → See them ranked | Rank badges, "★ YOURS" | ✅ | ✅ |
| Vote → Watch ranks shift | Animations, green/red flash | ✅ | ✅ |
| Earn karma → Unlock bonus votes/songs | Karma counter in header | ⚠️ Faint | ⚠️ Delayed |
| Hit Top 3 → Confetti + prize | Full-screen overlay | ✅ | ✅ |
| Predict winner → +3 karma | Prediction modal | ✅ | ✅ |
| Watch for 5 min → +1 karma | Timer (hidden) | ❌ Hidden | ❌ No feedback |
| Share invite → +1 karma | Share button | ⚠️ | ✅ |

**Cross-session progress: None.** Karma resets. Rankings reset. Leaderboard resets. Song history is gone. There is zero continuity between Tuesday sessions. A user who has attended 10 sessions is treated identically to a first-timer.

### 4. Are there "aha moments" in the first session?

**Yes, there are two strong ones:**

1. **"My song is on the board"** — Adding a song and seeing it appear with your name, the "★ YOURS" badge, and a satisfying sound effect. This happens ~25-30 seconds in.

2. **"My song is climbing"** — Watching your song's rank change in real-time with animated flash effects and, if it hits Top 3, full-screen confetti. This happens ~2-5 minutes in.

**Missing aha moments:**

- **"I influenced the outcome"** — There's no end-of-session recap showing your total impact (votes cast, songs that rose because of you, prediction accuracy).
- **"Other people see me"** — Beyond the "★ YOURS" badge, there's no visible social status or recognition from other participants. The leaderboard is collapsed by default.
- **"I came back and I'm rewarded for it"** — Zero returning-user acknowledgment.

### 5. Are reminders/re-entry points obvious and useful?

**No.** The only re-entry mechanisms are:

| Mechanism | Status | Effectiveness |
|-----------|--------|---------------|
| Kartra email list | ✅ Exists (onboarding capture) | ⚠️ Depends on Kartra automation being configured — no in-app trigger |
| Broadcast countdown bar | ✅ Visible | ❌ Passive — no way to set a reminder from the bar |
| "Add to Calendar" | ❌ Does not exist | — |
| Push notifications | ❌ Does not exist | — |
| SMS alerts | ⚠️ Phone captured optionally | ❌ Not automated |
| Session recap email | ❌ Does not exist | — |
| Social share of results | ❌ Does not exist | — |
| Twitch/YouTube notification (stream going live) | External to app | ⚠️ Only for stream followers |

The product relies entirely on the user **remembering to come back** or being subscribed to an external Kartra email list that is configured separately from this codebase.

---

## A) Current Retention Weaknesses

### 🔴 Critical (Structural Barriers to Return)

| # | Weakness | Impact | Evidence |
|---|----------|--------|----------|
| **R-1** | **100% ephemeral state** — Every session wipes all songs, votes, karma, leaderboard, and predictions. Zero cross-session continuity. | Users build nothing persistent. No investment = no pull to return. | `resetSession()` in `redis-store.ts` clears everything. No archive/history mechanism exists. |
| **R-2** | **No session recap or results** — When a session ends, the winner sees a splash. Everyone else gets nothing. No email, no in-app summary, no "your songs finished at #X" notification. | The user's effort disappears without acknowledgment. They don't even know if their song won unless they were watching at the exact moment the timer expired. | No post-session handler in the codebase. Winner splash is gated on `showWinnerSplash` which triggers at timer end — but only for the #1 song owner who is currently on the page. |
| **R-3** | **Dead app 162 hours/week** — The product is only live ~6 hours/week (Tuesdays 8-11 PM ET). For 96% of the week, visitors see nothing but a countdown. | Any user who discovers the product off-peak has no way to experience its value. First impression is a dead screen. | `broadcastCountdown` logic in `page.tsx` lines 539-585. Empty state rendering has no historical content. |
| **R-4** | **No re-entry trigger in-app** — No push notifications, no "Add to Calendar," no automated reminders. The countdown bar is passive text. | The only pull-back mechanism is external (Kartra email), which is a marketing tool, not a product feature. | Broadcast bar JSX is purely display; no actionable CTA. |
| **R-5** | **No persistent identity beyond localStorage** — Clearing browser data = complete identity reset. No account, no login, no recovery. | Power users who clear cookies lose all history. Multi-device users can't carry progress. | `visitorId` is generated per-device via fingerprint. Username is `localStorage` only. |

### 🟡 High (Engagement Ceiling Limitations)

| # | Weakness | Impact | Evidence |
|---|----------|--------|----------|
| **R-6** | **Karma resets every session** — Karma earned through participation (top 3, predictions, presence, sharing) is wiped with every session reset. No cumulative reward. | Removes the primary progression mechanic. A 10-session veteran has 0 karma at session start just like a newcomer. | `resetSession()` clears `hackathon:userKarma`. |
| **R-7** | **No leaderboard history** — The live leaderboard shows current session only. No all-time rankings, no "Most Wins," no streaks. | No competitive hook between sessions. Users can't build or defend a reputation. | Leaderboard calculated on-the-fly from current songs. No historical store. |
| **R-8** | **No "waiting room" content** — Between sessions, the app has nothing for users to do or explore. No past playlists, no community discovery, no preview of next session's theme. | Off-peak visitors bounce with nothing to anchor them. | Empty state rendering in `page.tsx` shows countdown + RSVP only. |
| **R-9** | **God Mode has no memory** — Being the top contributor in a session earns God Mode powers, but these evaporate at session end. No lasting recognition for consistent top performance. | Diminishes the aspirational value of competing. | `isGodMode` recalculated per-request from current playlist. |
| **R-10** | **Export is the only output artifact** — The Spotify playlist export is the only tangible thing a user takes away from a session. But it's the *entire* playlist, not personalized. | Users get a product, but it's everyone's product, not specifically theirs. No "my picks" or "songs I championed." | Export captures top 100 songs regardless of who added them. |

### 🟢 Moderate (Friction Points Reducing Return Intent)

| # | Weakness | Impact | Evidence |
|---|----------|--------|----------|
| **R-11** | **No welcome-back differentiation** — Returning users see the exact same interface as first-timers (minus the onboarding overlay). No "welcome back, here's what happened." | No emotional reinforcement for returning. | `init()` loads localStorage name but no returning-user state. |
| **R-12** | **Voting exhaustion** — Users burn through all 5 songs + 10 upvotes + 10 downvotes in ~3-5 minutes. Once exhausted, the only action is passive watching (hoping for karma rain or earning karma via 5-min presence). | Post-exhaustion engagement is low. Users have no actions left to take for the remainder of the ~3-hour session. | `LIMITS.maxUpvotesPerUser = 5`, `maxDownvotesPerUser = 5`, `maxSongsPerUser = 5` in `config.ts`. Karma bonuses only marginally extend this. |
| **R-13** | **Game features appear before context** — The "🏆 Top DJs" and "🎯 Predict #1" buttons are visible immediately but confusing to new users who haven't added songs or voted yet. | Features that should build anticipation instead create cognitive noise. | Game features bar renders unconditionally when session is active. |

---

## B) Missing Hooks (Without Dark Patterns)

These are features that would authentically increase return motivation by making the product more valuable with repeat use. None involve artificial urgency, fake scarcity, or manipulative design.

### 🏆 Identity & Progression Hooks

| # | Hook | What It Does | Why It Works for Retention |
|---|------|-------------|---------------------------|
| **H-1** | **Persistent Karma (All-Time)** | Keep a running karma total in Redis keyed by `visitorId`, separate from the session karma that resets. Display all-time karma on the user pill and leaderboard. | Creates a metagame that spans sessions. Users return to grow their status. It costs 0 karma per session reset to preserve. |
| **H-2** | **Session History Ledger** | After each session, snapshot the top 10 songs, the winner, the leaderboard king, and per-user stats into a `sessions:archive:{date}` Redis key (or JSON file). Show a "Past Sessions" section in the waiting state. | Users can see their track record. "I had the #2 song last week" becomes a story they carry. |
| **H-3** | **Badges / Achievements** | Award persistent badges for milestones: "🔥 First Win" (song hit #1), "🎯 Oracle" (3 correct predictions), "👑 Crown Keeper" (held #1 for 3+ sessions), "📦 Crate Starter" (first 5 sessions attended). Store in localStorage or Redis. | Collectible progress that's visible on the user pill. Gives users something to strive for beyond the current session. |
| **H-4** | **Win/Loss Record** | Track how many times each user's songs finished in Top 3 vs. bottom 10. Show as "W-L" on the leaderboard or profile. | Competitive hook. Users return to improve their record. |

### 📬 Re-Entry Hooks

| # | Hook | What It Does | Why It Works for Retention |
|---|------|-------------|---------------------------|
| **H-5** | **"Add to Calendar" CTA** | Replace the passive countdown bar text with an actionable Google Calendar / iCal link that creates a recurring Tuesday 8 PM ET event with a deep link to `crateoftheweek.com`. | One-click calendar reminder eliminates the "I forgot" problem. Works for every platform, zero push notification permission needed. |
| **H-6** | **Post-Session Recap (In-App)** | On session end (timer hits 0), show every participant a personalized overlay: "Your song 'Intergalactic' finished #2 out of 34 tracks. You voted 8 times. Your prediction was correct! +3 karma." Store in localStorage so it shows on next visit too. | Gives users a reason to be there at session end. Also anchors returning users with a "last time you..." context. |
| **H-7** | **"Your Highlight Reel" on Return** | When a returning user lands on the app between sessions, show a lightweight card: "Last session: 🥈 Your song finished #2 · 🗳️ 8 votes cast · 🎯 Prediction correct · 🔥 +8 karma earned." | Turns dead-time visits from boring to reinforcing. Users feel seen. |
| **H-8** | **Social Share Card** | After a win or notable finish, generate a shareable image/link: "My song [Track Name] hit #1 at Crate Hackers! 🏆 Join the next vote → crateoftheweek.com." | Organic acquisition loop. Winners share, friends click, new users join, bigger sessions. |

### 🎮 Engagement Depth Hooks

| # | Hook | What It Does | Why It Works for Retention |
|---|------|-------------|---------------------------|
| **H-9** | **Vote Refresh Mechanic** | Periodically (every 15-20 minutes of session time), restore 3 votes to every active participant. Announced via a mini Karma Rain-style celebration. | Prevents vote exhaustion from killing engagement after 5 minutes. Keeps users active through the full 3-hour session without just increasing the vote cap (which would dilute their value). |
| **H-10** | **"Next Session Theme" Preview** | Allow the admin/host to set a theme or genre for the upcoming session (e.g., "90s R&B Night", "Latin Heat"). Display it on the countdown screen. | Gives returning users something to anticipate and plan for. They'll think about which songs to bring. |
| **H-11** | **Personal Playlist Export** | In addition to the full 100-song export, offer "My Picks" — a playlist of just the songs the current user added, plus the songs they upvoted. | Users walk away with something personally curated, not just the crowd's output. Makes the export feel like *their* takeaway. |
| **H-12** | **Streak Counter** | Track consecutive sessions attended (present for at least 5 minutes). Display a "🔥 3-session streak" badge on the user pill. Breaks after 2 missed weeks. | Light social pressure + sense of continuity. Satisfying to maintain without being punitive. |

---

## C) Better Re-Engagement Mechanics

### Current State → Improved State

| Channel | Current | Better | Effort |
|---------|---------|--------|--------|
| **In-App Countdown** | Passive text: "NEXT LIVE EVENT 3d 6h 42m / Every Tue · 8 PM ET" | **Actionable**: `NEXT LIVE EVENT 3d 6h 42m · Every Tue · 8 PM ET` + `📅 Add to Calendar` button that generates a Google Calendar .ics link with the event deep link. | 🟢 Small (30 min) — generate iCal URL from broadcast time logic already in `calcCountdown()`. |
| **Post-Session** | Nothing. Winner sees a splash. Everyone else — nothing. | **Session Recap Overlay**: On timer end, every active participant sees a 5-second personalized summary. Stored in `localStorage['crate-last-session']` for display on next visit. | 🟡 Medium (2-3 hrs) — snapshot user stats at timer expiry, render overlay, persist to localStorage. |
| **Returning User (Off-Peak)** | Same empty state as first-timer. Countdown + RSVP form (possibly duplicate). | **Welcome-Back Card**: "Welcome back, {name}! 🎧" + last session recap + countdown + calendar CTA. RSVP suppressed if already done. Past session playlist link. | 🟡 Medium (1-2 hrs) — conditional rendering based on localStorage state. |
| **Email (Kartra)** | Handled externally. No in-app trigger. No content from the app surfaces in emails. | **Session Recap Email**: After each session, trigger a Kartra automation that includes: winning song, leaderboard king, participant count, and the Spotify export link. | 🟡 Medium (requires Kartra automation setup + a post-session API endpoint to push data). |
| **Social Virality** | No sharing mechanism beyond the admin QR code and invite CTA in jukebox idle mode. | **Winner Share Card**: Generate an OG-image-compatible URL (`crateoftheweek.com/win/[sessionId]`) that previews well on Twitter/Instagram. Winners can share directly from the splash. Non-winners can share "I voted in tonight's session." | 🟡 Medium (2-3 hrs) — OG image generation API + share button on recap. |
| **Session Anticipation** | Zero. Countdown is purely temporal. | **"Coming Up" Preview Card** on waiting screen: Admin-settable theme/genre for next session + teaser playlist (3-5 seed songs). | 🟢 Small (1 hr) — new Redis key `hackathon:nextSessionTheme`, admin input in Tools tab, rendered on waiting screen. |

---

## D) 7-Day Activation Improvement Plan

### Day 1 (Tuesday — Session Day): Foundation

**Goal:** Every participant leaves the session with a reason to return and a mechanism to remember.

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | **Add "📅 Add to Calendar" button** to broadcast countdown bar. Generate Google Calendar link with recurring Tuesday 8 PM ET event. Deep link to `crateoftheweek.com`. | 30 min | Solves the #1 retention killer: "I forgot." |
| 🔴 P0 | **Build Session Recap Overlay.** On timer expiry (or admin session end), compute per-user summary: songs added, votes cast, best song rank, prediction result, karma earned. Show as a 5-second overlay with dismiss. | 2-3 hrs | Gives every user a satisfying ending. Anchors the "I should come back" feeling. |
| 🔴 P0 | **Persist Session Recap to localStorage.** Store `crate-last-session` with: date, user's top song + rank, total votes, prediction accuracy, karma earned. | 30 min | Enables Day 2's returning user experience. |

### Day 2 (Wednesday): Returning User Experience

**Goal:** The day after the first session, a returning visitor feels recognized and anchored.

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🟡 P1 | **Build Welcome-Back State.** When `crate-last-session` exists in localStorage and no session is active, render a personalized card: "Welcome back, {name}! Last session: your song '{song}' finished #{rank}. Next event in {countdown}." + Calendar CTA. | 1-2 hrs | Transforms dead time from confusing to reinforcing. |
| 🟡 P1 | **Suppress duplicate RSVP.** If `crate-rsvp-done` is true, hide the mailing list form on the waiting screen entirely. Show "✅ You're on the list!" instead. | 15 min | Removes the "I already gave you my email" insult. |
| 🟡 P1 | **Implement Persistent Karma.** Add a `hackathon:allTimeKarma:{visitorId}` Redis key that increments alongside session karma but is NOT cleared by `resetSession()`. Display all-time karma on the user pill tooltip. | 1 hr | First cross-session progression mechanic. |

### Day 3 (Thursday): Engagement Depth

**Goal:** Solve vote exhaustion so next session has sustained engagement.

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🟡 P1 | **Vote Refresh Mechanic.** Every 20 minutes of active timer, restore 2 upvotes + 2 downvotes for all participants. Announce with a mini celebration banner: "🗳️ Vote Refresh! 2 more votes unlocked." | 2-3 hrs | Prevents the engagement cliff after 5 minutes. Users stay for the full session. |
| 🟡 P1 | **"Next Session Theme" Admin Input.** Add a text field in Admin Tools tab to set next week's theme. Store in `hackathon:nextSessionTheme`. Display on waiting screen: "Next session theme: 90s R&B Night 🎶". | 45 min | Creates anticipation between sessions. Users plan their submissions. |

### Day 4 (Friday): Social Proof & Virality

**Goal:** Let winners tell the world. Let onlookers be curious.

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🟡 P1 | **Personal Playlist Export.** Add a "My Picks" mode to the export page that only includes songs the user added + songs they upvoted. | 1-2 hrs | Users walk away with a personally meaningful artifact. |
| 🟢 P2 | **Social Share Button on Winner Splash.** Add a "Share Your Win" button that copies a formatted message to clipboard: "My song [Track] hit #1 at @CrateHackers! 🏆 Join → crateoftheweek.com". | 45 min | Organic word-of-mouth loop. Low effort, high potential. |

### Day 5 (Saturday): Cross-Session Progress

**Goal:** Make repeat participation visibly meaningful.

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🟢 P2 | **Session Attendance Streak.** Track consecutive sessions attended in localStorage. Show "🔥 3-session streak" badge on user pill. Reset after 2 missed Tuesdays. | 1 hr | Light, positive social pressure. Satisfying to maintain. |
| 🟢 P2 | **Win/Loss Record.** Store Top 3 finishes and total sessions in localStorage. Show "3W - 7L" on profile or leaderboard hover. | 1 hr | Competitive hook that spans sessions. |

### Day 6 (Sunday): Session Archive

**Goal:** Give the product life between events.

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🟢 P2 | **Session History Archive.** On session end, snapshot the top 10 songs, winner, leaderboard king, and participant count to Redis key `sessions:archive:{date}`. | 1-2 hrs | Enables browsable history for off-peak visitors. |
| 🟢 P2 | **"Past Sessions" UI.** On the waiting screen, render the last 3 session archives: Date, winner song, # participants, link to exported Spotify playlist. | 1-2 hrs | Off-peak visitors now have something to explore. Proves the product is alive. |

### Day 7 (Monday — Day Before Session): Anticipation

**Goal:** Everything from this week comes together for tomorrow's session.

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🟢 P2 | **Pre-Session Hype State.** If countdown is <24 hours, enhance the waiting screen: Pulsing "TOMORROW NIGHT" badge + theme preview + last session recap + past winner highlight. | 1 hr | Transforms the pre-session dead zone into a hype builder. |
| 🟢 P2 | **Verify Calendar + Recap + Theme pipeline end-to-end.** Ensure all 7 days of mechanics work together for a returning user. | 1 hr | Integration testing. |

---

## E) What to Remove Because It Distracts from Repeat Value

These are features or patterns that consume attention, development bandwidth, or user cognitive load without contributing to return visits.

### 🔴 Remove or Simplify

| # | What | Why It Hurts Retention | Recommendation |
|---|------|----------------------|----------------|
| **X-1** | **Step 2: "Are you a DJ?" in onboarding** | Adds 5 seconds to signup with zero impact on the experience (BPM/key data is hidden because Spotify API returns 403). The `isProfessionalDJ` flag is captured but never used in the current codebase. | **Remove entirely.** Store as `null`. If DJ features return, prompt in-app later. Saves 1 step, ~15% reduction in onboarding abandonment. |
| **X-2** | **Reactions system (code remnants)** | Quick emoji reactions were removed from the UI in Dec 2024 but the state management (`songReactions`, `userReactions`, `reactingTo`) and type definitions still exist in `page.tsx`. Dead code that adds to the 3,400-line monolith. | **Delete the dead state declarations.** The types, state hooks, and handlers serve no purpose. |
| **X-3** | **"I discover music" / "I've got great taste"** copy on Step 2 | Cute but adds decision friction without functional purpose. Neither option changes the UX. | See X-1 — remove entire step. |
| **X-4** | **Game Tips carousel during session** | 7 tips rotating in the activity ticker compete with real-time activity for attention. Tips like "Stay 5 minutes to earn +1 karma" are coaching the user during the critical engagement window — this should have happened during onboarding, not mid-vote. | **Move tips to a one-time onboarding tooltip** (the coach mark system already exists). Post-coach-mark, the ticker should only show live activity. |
| **X-5** | **Karma presence cooldown of 15 minutes** (`karmaPresenceCooldownMs: 15 * 60 * 1000`) | Users earn +1 karma after 5 minutes of presence, but then wait 15 more minutes for the next point. The reward is too delayed and infrequent to drive behavior. Combined with session resets, this karma is nearly worthless. | **Reduce to 10-minute intervals** and **make karma persistent** (H-1). The combination of faster earning + permanent accumulation makes the mechanic meaningful. |
| **X-6** | **Separate Jukebox idle screensaver with 8 message variants** | The idle screensaver activates after 25 seconds of inactivity and shows one of 8 random messages. This is a streaming/broadcasting feature — it doesn't serve the participant's retention. Several messages are near-duplicates per the Copy Audit. | **Reduce to 4 messages** (as already recommended in Copy Audit). The screensaver is fine for stream viewers but shouldn't get more development attention over retention mechanics. |
| **X-7** | **Per-song vote cooldown of 3 seconds** + global 30 votes/min limit | Combined with only 5+5 votes total, the rate limit rarely triggers for legitimate users. It mainly creates "Wait a moment" friction toasts that interrupt the dopamine loop for enthusiastic voters. | **Remove the per-song cooldown.** Keep the global rate limit as an abuse backstop but raise it to 60/min since users only have 10-15 total votes anyway. The math doesn't support both constraints. |

### 🟡 De-Emphasize (Don't Remove, But Stop Investing)

| # | What | Why | Action |
|---|------|-----|--------|
| **X-8** | Genius API fact engine | The "Pop-Up Video" fact display in the Jukebox is a nice-to-have for stream viewers but doesn't contribute to participant retention. It requires an external API key, adds API latency, and the mock fallback serves the same engagement purpose. | **Freeze.** Don't invest more in fact density or annotation depth. The current state is sufficient. |
| **X-9** | Geolocation display | Location badges ("📍 Austin, TX") next to usernames are interesting but don't drive return behavior. The API call adds latency to init. | **Keep but don't extend.** It's fine as-is. Don't build location-based features around it. |
| **X-10** | Sound effect palette expansion | 8 synthesized sound effects already cover all critical actions. Additional sounds (Double Points fanfare, etc.) add marginal engagement but development time is better spent on retention hooks. | **Freeze the palette.** Current sounds are sufficient. |

---

## Summary Matrix

| Category | Count | Top Priority Item |
|----------|-------|-------------------|
| **A) Retention Weaknesses** | 13 | R-1: 100% ephemeral state (no cross-session continuity) |
| **B) Missing Hooks** | 12 | H-5: "Add to Calendar" CTA (lowest effort, highest frequency impact) |
| **C) Re-Engagement Mechanics** | 6 channels | Post-Session Recap (transforms session end from void to anchor) |
| **D) 7-Day Activation Plan** | 16 tasks | Day 1: Calendar CTA + Session Recap + localStorage persist |
| **E) Remove/De-Emphasize** | 10 items | X-1: Remove "Are you a DJ?" onboarding step (dead code, zero UX impact) |

---

## The Core Retention Thesis

> **Crate Vote is a great party, but there's no morning after.**

The in-session engagement loop is genuinely strong — searching, adding, voting, watching rank shifts, earning karma, and chasing the #1 crown creates authentic excitement. The problem is that 100% of that excitement evaporates at session end.

**The minimum viable retention stack is:**

1. **📅 Calendar CTA** — So users don't forget (H-5, 30 min)
2. **📊 Session Recap** — So users feel closure, not abandonment (H-6, 2-3 hrs)
3. **🏠 Welcome-Back State** — So returning users feel recognized (H-7, 1-2 hrs)
4. **⭐ Persistent Karma** — So participation compounds over time (H-1, 1 hr)
5. **🗳️ Vote Refresh** — So users stay engaged past the first 5 minutes (H-9, 2-3 hrs)

These 5 features, totaling ~8 hours of work, would transform the retention posture from "brilliant one-night stand" to "relationship worth maintaining."
