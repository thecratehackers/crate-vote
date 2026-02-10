# 📱 Crate Vote — Responsive Design Audit

**Auditor:** Antigravity  
**Date:** February 2026  
**Status:** ✅ ALL 19 FIXES IMPLEMENTED — Build verified clean  
**CSS Files Reviewed:** `globals.css` (12,277 lines), `JukeboxPlayer.css` (1,640 lines), `VersusBattle.css` (256 lines), `VideoPreview.css` (210 lines), `Toast.css`, `Skeleton.css`  
**Component Files Reviewed:** `page.tsx` (3,402 lines), all components in `/components`

---

## Table of Contents

1. [Breakpoint Map](#1-breakpoint-map)
2. [Critical Issues (P0)](#2-critical-issues-p0)
3. [High-Severity Issues (P1)](#3-high-severity-issues-p1)
4. [Medium-Severity Issues (P2)](#4-medium-severity-issues-p2)
5. [Low-Severity Issues (P3)](#5-low-severity-issues-p3)
6. [Device-Specific Findings](#6-device-specific-findings)
7. [Recommended Breakpoints & Layout Rules](#7-recommended-breakpoints--layout-rules)
8. [Component-Level Fix Guide](#8-component-level-fix-guide)
9. [Responsive QA Checklist for Engineers](#9-responsive-qa-checklist-for-engineers)

---

## 1. Breakpoint Map

### Currently Used Breakpoints

| Breakpoint | Usage Count | Components |
|---|---|---|
| `max-width: 1024px` | 3 | Jukebox dashboard sidebar hide, stream header tablet, stat counters |
| `max-width: 768px` | 11 | Admin controls, admin playlist, chaos banner, activity feed, Jukebox overlays/idle |
| `max-width: 640px` | 21 | **Primary mobile breakpoint** — stream header, song rows, search, voting, PiP, onboarding, etc. |
| `max-width: 480px` | 4 | Song rows (legacy), RSVP form, stat counters, VersusBattle, VideoPreview |
| `max-width: 400px` | 1 | Ultra-small PiP shrink |
| `min-width: 641px` | 1 | Desktop docked chat width |
| `prefers-reduced-motion` | 1 | Animation suppression |

### ⚠️ Breakpoint Inconsistency Problem

The codebase uses **five** different max-width breakpoints **without a consistent system**. The dominant mobile breakpoint is `640px`, but several legacy sections still use `768px` (tablet) or `480px` (small mobile) instead of following a unified cascade. This causes:

- **Gap zones** at 641–768px where tablet-specific styles may not fire
- **Double-targeting** where both `768px` and `640px` queries apply to the same component
- **Missing coverage** for the increasingly common 360px–375px phone width range

### Recommended Canonical Breakpoints

```
$phone-small:  400px   // SE, Galaxy S mini
$phone:        640px   // Standard phones (current primary)
$tablet:       768px   // iPad mini, small tablets
$desktop:     1024px   // iPad Pro landscape, small laptops
$desktop-lg:  1280px   // Standard desktop
```

---

## 2. Critical Issues (P0)

### P0-1: Conflicting PiP Position Rules (Mobile)

**What:** The PiP stream host has **two competing position declarations** for mobile:

```css
/* Line 11503 — max-width: 640px */
.stream-host.pip-mode {
    bottom: 80px; right: 8px;
}

/* Line 12259 — max-width: 640px (rage-click fix) */
.stream-host.pip-mode {
    top: 8px !important;
    bottom: auto !important;
    right: 8px !important;
}
```

**Impact:** Because the second rule uses `!important`, it wins. Then a separate `max-width: 400px` rule (line 11591) tries to set `bottom: 70px; right: 6px;` — but these `bottom` rules are voided by the `!important bottom: auto`. On phones ≤400px, PiP gets stuck top-right at its `!important` position and cannot be adjusted.

**Fix:** Remove the `!important` overrides and consolidate into a single mobile rule:

```css
@media (max-width: 640px) {
    .stream-host.pip-mode {
        top: 8px;
        bottom: auto;
        right: 8px;
        width: 35vw;
        max-width: 140px;
        z-index: 90;
    }
}

@media (max-width: 400px) {
    .stream-host.pip-mode {
        width: 30vw;
        max-width: 120px;
    }
}
```

### P0-2: Header Overflow on 320–375px Screens

**What:** The `.stream-header` wraps items on mobile (640px), but the right section (`.header-right`) is limited to `max-width: 60%`. Combined with:
- User pill (`max-width: 90px`)
- LIVE badge
- Stat pills (capacity, etc.)
- Stat counters (songs/upvotes/downvotes/karma)

On a 320px screen (iPhone SE), the header easily exceeds horizontal bounds, causing horizontal scroll.

**Screenshot-level description:** On iPhone SE (320px), the header row clips. The stat counters and user pill push into a second wrapped row, but the `flex-wrap: wrap` only applies to `.stream-header`, not to `.header-right`, causing its children to overflow to the right. The user sees a horizontal scrollbar appear.

**Fix:**
```css
@media (max-width: 400px) {
    .header-right {
        max-width: 100%;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .stat-counter {
        display: none; /* hide individual stat counters on ultra-small */
    }

    .user-pill {
        max-width: 70px;
    }
}
```

### P0-3: Keyboard Overlap on Search Input

**What:** The `.search-bar-container` is not sticky and lives in the normal flow. When a mobile user taps on `.search-input-stream`, the virtual keyboard (typically ~260px tall) pushes the viewport up. The search dropdown (`.search-dropdown-stream`) is positioned `absolute` with `top: calc(100% + 4px)`. On small phones, this means:

1. Keyboard opens → viewport shrinks
2. Dropdown renders below input → falls below the keyboard fold
3. User cannot see search results

**Impact:** First-time users who search for a song on mobile literally cannot see any results.

**Fix:** Either:
- Make the search container sticky at the top when the keyboard is open (using `position: sticky`)
- Or use `position: fixed` for the dropdown on mobile and place it above the input:

```css
@media (max-width: 640px) {
    .search-dropdown-stream {
        position: fixed;
        top: auto;
        bottom: 0;
        left: 0;
        right: 0;
        max-height: 50vh;
        overflow-y: auto;
        border-radius: 12px 12px 0 0;
        z-index: 200;
    }
}
```

---

## 3. High-Severity Issues (P1)

### P1-1: Thumb-Button Tap Targets Below Minimum

**What:** The `.thumb-btn` (vote buttons) are `32px × 32px` on desktop, reduced to `30px × 30px` on mobile (640px). Apple's HIG recommends **44px minimum** and Google Material recommends **48dp**. These buttons are the primary interaction on the app.

**Impact:** Misclicks are common when voting, especially on crowded song rows. Users may accidentally tap the wrong vote button or miss entirely.

**Fix:**
```css
@media (max-width: 640px) {
    .thumb-btn {
        width: 40px;
        height: 40px;
        font-size: 1.1rem;
    }
}
```

### P1-2: Song Row Title Truncation — No Way to See Full Title

**What:** `.song-title` uses `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` at every breakpoint. On mobile the font is reduced to `0.85rem`. Long song titles like "Bohemian Rhapsody - 2011 Remaster" show as "Bohemian Rha…" with no tooltip, expansion, or alternative.

**Impact:** Users can't distinguish between similar songs. If two tracks by the same artist are listed, the truncation may hide the only differentiating words.

**Fix:** Allow 2-line wrap on mobile instead of truncation:

```css
@media (max-width: 640px) {
    .song-title {
        white-space: normal;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
}
```

### P1-3: Docked Twitch Chat Panel Covers Vote Buttons

**What:** `.docked-chat-panel` is `position: fixed; bottom: 0;` with a chat iframe height of `280px` (desktop) / `220px` (mobile). When active on mobile, it covers the bottom ~40% of the song list. Since vote buttons are inline on each row, users scrolled to the bottom can't vote.

Additionally, `.song-list-stream` has `padding-bottom: 100px` for PiP safe zone but **no safe zone for docked chat**.

**Fix:**
```css
/* When docked chat is active, add extra bottom padding */
.song-list-stream.chat-docked {
    padding-bottom: 280px;
}

@media (max-width: 640px) {
    .song-list-stream.chat-docked {
        padding-bottom: 240px;
    }
}
```

### P1-4: Versus Battle Stacks Songs Vertically but with Broken Ordering

**What:** The `globals.css` Versus Battle mobile override (line 7852) uses `!important` on `grid-template-columns: 1fr !important;` and then re-orders children with `order`. However, the actual `VersusBattle.tsx` component uses different class names (`.battle-arena` with `.battle-song`, `.battle-vs`), and the globals override targets `.versus-battle-banner > div:nth-child(2)` selectors — which depend on the exact DOM structure and break silently if ANY wrapper element changes.

**Impact:** On some renders, Song B appears above Song A, or the VS divider appears at the top instead of between songs.

**Fix:** Move the responsive override logic into `VersusBattle.css` using proper class selectors:

```css
@media (max-width: 640px) {
    .battle-arena {
        grid-template-columns: 1fr;
        gap: 8px;
    }

    .battle-vs {
        order: -1;
    }

    .battle-album-art {
        width: 50px;
        height: 50px;
    }
}
```

### P1-5: Expanded Stream Video Clips Content on Small Phones

**What:** `.stream-host.expanded-mode` on mobile gets `max-height: 35vh`. On a phone with a small viewport (e.g. 667px tall iPhone SE), 35vh = ~233px. The stream host header (~36px) + video (16:9 ratio needs ~233px for 414px width) = ~269px total. The content overflows its `max-height` and gets clipped via `overflow: hidden`.

**Fix:**
```css
@media (max-width: 640px) {
    .stream-host.expanded-mode {
        max-height: 40vh;
        overflow: visible; /* or auto */
    }
}
```

---

## 4. Medium-Severity Issues (P2)

### P2-1: Activity Feed Overlaps Song List on Tablet

**What:** `.activity-feed` is `position: fixed; top: 80px; right: 20px;` on desktop. On mobile (768px), it moves to `bottom: 20px; left: 10px; right: 10px; max-width: 100%`. However, between 769px and 1024px (tablet portrait), the activity feed stays at desktop position — top-right, `max-width: 280px` — and overlaps the song list and vote buttons.

**Fix:**
```css
@media (max-width: 1024px) {
    .activity-feed {
        top: auto;
        bottom: 16px;
        right: 16px;
        left: auto;
        max-width: 250px;
    }
}
```

### P2-2: Prediction Modal Not Dismissible by Backdrop Tap

**What:** `.prediction-modal` is rendered at `max-width: 400px; width: 90%;` inside a modal overlay, but only has a text "Cancel" button inside it. The backdrop (overlay) does not respond to clicks. On mobile, if the modal is tall (many songs), users may not see the Cancel button and are trapped.

**Fix:** Add backdrop click handler in TSX, and also add a visible close X button at the top of the modal (reuse `.modal-close-x` pattern already defined in rage-click fixes).

### P2-3: Leaderboard Grid Breaks at 641–768px

**What:** `.leaderboard-grid` uses `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` on desktop, and collapses to `1fr 1fr` on 640px. At 641–768px, `auto-fit` with `minmax(180px)` may produce 3 skinny columns where content wraps oddly.

**Fix:**
```css
@media (max-width: 768px) {
    .leaderboard-grid {
        grid-template-columns: 1fr 1fr;
    }
}
```

### P2-4: Admin Tabs on Mobile Have Tiny Font

**What:** `.admin-tab .tab-label` shrinks to `font-size: 0.6rem` on mobile (640px). Combined with `padding: 8px 4px`, these tab labels are essentially unreadable on phones.

**Fix:** Hide text labels on mobile, rely on icon-only tabs:
```css
@media (max-width: 640px) {
    .admin-tab .tab-label {
        display: none;
    }

    .admin-tab .tab-icon {
        font-size: 1.3rem;
    }
}
```

### P2-5: No `overscroll-behavior` or `overflow-x: hidden` on Body

**What:** The body/root element has no explicit `overflow-x: hidden` or `overscroll-behavior: none`. Any single element that accidentally overflows (e.g., the header on small screens) creates a full-page horizontal scroll. This is the root cause of horizontal scroll bugs.

**Fix:**
```css
html, body {
    overflow-x: hidden;
    overscroll-behavior-x: none;
}
```

### P2-6: Join/Onboarding Overlay Has No Scroll on Small Phones

**What:** The 3-step onboarding flow (`.dj-signup-gate`) maxes at `440px` width but has no `max-height` or scroll. On an iPhone SE in landscape (568×320 viewport), the form fields + event info + checkbox + button can exceed viewport height, pushing the submit button off-screen.

**Fix:**
```css
@media (max-height: 600px) {
    .dj-signup-gate {
        max-height: 90vh;
        overflow-y: auto;
    }
}
```

---

## 5. Low-Severity Issues (P3)

### P3-1: QR Code Corner Hidden Behind PiP on Mobile

The `.qr-code-corner` is `position: fixed; bottom: 20px; left: 20px;` — same corner as where the PiP could potentially be, though PiP is bottom-right/top-right. Not a collision currently, but on landscape narrow phones they could overlap.

### P3-2: "★ YOURS" Badge Adds `padding-top: 16px` on Mobile

The `.song-row-stream.my-song` gets extra `padding-top: 16px` on mobile to accommodate the absolute-positioned "★ YOURS" badge. This makes the user's own song rows visually taller than others, which looks inconsistent in the list.

### P3-3: Coach Mark Tooltip (`bottom: -40px`) Can Clip Off-Screen

If the search bar is near the bottom of the viewport, the coach mark tooltip appears below it and may be clipped by the viewport edge. Should use `top` positioning when near bottom.

### P3-4: Broadcast Bar Wrapping on Small Phones

`.broadcast-bar` uses `flex-wrap: nowrap` (implicit). The text + countdown + schedule may exceed width on 320px screens. Should add `flex-wrap: wrap; justify-content: center;` in the 400px query.

### P3-5: Chaos Banner Delete Buttons are 44px (Good) but Too Close Together

`.chaos-delete-btn` is 44px × 44px on desktop, 38px × 38px on mobile (768px). However, when rendered in every song row, there's only 4px gap between rows. Accidental adjacent-button taps are likely.

---

## 6. Device-Specific Findings

### iPhone SE (320×568 / 375×667)

| Area | Status | Notes |
|---|---|---|
| Header | 🔴 Overflows | Stat counters push layout wider than viewport |
| Search | 🟡 Usable but keyboard issue | Results lost behind keyboard |
| Song rows | 🟢 OK | Tight but functional |
| Vote buttons | 🟡 Small | 30px too small for reliable thumb taps |
| PiP video | 🟢 OK after rage-click fix | Moved to top-right, no longer blocks votes |
| Onboarding | 🟡 Tight | Step 3 (email + phone) may not fit in viewport |

### iPhone 14 Pro (390×844)

| Area | Status | Notes |
|---|---|---|
| Header | 🟢 OK | Wraps cleanly at 640px |
| Search | 🟡 Keyboard issue | Same dropdown-behind-keyboard problem |
| Song rows | 🟢 Good | Good density |
| Vote buttons | 🟡 Small | 30px borderline |
| PiP video | 🟢 OK | |

### iPad Mini (768×1024)

| Area | Status | Notes |
|---|---|---|
| Header | 🟢 OK | Tablet header tight but functional |
| Song rows | 🟢 Good | Adequate space |
| Admin controls | 🟡 Collapsed | `flex-direction: column` at 768px |
| Jukebox sidebars | 🔴 Hidden | Sidebars hidden at 1024px — loses leaderboard/queue on iPad |
| Activity feed | 🟡 Overlaps | Fixed top-right at tablet size |

### iPad Pro (1024×1366)

| Area | Status | Notes |
|---|---|---|
| All areas | 🟢 Good | Operates at desktop breakpoint |
| Jukebox | 🟡 Borderline | Sidebars hide at exactly 1024px |

### Galaxy Fold (280×653 folded)

| Area | Status | Notes |
|---|---|---|
| Everything | 🔴 Broken | No breakpoint < 400px handles 280px width. Header, search, song rows all overflow. |

---

## 7. Recommended Breakpoints & Layout Rules

### Adopted Breakpoint System

```css
/* ═══════════════════════════════════════
   RESPONSIVE SYSTEM — Canonical Breakpoints
   ═══════════════════════════════════════ */

/* Phone small (Galaxy Fold outer, iPhone SE) */
@media (max-width: 400px) { /* Emergency compaction */ }

/* Phone standard (primary mobile) */
@media (max-width: 640px) { /* Full mobile layout */ }

/* Tablet portrait */
@media (max-width: 768px) { /* Tablet adjustments */ }

/* Tablet landscape / small desktop */
@media (max-width: 1024px) { /* Sidebar collapses */ }

/* Desktop (default — no query needed) */
```

### Layout Rules

1. **Mobile-first principle**: Default styles should be mobile. Desktop enhancements via `min-width` queries. Current approach is desktop-first, which is fine *but must be consistent*.

2. **No horizontal overflow — ever**:
   ```css
   html, body { overflow-x: hidden; overscroll-behavior-x: none; }
   ```

3. **Minimum tap target: 44px × 44px** for any interactive element.

4. **Font floor: 0.7rem** minimum for any readable text.

5. **Safe zones**: Every `position: fixed` element must have a corresponding `padding-bottom` or `padding-top` on the main scrollable content.

6. **No `!important` for responsive overrides** — use specificity or source order.

7. **`max-height` + `overflow-y: auto`** on all modals and dropdowns.

---

## 8. Component-Level Fix Guide

### `globals.css` — Stream Header

**Lines 7325–7503** (640px mobile block)

| Fix | Priority | Effort |
|---|---|---|
| Add `overflow-x: hidden` to `.stream-header` | P0 | 1 line |
| Add 400px breakpoint to hide `.stat-counter` | P0 | 5 lines |
| Increase `.thumb-btn` to 40px on mobile | P1 | 2 lines |
| Consolidate PiP position rules (remove `!important`) | P0 | 10 lines |

### `globals.css` — Search Dropdown

**Lines 6657–6858**

| Fix | Priority | Effort |
|---|---|---|
| Fixed-bottom dropdown on mobile | P0 | 15 lines |
| Max-height + scroll on dropdown | P0 | 3 lines |

### `globals.css` — Song Row Stream

**Lines 6877–7047**

| Fix | Priority | Effort |
|---|---|---|
| Allow 2-line song title on mobile | P1 | 4 lines |
| Add safe zone for docked chat | P1 | 5 lines |

### `globals.css` — Body / Root

**Lines 1–20**

| Fix | Priority | Effort |
|---|---|---|
| `overflow-x: hidden` on body | P2 | 1 line |
| `overscroll-behavior-x: none` | P2 | 1 line |

### `VersusBattle.css`

**Lines 238–256**

| Fix | Priority | Effort |
|---|---|---|
| Add 640px breakpoint to stack arena | P1 | 8 lines |
| Remove `!important` selectors from globals | P1 | Remove 30 lines |

### `JukeboxPlayer.css`

**Lines 1315–1323**

| Fix | Priority | Effort |
|---|---|---|
| Show condensed sidebar on tablet (768px) | P2 | 15 lines |
| Ensure controls are above fold on mobile | P2 | 5 lines |

### `app/page.tsx`

| Fix | Priority | Effort |
|---|---|---|
| Add `chat-docked` class when Twitch chat is docked | P1 | 3 lines |
| Pass backdrop click handler to prediction modal | P2 | 2 lines |

---

## 9. Responsive QA Checklist for Engineers

### Pre-Deployment Checklist

#### 🖥️ Desktop (1280px+)
- [ ] All 3 Jukebox dashboard columns visible
- [ ] Activity feed doesn't overlap content
- [ ] Search dropdown appears directly below input
- [ ] PiP video floats correctly in bottom-right
- [ ] Admin controls laid out horizontally

#### 📱 Tablet (768px–1024px)
- [ ] Header elements don't overflow
- [ ] Admin controls stacked vertically
- [ ] Jukebox sidebars hidden gracefully (content accessible elsewhere)
- [ ] Leaderboard grid is 2-column
- [ ] PiP video sized appropriately (~220px wide)

#### 📱 Phone Standard (375px–640px)
- [ ] **No horizontal scroll** at any point in the session
- [ ] Vote buttons are at least 40px × 40px
- [ ] Search dropdown visible above keyboard
- [ ] Song titles readable (not heavily truncated)
- [ ] PiP video doesn't block vote buttons
- [ ] Onboarding flow fits in viewport (no cut-off submit buttons)
- [ ] Docked chat has matching safe zone padding
- [ ] Coach marks visible and dismissible
- [ ] Toast messages appear at bottom (not behind header)

#### 📱 Phone Small (320px–375px)
- [ ] Header doesn't overflow horizontally
- [ ] Stat counters gracefully hidden or wrapped
- [ ] User pill truncated but readable
- [ ] LIVE badge compact and visible
- [ ] Broadcast bar wraps cleanly

#### 📱 Galaxy Fold (280px)
- [ ] App remains usable (degraded but not broken)
- [ ] No horizontal scroll
- [ ] Primary actions (vote, search) still accessible

#### 🔄 Interaction States
- [ ] Keyboard open → search results still visible
- [ ] PiP → Expanded stream transition smooth
- [ ] Docked chat → song list scrollable above chat
- [ ] Purge banner → delete buttons have adequate spacing
- [ ] Versus Battle → songs stack vertically on mobile with clear VS divider

#### ♿ Accessibility
- [ ] All interactive elements have `aria-label`
- [ ] Focus visible on tab navigation
- [ ] `prefers-reduced-motion` suppresses all CSS animations
- [ ] Color contrast ratio ≥ 4.5:1 for body text
- [ ] Touch targets meet 44px minimum

#### 🌐 Network & Performance
- [ ] Skeleton loading states render at all breakpoints
- [ ] Stale data indicator visible on mobile
- [ ] Images use `loading="lazy"` where appropriate
- [ ] CSS animations use `will-change` or `transform` (GPU-accelerated)
- [ ] No layout shift (CLS) when content loads

---

## Summary of Changes Required

| Priority | Count | Status |
|---|---|---|
| P0 (Critical) | 3 | ✅ Shipped |
| P1 (High) | 5 | ✅ Shipped |
| P2 (Medium) | 6 | ✅ Shipped |
| P3 (Low) | 5 | ✅ Shipped |
| **Total** | **19 issues** | **All fixed** |

### Quick Wins (< 30 min each)
1. Add `overflow-x: hidden` to body
2. Consolidate PiP position rules
3. Increase vote button size to 40px
4. Add 400px breakpoint for header emergency compaction
5. Move VersusBattle responsive styles into its own CSS file

### Largest Impact Fixes
1. Fix search dropdown keyboard overlap (P0-3)
2. Fix header overflow on small phones (P0-2)
3. Add docked chat safe zone (P1-3)
