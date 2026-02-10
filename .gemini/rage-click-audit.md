# 🔴 Rage-Click & Frustration Loop Audit — Crate Vote

**Audit Date:** 2026-02-09  
**Scope:** `app/page.tsx` (3,337 lines), `app/admin/page.tsx` (1,926 lines), `globals.css`

---

## 1. Vote Buttons Disabled With No Explanation

**Screen/Element:** Song row → `👎` / `👍` thumb buttons (lines 3257–3282)  
**Why users get mad:** When `canParticipate` is `false` (session not running, playlist locked, or user not logged in), both vote buttons are `disabled` but look nearly identical to their enabled state — just slightly dimmed. There is *zero* inline text explaining **why** the button won't work. Users tap repeatedly, nothing happens, they assume the app is broken.  
**Severity:** 🔴 **CRITICAL**  
**Fix:** Show a contextual tooltip or inline pill explaining the reason on first disabled tap — "Session hasn't started yet", "Voting is locked", or "Log in to vote."  
**Better UI copy:** `"⏸️ Voting opens when the session starts"` / `"🔒 Host locked voting"` / `"👤 Set your DJ name to vote"`  
**Instrumentation event:** `rage_click:vote_button_disabled` — payload: `{ reason: 'session_inactive' | 'locked' | 'no_username' | 'banned', songId, visitorId }`

---

## 2. "No Upvotes/Downvotes Remaining" — Punitive Error

**Screen/Element:** Vote handler (lines 1838–1841 / 1874–1877)  
**Why users get mad:** When a user exhausts their vote quota, clicking a vote button shows `setMessage({ type: 'error', text: 'No upvotes remaining!' })` — a brief red banner that auto-dismisses in 3 seconds. The user didn't do anything wrong; they just ran out. The message feels punitive and provides no next step. They'll tap again thinking it was a glitch.  
**Severity:** 🟠 **HIGH**  
**Fix:** Replace the error with an info-type toast that explains how to earn more votes (karma) and visually disable the specific vote type when quota is 0.  
**Better UI copy:** `"You've used all 10 upvotes! Earn +1 karma by staying active for 5 min or watching videos 🎧"`  
**Instrumentation event:** `vote_quota_exhausted` — payload: `{ voteType: 'up' | 'down', visitorId, remainingOther }`

---

## 3. Search Bar Vanishes Without Explanation

**Screen/Element:** Main search bar container (lines 3035–3099)  
**Why users get mad:** The entire search bar conditionally renders based on `canParticipate && permissions.canAddSongs && (songsRemaining > 0 || bonusSongAdds > 0)`. When the session isn't running, or adding is disabled by admin, the search bar simply *disappears*. There is a secondary disabled input (lines 3091–3098) **only** for the "used all song slots" state. All other states (session inactive, adding disabled, locked) show **nothing** — the user scrolls up looking for the search bar and can't find it.  
**Severity:** 🔴 **CRITICAL**  
**Fix:** Always render the search bar container; show a disabled placeholder with context: "Session not active — check back during the next session" or "🔒 Adding songs is paused by the host."  
**Better UI copy:** `"🎵 Song adding opens when the session goes live"` / `"🔒 The host paused new additions — vote on what's here!"`  
**Instrumentation event:** `search_bar_missing_impression` — payload: `{ reason: 'session_inactive' | 'adding_disabled' | 'locked', visitorId }`

---

## 4. "✓ Added" Badge Is Not a Button — Invisible Click Target

**Screen/Element:** Search results → `<span className="already-added">✓ Added</span>` (line 3074)  
**Why users get mad:** Songs already in the playlist show a `✓ Added` label in the search results. Users see it, interpret it as a clickable link (to scroll to that song in the playlist), and click it. Nothing happens. The entire `search-result-row` is only clickable when it's NOT in the playlist — once added, the row becomes inert but still *looks clickable* due to hover effects inherited from the parent.  
**Severity:** 🟡 **MEDIUM**  
**Fix:** Make the "Already Added" row scroll-to/highlight the song in the playlist on click, or add `cursor: not-allowed` and reduce opacity to clearly communicate non-interactivity.  
**Better UI copy:** `"✓ Already on the list — scroll down to find it"` (clickable, scrolls to song)  
**Instrumentation event:** `click:already_added_song` — payload: `{ trackId, visitorId }`

