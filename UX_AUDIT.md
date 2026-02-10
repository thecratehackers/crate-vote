# 🔬 CRATE VOTE — UX AUDIT REPORT

**Auditor**: Senior UX Auditor & Product QA Lead  
**Date**: February 2026  
**Scope**: Full user-facing surface — onboarding, core voting, engagement features, mobile/tablet/desktop  
**Method**: Code review + live browser testing across 3 viewports (375px, 768px, 1440px)

---

## EXECUTIVE SUMMARY

Crate Vote is a **visually striking** application with a cohesive dark/amber design system and impressive feature density. However, the UX has accumulated significant friction from rapid feature additions. The result is a product that *looks* premium but *feels* overwhelming — especially on first visit and on mobile devices.

**Overall Grade: B-** (Great bones, needs polishing)

### Top 3 Critical Issues
1. **PiP Video blocks core voting buttons on mobile and tablet** — users literally cannot vote on songs 5-8
2. **3-step onboarding with mandatory email capture** creates a hard wall that will kill conversion
3. **Information overload in the header** — 12+ elements compete for attention in a single row

---

## 📋 SECTION 1: ONBOARDING FLOW

### What Works ✅
- Glassmorphism overlay showing live content behind the modal is excellent — creates FOMO and urgency
- Step dots (● ● ●) provide clear progress indication
- "What should we call you?" is warm, inviting copy
- Back buttons on every step allow recovery
- The DJ vs. Fan segmentation (Step 2) is smart for personalization and data capture

### Critical Issues 🔴

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| O-1 | **No skip/close button anywhere** in the 3-step flow. Users who just want to observe are completely locked out. | Immediate bounce for casual visitors | 🔴 Critical |
| O-2 | **Mandatory email capture (Step 3)** before any interaction. Email validation is `includes('@')` — accepts `a@b` as valid. | High friction + low data quality | 🔴 Critical |
| O-3 | **"Get on the Guest List" copy is misleading** — users think they're signing up for event access, not a marketing list | Trust erosion | 🟡 Moderate |
| O-4 | **No email format validation** beyond `@` symbol check. Phone field has no input masking or formatting | Bad data into Kartra, failed delivery | 🟡 Moderate |
| O-5 | **Step 2 "Are you a professional DJ?" feels like a gate**, not a question. Users may worry the "wrong" answer limits features | Anxiety, decision paralysis | 🟡 Moderate |

### Recommended Fixes

**O-1 Fix — Add a "Skip" option:**
```
Step 3: Add a subtle "Skip for now →" link below the submit button.
Allow users to participate with just a name. Capture email later via 
a non-blocking banner: "Want event invites? Add your email anytime."
```

**O-2 Fix — Proper email validation:**
```typescript
// Replace: !emailInput.includes('@')
// With: RFC-compliant check
const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput);
```

**O-3 Fix — Revised copy:**
```
Before: "Get on the Guest List"
After:  "Stay Connected"

Before: "Join the community! Get notified about events and exclusive music drops."
After:  "Get event reminders and early access to new features. No spam, ever."
```

**O-5 Fix — Softer framing:**
```
Before: "Are you a professional DJ?"
After:  "What's your vibe?"

Option 1: "🎧 I spin tracks" (subtext: "Any level — bedroom to main stage")
Option 2: "🎶 I discover music" (subtext: "I know what sounds good")
```

---

## 📋 SECTION 2: HEADER & NAVIGATION

### What Works ✅
- Sticky header keeps context always visible
- LIVE badge with timer creates urgency
- User pill with avatar personalization is excellent
- Custom tooltips are well-designed (appear below, dark glass style)

