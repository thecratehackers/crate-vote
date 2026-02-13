# 🚀 7-Day Retention Sprint — Crate Vote Jukebox
**Sprint Start:** 2026-02-13 (Thursday)
**Sprint End:** 2026-02-19 (Wednesday)
**North Star:** Average session duration, 24h return rate, 7d return rate

---

## 📊 Baseline Estimates (Pre-Sprint)
| Metric | Est. Baseline | Target (End of Sprint) |
|--------|--------------|----------------------|
| Avg session duration | ~5-7 min | 15+ min |
| 24h return rate | ~0% (off-peak dead) | 10%+ |
| 7d return rate | ~25-35% | 50%+ |
| Chat interaction rate | Low | 2x current |
| Pages/screens per session | ~1.5 | 3+ |

---

## Day 1 (Thu 2/13): 🎯 Kill Vote Exhaustion + Session Progress Bar
**Goal:** Eliminate the #1 engagement cliff — users run out of actions in 3-5 min.

### Ship: Vote Refresh + Session Progress Indicator
- **Vote Refresh Mechanic:** Every 15 min of active timer, restore 2 upvotes + 2 downvotes. Announce with a celebration micro-banner: "🗳️ Vote Refresh! +2 votes unlocked."
- **Session Progress Bar:** Lightweight visual bar showing session progress (not just a timer). Segments: "Opening → Voting → Final Push → Results". Gives users temporal context and creates urgency as phases advance.

### Experiment: Before/After
- **Before:** Users exhaust votes in ~3-5 min. Post-exhaustion, only passive watching.
- **After:** Users get vote refreshes, creating 3-4 re-engagement peaks per session.
- **Metric:** Compare pre-vote-exhaustion engagement time (actions/min) vs. post-refresh engagement time.

### End of Day Report:
- **Change shipped:** Vote refresh (timed) + progress indicator
- **Metric affected:** Avg session duration, actions per session
- **Early signal:** Do users cast refreshed votes within 60s of refresh announcement?
- **Decision:** Keep / revise interval

---

## Day 2 (Fri 2/14): 🏠 "Your Unfinished Business" Re-Entry Hook
**Goal:** Give returning users a reason to come back even when no session is live.
> **Note:** Email is REQUIRED for onboarding (skip button removed). Phone remains optional/skippable.

### Ship: Persistent Karma + Session Streak Counter
- **All-Time Karma:** Increment a permanent `allTimeKarma:{visitorId}` Redis key alongside session karma. NOT cleared by `resetSession()`. Show on user pill tooltip.
- **Attendance Streak:** Track consecutive sessions attended (5+ min present). Show "🔥 3-session streak" badge on user pill. Breaks after 2 missed Tuesdays. Stored in localStorage + Redis backup.
- **Welcome-Back Enhancement:** Show all-time karma + streak on the welcome-back card.

### Experiment: Before/After
- **Before:** Returning users see generic welcome-back stats from LAST session only.
- **After:** Users see cumulative progress (all-time karma, streak count).
- **Metric:** 7d return rate, time-on-page for off-peak visits.

---

## Day 3 (Sat 2/15): 🎮 Social Momentum Loops
**Goal:** Make other users' actions visible and create FOMO-driven session hooks.

### Ship: Enhanced Live Activity Feed + "Your Song is Moving" Notifications
- **In-Session Push Alerts:** When a user's song moves into Top 5 or Top 3, show a prominent in-app banner: "🚀 Your song 'Intergalactic' just hit #3!"
- **Social Pulse Widget:** Replace the faint leaderboard toggle with an always-visible "Top 3 DJs" mini-widget in the sidebar showing live contributor rankings. Updates in real-time.
- **"X people just voted" social proof:** Brief pulsing counter on active sessions.

### Experiment: A/B (Feature Flag)
- **A (control):** Current live activity toast behavior.
- **B (treatment):** Enhanced push alerts + social pulse widget.
- **Metric:** Actions per session, time between last action and session end.

---