---

## 5. Search Dropdown Disappears on Blur (300ms Race)

**Screen/Element:** Search input `onBlur` (lines 3045, 2655, 2784, 2871)  
**Why users get mad:** The search results close after 300ms `setTimeout` on blur. If the user moves their finger/mouse slowly to a result, or on a laggy mobile device, the dropdown vanishes before they can tap it. They have to retype the search query. This is especially punishing on the small PiP docked search inputs.  
**Severity:** 🟠 **HIGH**  
**Fix:** Increase blur timeout to 400–500ms, or better yet use `onMouseDown` (already done) but add `onTouchStart` for mobile to prevent the race. Consider keeping the dropdown open until an explicit dismiss.  
**Better UI copy:** (No copy needed — this is a timing fix)  
**Instrumentation event:** `search_dropdown_blur_miss` — payload: `{ searchQuery, resultsCount, visitorId, inputSource: 'main' | 'pip' | 'docked' }`

---

## 6. Rate-Limit Toast Is Vague and Feels Like a Scolding

**Screen/Element:** Vote handler → 429 response (lines 1908–1911) and client-side cooldown (line 1778)  
**Why users get mad:** Two separate rate limits hit with different messages: (1) Client-side: `"Slow down! Wait a moment before voting again."` (2) Server 429: `"Slow down! Try again in ${retryAfter}s 🕐"`. Neither message tells the user *what the limit is*, making it feel arbitrary. Users who vote normally on 2-3 songs in quick succession can trigger the global 30-per-minute server limit and feel punished.  
**Severity:** 🟡 **MEDIUM**  
**Fix:** Unify messaging, show a small countdown timer on the button itself (disable + countdown), and explain the limit upfront: "1 vote per song every 3 seconds."  
**Better UI copy:** `"One vote per song every few seconds — keeps it fair for everyone 🎯"` / `"Cooling down... ready in 3s"`  
**Instrumentation event:** `rate_limit_hit` — payload: `{ type: 'client_cooldown' | 'server_429', retryAfter, songId, visitorId }`

---

## 7. Banned Banner — Vague and Blames the User

**Screen/Element:** `<div className="banned-banner">` (line 3030)  
**Why users get mad:** The banner reads: `"⚠️ Participation paused for this session. Resets next round. Tap ℹ️ in the header for help."` — But the ℹ️ button is hidden on mobile (per conversation history). So mobile users have *no way to get help*. The passive-aggressive phrasing ("Participation paused") without stating why is maddening.  
**Severity:** 🔴 **CRITICAL**  
**Fix:** Include a direct "Contact host" action in the banner itself. Explain the reason if possible ("A moderator paused your access"). Don't direct users to a button that doesn't exist on their viewport.  
**Better UI copy:** `"Your access was paused by a moderator for this session. You can still browse! It resets automatically next round. Questions? Reach out to the host on Twitch chat."`  
**Instrumentation event:** `banned_user_impression` — payload: `{ visitorId, isMobile, hasInfoButton: boolean }`

---

## 8. Onboarding Step 3 — Email Required But Poorly Communicated

**Screen/Element:** `handleOnboardingComplete` + Step 3 form (lines 2081–2127)  
**Why users get mad:** The "Let's Go! 🎉" submit button is disabled until a valid email is entered — but there's no inline validation hint. The `*` on the placeholder ("Email address *") is tiny and easy to miss. Users type their email, make a typo (e.g., `user@gmailcom`), and the button stays greyed out with NO feedback explaining why. They rage-click "Let's Go!" repeatedly.  
**Severity:** 🟠 **HIGH**  
**Fix:** Add real-time inline validation that shows a red hint *as the user types* when the email is invalid (after blur or after 2+ characters typed). Don't rely solely on button disable state as the feedback mechanism.  
**Better UI copy:** `"Hmm, that doesn't look like a valid email — double-check the format"` (shown under the input)  
**Instrumentation event:** `onboarding_email_validation_fail` — payload: `{ emailLength, hasAtSign, hasDot, visitorId }`

---

## 9. ▶ Play Button — Ambiguous Icon, Delayed Response, No Loading Context