### Critical Issues 🔴

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| H-1 | **12+ elements in a single header row**: logo, settings ⚙️, info ℹ️, LIVE badge, timer, viewer count, songs remaining (🔥), upvotes (👍), downvotes (👎), karma (✨), playlist capacity (26/100), user pill | Cognitive overload, touch target conflicts | 🔴 Critical |
| H-2 | **Header wraps poorly on tablet (768px)** — stats and user pill collide | Layout breakage on iPad | 🔴 Critical |
| H-3 | **No clear hierarchy** between informational counters (👍 9, 👎 9) and actionable elements (user pill) | Users can't quickly scan their status | 🟡 Moderate |
| H-4 | **Playlist capacity "26/100"** has no label — new users won't know what this number means | Confusion | 🟡 Moderate |
| H-5 | **GOD MODE badge** (👑) appears inline with no explanation unless you hover. Tooltip says "Your song is #1!" but the crown emoji alone communicates nothing | Mystery meat | 🟢 Minor |
| H-6 | **Admin gear ⚙️ visible to all users** (desktop only). While it's discrete, it's still noise for non-admins | Minor clutter | 🟢 Minor |

### Recommended Fixes

**H-1 Fix — Consolidate the header into 2 clear zones:**
```
LEFT ZONE:  [Logo] [LIVE • 12:04 • 👁 19]
RIGHT ZONE: [🎵 5 left | 👍 9 | 👎 9] [26/100] [👤 Username ✏️]

• Collapse karma (✨) into a tooltip on the user pill
• Move the info ℹ️ rules behind a "?" help icon inside the playlist area
• Hide admin ⚙️ entirely for non-admins (it already links to /admin behind auth)
```

**H-4 Fix — Label the capacity pill:**
```
Before: 26/100
After:  🎵 26/100 songs  (with tooltip: "26 songs added, 100 max capacity")
```

---

## 📋 SECTION 3: CORE VOTING EXPERIENCE