## Day 4 (Sun 2/16): 🏆 First Win Acceleration (Onboarding 2.0)
**Goal:** Get every new user to their first "win" moment in under 90 seconds.

### Ship: Guided First Session Flow
- **Smart First-Song Suggestion:** After onboarding, instead of empty search bar, show 3-5 "Popular right now" song suggestions that the user can one-tap add. These are pulled from the current session's trending searches or default popular tracks.
- **"Your First Move" Coach Sequence:** After first song add, immediately highlight a highly-voted song: "Vote on this track — top songs win prizes! 👍"
- **Micro-Win Celebration:** When user's first song gets ANY upvote, trigger a personal celebration: "Someone liked your pick! 🔥"

### Experiment: Before/After
- **Before:** ~60s time-to-value, user-driven search required.
- **After:** ~30s time-to-value, guided path to first dopamine hit.
- **Metric:** Time to first action, time to second action, 1-session completion rate.

---

## Day 5 (Mon 2/17): 📤 Share Loop + Winner Virality
**Goal:** Turn session results into organic acquisition.

### Ship: Social Share Card + Winner Moment
- **Share Your Win:** At session end, winners and Top 3 finishers get a share button: "Share Your Result" → copies formatted text: "My song [Track] hit #1 at @CrateHackers! 🏆 Join the next vote → cratehackathon.com"
- **Personal Playlist Export ("My Picks"):** Add an option to export ONLY your songs + songs you upvoted. Personal artifact > generic playlist.
- **OG Share Image:** Generate an Open Graph preview image for shared links showing the winning song + session stats.

### Experiment: Before/After
- **Before:** Only full-playlist export. No social share.
- **After:** Personal export + share button on recap.
- **Metric:** Share button click rate, new visitors from shared links (UTM-tagged).

---

## Day 6 (Tue 2/18): 📡 Session Day — Full Integration Test
**Goal:** Live-test all 5 days of improvements during the actual Tuesday session.

### Ship: Session Archive + Pre-Hype State
- **Session Archive:** On session end, snapshot top 10 songs, winner, leaderboard king, participant count to Redis `sessions:archive:{date}`. Renders on waiting screen as "Past Sessions."
- **Pre-Session Hype:** If countdown < 24h, enhance waiting screen with pulsing "TONIGHT" badge + theme preview (if admin has set one).
- **Admin "Next Theme" Input:** Text field in Admin Tools to set next session's theme. Displays on waiting screen.

### Experiment: Live Observation
- All sprint changes active during live session.
- Monitor: session duration distribution, vote refresh utilization, streak display engagement.
- Post-session: compare recap shares vs. previous sessions.

---

## Day 7 (Wed 2/19): 🔧 Measure, Decide, Lock
**Goal:** Analyze all signals from Tuesday's live session. Make keep/revise/rollback calls.

### Ship: Analytics Dashboard Snapshot
- Compile all metric deltas from the sprint.
- Document which changes to keep permanently.
- Identify the top 3 next priorities for the following sprint.
- Lock the "retention stack" configuration.

### Sprint Retrospective Template:
| Change | Metric Affected | Signal | Decision |
|--------|----------------|--------|----------|
| Vote Refresh | Session duration | ? | Keep / Revise / Rollback |
| Persistent Karma | 7d return | ? | Keep / Revise / Rollback |
| Social Pulse Widget | Actions/session | ? | Keep / Revise / Rollback |
| First-Win Acceleration | Time-to-value | ? | Keep / Revise / Rollback |
| Share Loop | New visitors | ? | Keep / Revise / Rollback |
| Session Archive | Off-peak engagement | ? | Keep / Revise / Rollback |

---

## Guardrails Checklist ✅
- [ ] No fake urgency or dark patterns
- [ ] All new UI elements tested on mobile (375px)
- [ ] Cognitive load reduced or unchanged by each change
- [ ] Sound effects respect existing mute preference
- [ ] All new Redis keys documented and not cleared by `resetSession()` (where persistent)
- [ ] Production deployment verified after each daily ship