**Screen/Element:** Play preview button per song row (lines 3237–3243)  
**Why users get mad:** The `▶` icon has no text label. Users don't know if it plays a preview, opens Spotify, or launches the Jukebox. When tapped, it fires a YouTube search API call (`/api/youtube-search`) which can take 1–3 seconds. During this time the button shows `⏳` but there's no loading bar, shimmer, or context — just an hourglass emoji replacing the play triangle. Users tap it again thinking the first tap didn't register, which toggles the jukebox off.  
**Severity:** 🟡 **MEDIUM**  
**Fix:** Add a `title` tooltip (already partially there: "Preview music video") but also add a loading shimmer/spinner around the album art. Prevent re-click during loading with a proper guard (the `isLoadingVideo` check exists but the UX feels dead during the wait).  
**Better UI copy:** Tooltip: `"Preview music video on YouTube"` / Loading state: `"Finding video..."`  
**Instrumentation event:** `play_preview_click` — payload: `{ songId, songName, loadTimeMs, result: 'found' | 'not_found' | 'error', visitorId }`

---

## 10. Vote Confirmation Only Shows 30% of the Time

**Screen/Element:** Vote success handler (lines 1916–1919)  
**Why users get mad:** After a successful vote, the app only shows a toast confirmation 30% of the time (`Math.random() < 0.3`). This means 70% of the time, the user votes and gets *zero feedback* beyond the brief optimistic score change (which animates so fast many users miss it). Users think their vote didn't count and vote again, hitting the rate limiter.  
**Severity:** 🟠 **HIGH**  
**Fix:** Always provide feedback — use the button state itself (brief color pulse, checkmark animation) rather than a toast. The toast can remain at 30% to reduce noise, but the button must always confirm the action.  
**Better UI copy:** (Visual: button briefly glows green/red for 500ms on vote | Rare toast: `"Nice pick! 👍"`)  
**Instrumentation event:** `vote_no_feedback_perceived` — payload: `{ songId, voteType, visitorId }` (track when user re-votes within 5s)

---

## 11. "⚙️" Admin Link — Not Obviously Clickable, Zero Context

**Screen/Element:** Header → `<Link href="/admin" className="admin-link-subtle">⚙️</Link>` (line 2460)  
**Why users get mad:** A lone gear emoji with no label sits in the header. Regular users don't know it's an admin link. Curious users tap it, get routed to a password-protected page, can't get in, and have to navigate back. Hidden on mobile (per prior UX fix), but on tablet/desktop it's a confusing untitled icon.  
**Severity:** 🟢 **LOW**  
**Fix:** Add `aria-label="Admin Panel"` and hide it for non-admin users via the `isAdminOnFrontPage` flag or store an `isAdmin` hint in localStorage.  
**Better UI copy:** (Should be invisible to non-admins entirely)  
**Instrumentation event:** `admin_link_click:non_admin` — payload: `{ visitorId, isAdmin: boolean }`

---

## 12. Prediction Modal — 10 Choices at Once, No Scroll Hint

**Screen/Element:** Prediction modal → `prediction-list` (lines 2947–2970)  
**Why users get mad:** The prediction modal presents up to 10 songs in a scrollable list inside a popup. On mobile, only 4–5 songs may be visible, with no visual affordance that more exist below. Users pick from only the visible songs, not realizing the full list. The song names are truncated at 25 characters (`song.name.slice(0, 25)`) which can make similar songs indistinguishable.  
**Severity:** 🟡 **MEDIUM**  
**Fix:** Add a "scroll for more ↓" indicator at the bottom of the visible area, or use a numbered list. Show artist names alongside song titles for disambiguation.  
**Better UI copy:** Bottom indicator: `"↓ Scroll for more options"` / Each option: `"Song Name — Artist • +5"`  
**Instrumentation event:** `prediction_modal_scroll_depth` — payload: `{ songsVisible, totalSongs, selectedIndex, visitorId }`

---

## 13. Purge Delete Button — Tiny Skull, No Undo, No Warning