### What Works ✅
- Vote buttons are intuitive (👍 / 👎 with score between)
- Active vote states (green glow for upvote, red for downvote) provide clear feedback
- Score display with +/- prefix is clear
- Rank movement animations (green flash for up, red for down) are excellent dopamine triggers
- "★ YOURS" badge on user's own songs is a nice personal touch
- Rank badges (👑, #2, #3 with gold/silver/bronze colors) are instantly readable

### Critical Issues 🔴

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| V-1 | **PiP video overlay blocks vote buttons for songs #5-8 on mobile** | Users physically cannot vote on ~4 songs | 🔴 Critical |
| V-2 | **No undo confirmation** — tapping 👍 then 👍 again silently removes the vote. Users may not realize their vote was removed | Accidental unvotes with no feedback | 🟡 Moderate |
| V-3 | **"★ YOURS" badge positioned with `position: absolute; right: 12px`** overlaps with vote buttons and purge buttons | Visual collision on cramped rows | 🟡 Moderate |
| V-4 | **Downvote button is same size and proximity as upvote** — no visual differentiation for a destructive action | Accidental downvotes, especially on mobile | 🟡 Moderate |
| V-5 | **Vote buttons show ⏳ during API call but no optimistic UI** — there's a visible delay before the score updates | Feels sluggish | 🟢 Minor |
| V-6 | **Songs all show score "0"** when session starts. No visual hint about what happens when you vote | New users confused about scoring mechanics | 🟢 Minor |

### Recommended Fixes

**V-1 Fix — PiP z-index and positioning:**
```css
/* On mobile (≤640px), reduce PiP size and add padding to song list */
@media (max-width: 640px) {
  .stream-host.pip-mode {
    width: 120px;        /* Drastically smaller */
    bottom: 70px;        /* Above thumb reach zone */
    opacity: 0.85;
  }
  
  .song-list-stream {
    padding-bottom: 140px; /* Safe zone below songs */
  }
}
```

**V-2 Fix — Toast on vote toggle:**
```
When removing a vote: Show subtle toast "Vote removed from [Song Name]"
When casting a vote: Flash the score number with a scale animation
```

---

## 📋 SECTION 4: SEARCH & SONG ADDITION

### What Works ✅
- Search bar is prominent and well-positioned
- "✓ Added" state clearly prevents duplicates
- Album art in search results aids recognition
- "+ ADD" CTAs are clear and actionable

### Issues 🟡

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| S-1 | **Search placeholder "🔍 Add a song..." has low contrast** on the white/light gray input background | Looks like a disabled field at first glance | 🟡 Moderate |
| S-2 | **Blur timeout (`onBlur`, 300ms)** to close results dropdown — if a user moves their mouse slowly, results disappear before they can click | Missed song additions | 🟡 Moderate |
| S-3 | **Duplicate search bar** exists in the docked chat panel — same `searchQuery` state controls both. Typing in one updates the other | Jarring shared state | 🟡 Moderate |
| S-4 | **No "no results" state** — if a search returns empty, the results panel just doesn't appear. User gets zero feedback. | Confusion: "Is it loading? Is it broken?" | 🟡 Moderate |
| S-5 | **Search only visible when `canAddSongs && canParticipate && songsRemaining > 0`** — when users have exhausted their song adds, the entire search bar vanishes with no explanation | "Where did the search go?" | 🟡 Moderate |

### Recommended Fixes

**S-4 Fix — Add empty state:**
```jsx
{showResults && searchResults.length === 0 && !isSearching && searchQuery.length > 2 && (
  <div className="search-dropdown-stream">
    <div className="search-empty">No songs found for "{searchQuery}" — try another search</div>
  </div>
)}
```

**S-5 Fix — Show disabled search with explanation:**
```jsx
// Instead of hiding completely, show disabled state:
<input disabled placeholder="You've added 5/5 songs — vote on existing ones!" />
```

---

## 📋 SECTION 5: MOBILE EXPERIENCE (375px)

### What Works ✅
- Play preview button correctly hidden on mobile (saves space)
- Broadcast bar appropriately condensed
- Admin controls hidden on mobile (good decluttering)
- Album art scales down nicely

### Critical Issues 🔴

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| M-1 | **PiP video covers half the viewport on scroll** — expanded mode goes full-width, pushing content and blocking votes | Unable to use the core feature | 🔴 Critical |
| M-2 | **Header stat counters overflow** on narrow phones — the user pill is squeezed to 120px max-width, stats are cramped at 4px gap | Touch misses, visual mess | 🔴 Critical |
| M-3 | **"★ YOURS" badge overlaps vote buttons** on mobile — the absolute-positioned badge collides with the right-aligned voting controls | Badge covers vote score | 🟡 Moderate |
| M-4 | **Activity ticker hidden on mobile** (`display: none`) — mobile users lose real-time social proof entirely | Reduced engagement | 🟡 Moderate |
| M-5 | **Song title and artist text can overflow** — no `text-overflow: ellipsis` applied to `.song-title` on mobile | Text runs into vote buttons | 🟢 Minor |

### Recommended Fixes

**M-1 Fix — Smart PiP behavior on mobile:**
```css
/* On mobile, PiP should be much smaller and dismissable */
@media (max-width: 640px) {
  .stream-host.pip-mode {
    width: 40vw;
    max-width: 160px;
    bottom: 16px;
    right: 8px;
    z-index: 999;
  }
  
  /* When expanded on mobile, add a close/minimize button */
  .stream-host.expanded-mode {
    max-height: 35vh; /* Don't consume more than 1/3 of screen */
  }
}
```

**M-3 Fix — Conditional YOURS badge on mobile:**
```css
@media (max-width: 640px) {
  .song-row-stream.my-song::after {
    /* Move to top-right corner instead of vertically centered right */
    top: 4px;
    right: 4px;
    transform: none;
    font-size: 0.55rem;
    padding: 2px 6px;
  }
}
```

---

## 📋 SECTION 6: TABLET EXPERIENCE (768px)

### Issues 🟡

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| T-1 | **Header elements collide** — "TabletTest" user pill nearly touches stat counters | Fat-finger errors | 🟡 Moderate |
| T-2 | **PiP video disproportionately large** at 300px on a 768px screen (39% of width) | Blocks right column of song rows | 🟡 Moderate |
| T-3 | **Game features bar** (Top DJs, Predict #1, Sound toggle) takes ~15% of viewport height with no content underneath | Wasted space pushing content below fold | 🟢 Minor |
| T-4 | **No tablet-specific media queries** — 768px falls between the 640px mobile and default desktop styles | Awkward in-between state | 🟡 Moderate |

---

## 📋 SECTION 7: ENGAGEMENT FEATURES

### What Works ✅
- Versus Battles with ErrorBoundary wrapper — good defensive coding
- Confetti celebrations for top-3 achievements are genuine delight
- Karma system creates secondary engagement loop
- Predictions feature adds gamification layer
- Sound effects toggle respects user preference

### Issues 🟡

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| E-1 | **5 different mega-announcement overlays** (Purge, Karma Rain, Wipe, Winner, Confetti) — if multiple fire simultaneously, they stack poorly | Visual chaos during high-activity moments | 🟡 Moderate |
| E-2 | **Winner announcement has a hardcoded promo code** ("HACKATHONWINNER") and a specific hat product image | Not scalable, looks broken between events | 🟡 Moderate |
| E-3 | **System tips rotate every 45 seconds** and inject into the toast queue as type `'add'` — mimics real user activity | Users may confuse system messages with real activity | 🟡 Moderate |
| E-4 | **Shoutout messages rotate every 7 seconds** — combined with 8-second toast lifespan and 45-second tips, the activity ticker is never calm | Information overload in the playlist header | 🟢 Minor |
| E-5 | **"THE PURGE" mechanic** uses a skull emoji 💀 with dramatic full-screen splash — may confuse or alarm users unfamiliar with the game | No pre-explanation of what Purge mode is | 🟡 Moderate |

---

## 📋 SECTION 8: ACCESSIBILITY

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| A-1 | **No ARIA labels on vote buttons** — screen readers will just say "button" | Inaccessible to blind/low-vision users | 🟡 Moderate |
| A-2 | **Emoji-only content** in many places (💀, ⏳, ▶, ✕) without text alternatives | Screen readers read "skull" not "delete song" | 🟡 Moderate |
| A-3 | **Color-only score indicators** — positive (green) vs. negative (red) scores rely solely on color | Not perceivable by color-blind users (red-green) | 🟡 Moderate |
| A-4 | **Overlay modals lack focus trapping** — Tab key can reach elements behind the modal | Keyboard navigation broken during onboarding | 🟡 Moderate |
| A-5 | **No skip-to-content link** | Keyboard users must tab through entire header to reach song list | 🟢 Minor |
| A-6 | **`@media (prefers-reduced-motion: reduce)` exists** but only covers some animations — mega-announcements, karma rain, etc. still animate fully | Accessibility policy partially implemented | 🟡 Moderate |

---

## 📋 SECTION 9: TRUST & POLISH

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| P-1 | **"Export to Spotify" button** has no indication it's a full page redirect (`window.location.href = '/export'`) — page appears to "crash" | Jarring navigation | 🟡 Moderate |
| P-2 | **Error state wipes songs to empty array** `setSongs([])` — a temporary network blip removes the entire visible playlist | Catastrophic visual failure for a transient error | 🟡 Moderate |
| P-3 | **Broadcast countdown** ("NEXT HACKATHON 1D 6H 42M") appears even when a session IS running. Conflicting with the LIVE badge | Two conflicting time signals | 🟡 Moderate |
| P-4 | **Chat docked panel** renders a second Twitch chat iframe — 2 simultaneous iframe embeds for the same channel | Performance waste, potential sync issues | 🟢 Minor |
| P-5 | **15-second polling interval** with 5-second jitter — on mobile cellular networks, this creates constant background data usage | Battery/data drain on mobile | 🟢 Minor |

---

## 📋 SECTION 10: REVISED COPY SUGGESTIONS

| Location | Current Copy | Suggested Copy | Rationale |
|----------|-------------|----------------|-----------|
| Onboarding Step 1 title | "Welcome to the Hackathon 🎧" | "Welcome to Crate Vote 🎧" | "Hackathon" is jargon for non-DJ users |
| Onboarding Step 1 subtitle | "The future of music curation starts here. Collaborate live with DJs worldwide." | "Pick the tracks. Cast your vote. Shape the playlist — live." | Action-oriented, explains what they'll DO |
| Onboarding Step 3 title | "Get on the Guest List" | "Stay in the Loop" | Less transactional, more inviting |
| Onboarding Step 3 subtitle (fan) | "Join the community! Get notified about events and exclusive music drops." | "We'll let you know when the next session goes live. No spam." | Specific value prop + trust signal |
| Empty playlist (session active) | "No songs yet!" | "Be the first to drop a track 🔥" | Creates urgency and action |
| Empty playlist (no session) | "Waiting for session..." | "The next session starts soon — hang tight!" | Warmer, with implied action |
| Search placeholder | "🔍 Add a song..." | "Search any song on Spotify..." | Explains what the search does and where data comes from |
| Rules popover items | "Add up to 5 songs" | "🔥 Drop up to 5 songs on the playlist" | Matches the brand energy |
| Rules popover items | "10 upvotes & 10 downvotes" | "👍 10 upvotes + 👎 10 downvotes to shape the outcome" | Explains the *why* |
| Banned banner | "🚫 You've been banned from this session" | "⚠️ Your participation has been paused for this session" | Less hostile, same message |

---

## 🎯 PRIORITIZED FIX LIST

### P0 — Fix Before Next Session (Blocking)
1. **PiP video blocking votes on mobile** [V-1, M-1] — Reduce PiP size, add padding
2. **Header overflow on mobile/tablet** [H-1, H-2, M-2] — Consolidate stats
3. **Error state wipes playlist** [P-2] — Don't clear `songs` on network error, show stale data with retry banner

### P1 — Fix This Week (High Impact)
4. **Add "Skip" option to onboarding Step 3** [O-1] — Let users in without email
5. **Email validation** [O-2] — Proper regex, not `includes('@')`
6. **Search "no results" state** [S-4] — Show feedback when search finds nothing
7. **"★ YOURS" badge overlapping votes** [V-3, M-3] — Position fix for mobile
8. **ARIA labels on vote buttons** [A-1] — `aria-label="Upvote [Song Name]"`

### P2 — Fix This Sprint (Quality)
9. **Revised onboarding copy** [O-3, O-5] — Softer DJ question, transparent email messaging
10. **Label the capacity pill** [H-4] — "🎵 26/100 songs"
11. **Disabled search state** [S-5] — Show disabled input with explanation when songs exhausted
12. **Vote toggle feedback** [V-2] — Toast on unvote
13. **Reduce system tip frequency** [E-4] — From 45s to 90s, reduce shoutout rotation to 15s

### P3 — Polish (Delight)
14. **Focus trapping in modals** [A-4]
15. **Optimistic vote UI** [V-5]
16. **Tablet-specific breakpoint** [T-4] — Add `@media (max-width: 1024px)` styles
17. **prefers-reduced-motion** coverage for all animations [A-6]
18. **Export button visual style** — Green pill feels disconnected, use amber/brand color

---

## 📸 APPENDIX: SCREENSHOTS

- **Desktop (1440px)**: Initial load with onboarding overlay ✅
- **Mobile (375px)**: Main app after onboarding ✅ — PiP blocking confirmed
- **Mobile (375px)**: Scrolled view ✅ — Video expanded takes over entire viewport
- **Tablet (768px)**: Main app ✅ — Header cramped, PiP disproportionate

---

*End of audit. Ready to implement P0 fixes on your signal.*
