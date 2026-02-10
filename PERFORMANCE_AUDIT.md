# 🔍 Crate Vote — Performance Audit Report

**Date:** 2026-02-10
**Status:** Fixes 1–4 implemented ✅

---

## Summary of Changes Implemented

### ✅ Fix 1: Merged Timer Into Songs API Response
- **Before:** Two separate HTTP requests every 15s poll cycle (`/api/songs` + `/api/timer`)
- **After:** Single `/api/songs` request returns timer data in `data.timer` field
- **Impact:** ~50% reduction in polling HTTP traffic (133 → 67 req/sec at 1K users)
- **Files changed:**
  - `app/api/songs/route.ts` — added `getTimerStatus()` + `isUserBanned()` to parallel `Promise.all`, added `timer` field to JSON response
  - `app/page.tsx` — extracted timer data from songs response, removed `fetchTimer` callback, removed all `fetchTimer()` calls from initial fetch/polling/refresh

### ✅ Fix 2: Reduced 100ms Intervals to 1000ms
- **Before:** Delete window and battle countdown ran `setInterval(() => ..., 100)` — 20 state updates/sec total
- **After:** Both use `setInterval(() => ..., 1000)` — 2 state updates/sec total
- **Impact:** 90% reduction in re-renders from countdown timers. Countdowns only display seconds anyway.
- **Files changed:**
  - `app/page.tsx` lines ~1324 (delete window countdown) and ~1408 (battle countdown)

### ✅ Fix 3: Moved Google Fonts to `<link>` in Layout
- **Before:** `@import url(...)` in `globals.css` created a 3-hop render-blocking chain: HTML → CSS → @import → font files
- **After:** `<link rel="stylesheet">` in `layout.tsx` loads fonts in parallel with CSS parsing (2-hop)
- **Impact:** Eliminates ~100-300ms from first paint on cold loads
- **Files changed:**
  - `app/layout.tsx` — added `<link rel="stylesheet">` for Google Fonts
  - `app/globals.css` — removed `@import` on line 1

### ✅ Fix 4: Optimized `isSongInPlaylist` with Memoized Set
- **Before:** `songs.some(s => s.id === trackId)` — O(n) per search result per render
- **After:** `useMemo(() => new Set(songs.map(s => s.id)), [songs])` + `Set.has()` — O(1) per lookup
- **Impact:** Minor but eliminates 500 iterations per search render (100 songs × 5 results)
- **Files changed:**
  - `app/page.tsx` — replaced `isSongInPlaylist` with `playlistIdSet` + `has()`

---

## Remaining Issues (Not Yet Implemented)

### 🔴 P0: Monolith Component Architecture
- `page.tsx` is 3,400+ lines / 167KB — every state change re-evaluates everything
- **Recommended next step:** Extract `<SongCard>`, `<SearchDropdown>`, `<StreamEmbed>`, `<MegaAnnouncements>`, `<OnboardingOverlay>`

### 🟡 P1: 247KB Monolith CSS
- `globals.css` is 12,441 lines — contains dead styles (e.g., `display: none` on `.timer-control-panel`)
- **Recommended next step:** Audit for dead CSS, split admin/jukebox/twitch styles into component files

### 🟡 P1: Unbounded `seenActivityIds` Set
- Grows indefinitely during a session (~2,160 entries over a 3-hour event)
- **Recommended fix:** Cap at 100 entries via sliding window

### 🟡 P1: Duplicate Sort Logic
- Songs sorted in both `fetchPlaylist` (for rank tracking) and `sortedSongs` useMemo
- **Recommended fix:** Consolidate into the useMemo

### 🟡 P2: 4x Duplicated Search Dropdown UI
- Identical JSX copy-pasted in PiP YouTube, PiP Twitch, docked chat, main search
- **Recommended fix:** Extract to `<SearchDropdown>` component

### 🟢 P3: Unnecessary Dynamic Import of fingerprint.ts
- 683-byte file loaded via `await import()` — adds overhead with no code-splitting benefit
- **Recommended fix:** Static import

### 🟢 P3: Unused Pusher Dependencies
- `pusher` and `pusher-js` in package.json but never imported
- **Recommended fix:** Remove or implement WebSocket push to replace polling

### 🟢 P3: App-wide SessionProvider
- `next-auth` SessionProvider wraps entire app, only needed for admin + export
- **Recommended fix:** Only wrap auth-requiring routes

---

## Target Thresholds

| Metric | Target | Current Estimate |
|--------|--------|-----------------|
| Interaction feedback (vote, add) | <100ms | ✅ ~50ms (optimistic UI) |
| Useful content on 3G mobile | <2.5s | ⚠️ ~3-4s (font chain fixed, CSS still heavy) |
| Blank state duration | <1s | ✅ PlaylistSkeleton renders immediately |
| Polling efficiency at 1K users | <70 req/sec | ✅ ~67 req/sec (was ~133) |
| Re-renders from timers | <5/sec | ✅ ~3/sec (was ~22/sec) |