**Screen/Element:** Song row → `<button className="chaos-delete-btn">💀</button>` (lines 3287–3296)  
**Why users get mad:** During The Purge, a small 💀 emoji button appears on each song. There is NO confirmation dialog — tapping it immediately deletes the song. Users who accidentally tap it (especially on mobile where rows are touch-dense) lose songs permanently. This is doubly frustrating when someone's *own* song gets purge-deleted by another user.  
**Severity:** 🟠 **HIGH**  
**Fix:** Add a "tap-and-hold" or "double-tap" pattern for destructive purge actions. Or show a 3-second "Undo" toast after deletion.  
**Better UI copy:** Pre-tap: `"💀 Hold to delete"` / Post-tap: `"Song removed! [UNDO - 3s]"`  
**Instrumentation event:** `purge_delete` — payload: `{ songId, songOwnerVisitorId, deleterVisitorId, wasOwnSong: boolean, undoUsed: boolean }`

---

## 14. Scroll Trap — Stream Embed Blocks Voting on Mobile

**Screen/Element:** YouTube/Twitch PiP mode → `.stream-host.pip-mode` (lines 2612–2704)  
**Why users get mad:** The PiP video embed sits fixed at the bottom-right of the viewport. On mobile, it overlaps the vote buttons on the last visible songs. Users try to vote and accidentally tap the video embed, which either navigates away or triggers the expand behavior. Prior UX audit (conversation `4624fddd`) identified this; partial fix applied but the PiP still competes for touch targets.  
**Severity:** 🟠 **HIGH**  
**Fix:** On mobile (`< 640px`), anchor the PiP to the top of the screen or make it dismissable with a single swipe. Ensure it never overlaps interactive song row elements.  
**Better UI copy:** (Make PiP show a clear "✕ close" button on mobile instead of requiring the expand/minimize dance)  
**Instrumentation event:** `pip_overlap_misclick` — payload: `{ intendedTarget: 'vote' | 'play' | 'song_row', actualTarget: 'pip_embed', visitorId, viewport: 'mobile' | 'tablet' }`

---

## 15. Profile Edit Modal — Can't Close Without Saving

**Screen/Element:** Profile edit overlay (lines 2134–2167)  
**Why users get mad:** The profile edit overlay has a "Cancel" button at the bottom, but no "✕" close button at the top and no backdrop-click-to-dismiss behavior. On the join overlay (first-time), there's also no way to close — users MUST complete onboarding. This is by design for onboarding, but the profile *edit* modal should be easily dismissible. Users who accidentally tap their profile pill get trapped.  
**Severity:** 🟡 **MEDIUM**  
**Fix:** Add a `✕` button in the top-right corner of the profile edit card. Allow clicking the backdrop overlay to dismiss.  
**Better UI copy:** `✕` button + backdrop dismiss behavior  
**Instrumentation event:** `profile_edit_abandon` — payload: `{ dismissMethod: 'cancel_btn' | 'backdrop' | 'close_btn' | 'escape_key', visitorId }`

---

## 16. Session Inactive — "Waiting for session..." Dead End

**Screen/Element:** Empty state when timer is not running (lines 3106–3136) + ticker placeholder (line 2995)  
**Why users get mad:** When no session is active, the ticker shows "Waiting for session..." and the empty playlist says "No live session right now." The user has no clear next action beyond the mailing list signup. There's no explanation of what a "session" is, when the next one starts (the broadcast countdown is in a separate bar that may scroll out of view), or what they can do in the meantime.  
**Severity:** 🟡 **MEDIUM**  
**Fix:** Consolidate the countdown prominently into the empty state. Add an "Explore recent sessions" or "Browse the last playlist" call-to-action so the page doesn't feel dead.  
**Better UI copy:** `"🕐 Next session starts in 2d 5h — Tuesdays at 8 PM ET. Drop your email below to get notified!"` (with countdown integrated into the empty state hero)  
**Instrumentation event:** `idle_page_bounce` — payload: `{ timeOnPage, visitorId, signedUpForNotify: boolean }`

---

## 17. "Export" Button — Disabled During Export With Only "..."

**Screen/Element:** Export inline button → `.export-inline-btn` (lines 3000–3008)  
**Why users get mad:** When clicked, the Export button changes text from "Export" to "..." and the page navigates to `/export`. If the redirect is slow, users see a disabled button with three dots and no context. The `isExporting` flag only gates the button but provides no progress or confirmation. If the Spotify OAuth fails or the redirect hangs, the user is stuck with a disabled button.  
**Severity:** 🟢 **LOW**  
**Fix:** Show "Opening Spotify..." with a spinner animation. Add a timeout that re-enables the button after 5 seconds if navigation hasn't completed.  
**Better UI copy:** `"Opening Spotify..." → after 5s: "Try again?"`  
**Instrumentation event:** `export_redirect` — payload: `{ loadTimeMs, visitorId, success: boolean }`

---

## 18. Stale Data Banner — "Retry" Resets State Optimistically

**Screen/Element:** Stale data indicator → `.stale-indicator` (lines 2436–2441)  
**Why users get mad:** The "⚠️ Offline" banner has a "Retry" button that immediately hides the banner (`setIsStale(false)`) and resets the failure counter *before* the retry fetch completes. If the network is still down, the banner reappears after the next 3 failed polls — creating a frustrating flash loop: Banner → Retry click → Banner disappears → Banner reappears in 45 seconds. Users feel gaslit.  
**Severity:** 🟡 **MEDIUM**  
**Fix:** Keep the banner visible during the retry fetch. Only dismiss it on a successful response (`consecutiveFailures` reset already happens in `fetchPlaylist` on success — just don't pre-reset it in the click handler).  
**Better UI copy:** Retry button changes to `"Retrying..."` with spinner. On success: `"Back online ✅"` (auto-dismiss after 2s). On fail: `"Still offline — we'll keep trying"`  
**Instrumentation event:** `stale_data_retry` — payload: `{ consecutiveFailures, retryResult: 'success' | 'fail', visitorId }`

---

## Summary Table

| # | Hotspot | Severity | Status |
|---|---------|----------|--------|
| 1 | Vote buttons disabled, no reason shown | 🔴 CRITICAL | ✅ FIXED — now shows toast explaining why |
| 2 | "No votes remaining" punitive error | 🟠 HIGH | ✅ FIXED — friendly info toast + karma hint |
| 3 | Search bar vanishes when session inactive | 🔴 CRITICAL | ✅ FIXED — always visible with contextual placeholder |
| 4 | "✓ Added" badge not clickable | 🟡 MEDIUM | ✅ FIXED — now scrolls to song in playlist |
| 5 | Search dropdown 300ms blur race | 🟠 HIGH | ✅ FIXED — increased to 450ms |
| 6 | Rate limit messages scold the user | 🟡 MEDIUM | ✅ FIXED — empathetic copy |
| 7 | Banned banner vague + dead-end on mobile | 🔴 CRITICAL | ✅ FIXED — no ℹ️ reference, directs to chat |
| 8 | Email validation silent fail | 🟠 HIGH | ✅ FIXED — inline validation hint appears |
| 9 | ▶ Play icon ambiguous + slow load | 🟡 MEDIUM | ✅ FIXED — better tooltip + "Finding..." text |
| 10 | Vote confirmation only 30% of time | 🟠 HIGH | ✅ FIXED — always confirms |
| 11 | ⚙️ admin icon visible to non-admins | 🟢 LOW | ⏭️ SKIP — gear icon is the admin login path |
| 12 | Prediction modal 10 choices, no scroll hint | 🟡 MEDIUM | ✅ FIXED — artist shown + scroll hint |
| 13 | Purge 💀 delete — no confirm, no undo | 🟠 HIGH | ✅ FIXED — double-tap to confirm |
| 14 | PiP video overlaps vote buttons on mobile | 🟠 HIGH | ✅ FIXED — PiP anchored to top on mobile |
| 15 | Profile edit modal not easily dismissible | 🟡 MEDIUM | ✅ FIXED — ✕ button + backdrop dismiss |
| 16 | Idle page dead end, no clear CTA | 🟡 MEDIUM | ✅ FIXED — explains sessions + countdown |
| 17 | Export "..." disabled state is cryptic | 🟢 LOW | ✅ FIXED — "Opening Spotify..." text |
| 18 | Stale banner retry flashes | 🟡 MEDIUM | ✅ FIXED — retry doesn't pre-reset state |

---

*CRITICAL items (1, 3, 7) should be fixed before the next live session. HIGH items (2, 5, 8, 10, 13, 14) should follow immediately after.*
