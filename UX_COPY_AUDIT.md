# UX Copy Audit — Crate Vote

> **Principles:** No jargon · No vague language · One action per message · State what happens next · Confident and calm tone

---

## 🚦 Screen-by-Screen Copy Volume Flags

| Screen / Section | Current Word Count (approx) | Recommendation |
|---|---|---|
| **Onboarding Step 2 (DJ Type)** | ~30 words | ✅ OK |
| **Onboarding Step 3 (Email Capture)** | ~45 words | ✅ OK |
| **Empty State (No Session, Logged Out)** | ~55 words | 🔴 **Reduce by 40%** — two paragraphs say the same thing |
| **Empty State (No Session, Logged In)** | ~50 words | 🔴 **Reduce by 35%** — countdown + CTA is enough |
| **Disabled Search Placeholders** | ~90 total chars across 5 variants | ✅ OK |
| **Game Tips (config)** | 8 tips, ~80 words | 🟡 **Reduce by 30%** — cut 2–3 redundant tips |
| **Jukebox Idle Messages** | 8 messages × ~15 words | 🟡 **Reduce to 5 messages** — several are near-duplicates |
| **Jukebox Sidebar Rules** | 5 rules, ~25 words | ✅ OK |
| **Jukebox Gamification Tips** | 10 tips, ~60 words | 🔴 **Reduce to 6** — cut overlapping tips |
| **Banned User Banner** | ~35 words | 🔴 **Reduce by 40%** — too much detail for a ban notice |

---

## 📋 Master Copy Table

### 1. ONBOARDING FLOW

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 1.1 | Step 1 title | `Welcome to the Crate Hackathon` | "Hackathon" is internal jargon — most users don't know what that means | `Join the Live Playlist` | States the activity, not the event name |
| 1.2 | Step 1 subtitle | `Search songs. Vote them up. Build the ultimate playlist — together.` | Good but "ultimate" is vague filler | `Search songs. Vote your favorites up. Build the playlist together.` | Removes filler, keeps the rhythm |
| 1.3 | Step 1 social proof | `👁 {n} people voting right now` | Eye emoji is ambiguous — voting or watching? | `🟢 {n} people here now` | Clearer, warmer, "here" implies community |
| 1.4 | Step 1 input placeholder | `What should we call you?` | Cute but slightly vague | `Your display name` | Direct and scannable |
| 1.5 | Step 1 button | `Next →` | ✅ Good | `Next →` | — |
| 1.6 | Step 2 title | `What's your vibe?` | Slang — unclear what the question actually is | `Are you a DJ?` | Direct question, immediate understanding |
| 1.7 | Step 2 subtitle | `DJs get extra tools like BPM and key matching. This helps us tailor your experience.` | "Tailor your experience" is corporate filler | `DJs see BPM and key data alongside each song.` | States the concrete benefit |
| 1.8 | Step 2 — DJ option label | `I spin tracks` | Cool but unclear for casual users | `Yes, I DJ` | Universally understood |
| 1.9 | Step 2 — DJ option hint | `Any level — bedroom to main stage` | Ok but slightly long | `Any level` | Tighter — the button context implies DJing |
| 1.10 | Step 2 — Fan option label | `I discover music` | Passive — doesn't describe what they DO here | `No, I'm here for the music` | Clear self-identification |
| 1.11 | Step 2 — Fan hint | `I know what sounds good` | Slightly presumptuous | `I've got great taste` | Fun, confident, self-affirming |
| 1.12 | Step 3 title | `Want Session Alerts?` | "Session" is internal jargon | `Get Notified When We Go Live` | States exactly what happens |
| 1.13 | Step 3 subtitle | `We'll let you know when the next session goes live. No spam, ever.` | Repeats the title, "session" again | `One email before each live event. That's it.` | Concrete promise, shorter |
| 1.14 | Step 3 email placeholder | `Email address *` | Asterisk without context | `you@email.com` | Standard pattern, no asterisk needed since button handles validation |
| 1.15 | Step 3 phone placeholder | `Phone (optional — for text alerts)` | Good but long for a placeholder | `Phone (optional)` | Shorter placeholder; tooltip or label can explain |
| 1.16 | Step 3 email validation | `Double-check your email format (e.g. you@example.com)` | Verbose — user just needs to know it's wrong | `Enter a valid email` | Shorter, same info |
| 1.17 | Step 3 email error (handler) | `Please enter a valid email address (e.g. you@example.com)` | Example clutters the error | `Enter a valid email address` | Clean single instruction |
| 1.18 | Step 3 submit button | `Let's Go! 🎉` | Two tones (formal + party) clash | `Join & Enter →` | Clear action — states what happens next |
| 1.19 | Step 3 submitting state | `Joining...` | ✅ Good | `Joining...` | — |
| 1.20 | Step 3 skip button | `Skip for now →` | ✅ Good | `Skip for now →` | — |
| 1.21 | Step 3 privacy note | `🔒 Unsubscribe anytime. We never share your info.` | ✅ Good | `🔒 Unsubscribe anytime. We never share your info.` | — |
| 1.22 | Step back button | `← Back` | ✅ Good | `← Back` | — |

### 2. PROFILE EDIT MODAL

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 2.1 | Title | `Edit Your Profile` | ✅ Good | `Edit Your Profile` | — |
| 2.2 | Input placeholder | `Your name` | ✅ Good | `Your name` | — |
| 2.3 | Save button | `Save ✓` | ✅ Good | `Save` | Checkmark is redundant next to a save action |
| 2.4 | Saving state | `Saving...` | ✅ Good | `Saving...` | — |
| 2.5 | Cancel button | `Cancel` | ✅ Good | `Cancel` | — |

### 3. NAVIGATION / HEADER

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 3.1 | Admin link title | `Admin Panel` | ✅ OK (admin-only) | `Admin Panel` | — |
| 3.2 | Rules button title | `How to play` | ✅ Good | `How to play` | — |
| 3.3 | Rules popover title | `How to Play` | ✅ Good | `How It Works` | Slightly less "gamey" for mixed audience |
| 3.4 | Rule 1 | `Drop up to 5 tracks on the playlist` | "Drop" is slang | `Add up to 5 songs` | Universal language |
| 3.5 | Rule 2 | `10 upvotes + 10 downvotes to shape the outcome` | "Shape the outcome" is vague | `10 upvotes + 10 downvotes to rank songs` | States the concrete result |
| 3.6 | Rule 3 | `Top 3 songs win prizes + karma!` | ✅ Good | `Top 3 songs win prizes + karma` | — |
| 3.7 | Rules dismiss | `Got it!` | ✅ Good | `Got it` | — |
| 3.8 | Live badge | `LIVE • {time}` | ✅ Good | `LIVE · {time}` | — |
| 3.9 | User pill tooltip | `Tap to edit profile` | ✅ Good | `Edit profile` | Shorter, user already knows to tap |
| 3.10 | Songs remaining tooltip | `You can add {n} more song(s)` | Wordy for a tooltip | `{n} songs left` | Scannable at a glance |
| 3.11 | Upvotes remaining tooltip | `{n} upvote(s) left — boost songs you like!` | CTA in a tooltip — too much | `{n} upvotes left` | Tooltip = info only, not coaching |
| 3.12 | Downvotes remaining tooltip | `{n} downvote(s) left — sink songs you don't want` | Same issue | `{n} downvotes left` | Clean info |
| 3.13 | Karma tooltip | `Karma points! Each gives +1 song & +1 vote` | Explanation in a tooltip is ok but dense | `Karma: each point = +1 song slot & +1 vote` | Structured, easier to scan |
| 3.14 | God Mode tooltip | `Your song is #1! Unlimited votes + extra Purge power!` | "Purge power" is unexplained jargon | `Your song is #1 — unlimited votes unlocked!` | Removes unexplained concept |
| 3.15 | Playlist capacity tooltip | `Playlist: {n} of {max} songs` | ✅ Good | `{n}/{max} songs` | — |

### 4. BROADCAST BAR

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 4.1 | Live state | `ON AIR NOW` | ✅ Good | `LIVE NOW` | More universally recognized |
| 4.2 | Countdown label | `NEXT SESSION` | "Session" is jargon | `NEXT LIVE EVENT` | Clearer for new visitors |
| 4.3 | Schedule label | `Tuesdays 8 PM ET` | ✅ Good | `Every Tue · 8 PM ET` | Shorter, same info |

### 5. GAME FEATURES BAR

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 5.1 | Leaderboard button | `🏆 Top DJs` | ✅ Good | `🏆 Leaderboard` | More universally understood label |
| 5.2 | Prediction button | `🎯 Predict #1` | ✅ Good | `🎯 Predict the Winner` | Slightly clearer for newcomers |
| 5.3 | Prediction badge | `🎯 Predicted!` | Missing what they predicted | `🎯 Prediction locked` | "Locked" confirms finality |
| 5.4 | Sound toggle title (on) | `Mute sounds` | ✅ Good | `Mute sounds` | — |
| 5.5 | Sound toggle title (off) | `Enable sounds` | "Enable" is slightly technical | `Turn on sounds` | Plain language |

### 6. SEARCH BAR & RESULTS

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 6.1 | Search placeholder (active) | `Search any song on Spotify...` | ✅ Good | `Search for a song...` | Slightly shorter; Spotify branding unnecessary in placeholder |
| 6.2 | Disabled: no session | `🎵 Song adding opens when a session is live` | "Session" jargon | `🎵 Song adding opens when we go live` | Plain language |
| 6.3 | Disabled: locked | `🔒 The host has paused new additions` | ✅ Good | `🔒 Song adding is paused` | Shorter |
| 6.4 | Disabled: adding off | `🔒 Song adding is currently disabled by the host` | Redundant "currently" and "by the host" | `🔒 Song adding is off right now` | Shorter, same info |
| 6.5 | Disabled: no username | `👤 Set your DJ name to add songs` | ✅ Good | `👤 Set your name to add songs` | "DJ name" may confuse non-DJs |
| 6.6 | Disabled: all slots used | `You've used all {n} song slots! Vote on tracks to shape the playlist.` | Two actions in one message | `All {n} song slots used — vote to shape the playlist` | One line, em dash separates info from action |
| 6.7 | Results header | `🔍 SEARCH RESULTS` + `Tap to add →` | ALL CAPS is shouty | `🔍 Results` + `Tap to add →` | Calmer, same function |
| 6.8 | No results (main) | `No songs found for "{query}" — try another search` | ✅ Good | `No results for "{query}" — try a different search` | Minor polish |
| 6.9 | No results (PiP) | `No songs found — try another search` | ✅ Good | `No results — try a different search` | Consistent with main |
| 6.10 | Already in playlist | `✓ In playlist ↓` | ✅ Good | `✓ Already added` | Clearer — "↓" is ambiguous |
| 6.11 | Add button | `+ ADD` | ✅ Good | `+ Add` | Title case, less shouty |
| 6.12 | Coach mark (search) | `🎵 Drop your first track — search any song on Spotify` | "Drop" and "track" are DJ slang; mentions Spotify unnecessarily | `🎵 Search for a song to add it to the playlist` | Clear single action |

### 7. SONG LIST & VOTING

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 7.1 | Rank tooltip (top 3) | `Top 3 = +5 karma reward!` | ✅ Good | `Top 3 earn +5 karma` | Slightly cleaner |
| 7.2 | Rank tooltip (other) | `Rank #{n}` | ✅ Good | `Rank #{n}` | — |
| 7.3 | Vote tooltip (upvote) | `Upvote this song` | ✅ Good | `Upvote` | Shorter; context is obvious |
| 7.4 | Vote tooltip (remove upvote) | `Remove upvote` | ✅ Good | `Remove upvote` | — |
| 7.5 | Vote tooltip (downvote) | `Downvote this song` | ✅ Good | `Downvote` | — |
| 7.6 | Play button title | `Preview music video on YouTube` | Doesn't match behavior (opens Jukebox) | `Play music video` | Matches actual action |
| 7.7 | Play loading state | `⏳ Finding...` | "Finding" is vague | `⏳ Loading...` | Standard expected word |
| 7.8 | Score tooltip | `Net score: +{n}` | "Net score" is analytical jargon | `Score: +{n}` | Simpler label |
| 7.9 | Purge button title (unarmed) | `PURGE this song!` | ALL CAPS + exclamation = aggressive | `Delete this song` | Clear, calm |
| 7.10 | Purge button title (armed) | `Tap again to confirm!` | ✅ Good | `Tap again to confirm` | Drop exclamation for calmer tone |
| 7.11 | Purge confirmation label | `⚠️ Confirm?` | ✅ Good | `⚠️ Confirm?` | — |

### 8. EMPTY STATES

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 8.1 | Empty + session active (title) | `The playlist is empty — you could be the first name on it 🔥` | Wordy, fire emoji is noise | `Playlist is empty — be the first to add a song` | Direct CTA, shorter |
| 8.2 | Empty + session active (subtitle) | `Use the search bar above to add the first song and get the party started!` | "Get the party started" is cliché | `Search above to add a song.` | One clear instruction |
| 8.3 | Empty + no session + logged in (title) | `Welcome back, {name}! 🎧` | ✅ Good | `Welcome back, {name}` | — |
| 8.4 | Empty + no session + logged in (subtitle) | `No live session right now — we go live every week where you add songs, vote, and build playlists together in real-time.` | Way too long for an empty state (32 words) | `No live event right now. We go live weekly — add songs, vote, and build playlists together.` | 17 words, same info |
| 8.5 | Empty + no session + logged in (hint) | `Drop your email below to get notified when we go live!` | "Drop your email" is slang | `Enter your email to get notified.` | Plain language |
| 8.6 | Empty + no session + logged out (title) | `Welcome to Crate Vote 📦` | "Crate Vote" is the code name, not the product name | `Welcome to Crate Hackers` | Use the real brand name |
| 8.7 | Empty + no session + logged out (subtitle) | `Every week, we go live and let the crowd build the playlist. Add songs, vote, and see your picks climb the charts in real-time.` | 27 words — too much for an empty state | `Every week we go live. Add songs, vote, and build the playlist together.` | 13 words, same energy |
| 8.8 | Empty + no session + logged out (hint) | `Sign up below to get notified when the next session drops!` | "Session drops" is slang | `Enter your email to get notified.` | Consistent with 8.5 |
| 8.9 | Countdown label | `🕐 Next session in {time}` | "Session" jargon | `🕐 Next live event in {time}` | Clearer |

### 9. WAITING SCREEN RSVP

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 9.1 | Success message | `✅ You're on the list! We'll let you know when the next session drops.` | "Session drops" is slang | `✅ You're on the list! We'll notify you before the next event.` | Clean, professional |
| 9.2 | Form label | `Get notified when we go live` | ✅ Good | `Get notified when we go live` | — |
| 9.3 | Email placeholder | `your@email.com` | ✅ Good | `your@email.com` | — |
| 9.4 | Submit button | `Notify Me` | ✅ Good | `Notify Me` | — |
| 9.5 | Submitting state | `Joining...` | "Joining" is wrong — they're subscribing | `Submitting...` | Matches the actual action |
| 9.6 | Validation error | `Please enter a valid email address` | ✅ Good | `Enter a valid email address` | Drop "Please" — shorter, still polite |
| 9.7 | Generic error | `Something went wrong — try again` | ✅ Good | `Something went wrong — try again` | — |
| 9.8 | Network error | `Network error — check your connection` | ✅ Good | `Connection issue — try again` | Slightly shorter |

### 10. SUCCESS CONFIRMATIONS

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 10.1 | Welcome (with email) | `Welcome to the community, {name}! 🎧` | "Community" is vague | `Welcome, {name}! You're in. 🎧` | Confirms they succeeded |
| 10.2 | Welcome (skip) | `Welcome, {name}! 🎧` | ✅ Good | `Welcome, {name}!` | — |
| 10.3 | Profile update | `Welcome, {name}!` | Wrong confirmation — they edited, not joined | `Profile updated!` | Accurate action feedback |
| 10.4 | Song added | `✓ Added "{name}"!` | ✅ Good | `✓ "{name}" added to playlist` | States where it went |
| 10.5 | Vote confirmed | `👍 Vote counted!` / `👎 Vote counted!` | ✅ Good | `👍 Upvote counted` / `👎 Downvote counted` | Specific which vote type |
| 10.6 | Vote removed | `Vote removed from "{name}"` | ✅ Good | `Vote removed` | Shorter; song context is visual |
| 10.7 | Song deleted (purge) | `💥 Song deleted!` | ✅ Good | `💥 Song removed` | "Removed" is calmer than "deleted" |
| 10.8 | Export redirect | `Redirecting to Spotify...` | ✅ Good | `Opening Spotify...` | More accurate — it's opening, not redirecting |
| 10.9 | Prediction locked | `🎯 Prediction locked in! Good luck!` | Two sentences for one action | `🎯 Prediction locked in!` | One sentence, one action |
| 10.10 | Karma earned (presence) | `Thanks for hanging out! +1 Karma` | "Hanging out" is informal | `+1 Karma for being active!` | Shorter, still warm |
| 10.11 | Jukebox activated | `🎵 Jukebox mode activated! Enjoy the music.` | "Mode activated" is technical | `🎵 Now playing music videos` | Describes what's happening |
| 10.12 | Playlist complete | `🎉 Playlist complete! Thanks for listening.` | ✅ Good | `🎉 Playlist complete! Thanks for listening.` | — |
| 10.13 | Battle vote | `⚔️ Voted for Song {choice}!` | "Song A/B" is meaningless to the user | `⚔️ Vote locked in!` | They can see which side they chose |
| 10.14 | Karma rain confetti | `🌧️ KARMA RAIN! +1 karma for everyone!` | Good but ALL CAPS is aggressive | `🌧️ Karma Rain! +1 karma for everyone` | Title case, calmer |

### 11. ERROR STATES

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 11.1 | Network timeout | `Request timed out - please check your connection` | Slightly technical ("request") | `Connection timed out — check your internet` | Plain language |
| 11.2 | Slow connection | `Slow connection - retrying...` | ✅ Good | `Slow connection — retrying...` | — |
| 11.3 | Search failed | `Search failed - please try again` | ✅ Good | `Search failed — try again` | Drop "please" for brevity |
| 11.4 | No results banner | `No songs found for "{query}"` | ✅ Good | `No results for "{query}"` | — |
| 11.5 | Add song failed | `Failed to add song` | Passive voice | `Couldn't add that song — try again` | Active voice, offers next step |
| 11.6 | Vote failed | `Vote failed` | No next step | `Vote failed — try again` | Adds recovery action |
| 11.7 | Vote failed (network) | `Vote failed - check your connection` | ✅ Good | `Vote failed — check your connection` | — |
| 11.8 | Network error generic | `Network error - please try again` | ✅ Good | `Connection issue — try again` | Simpler |
| 11.9 | Network error (add song) | `Network error - please try again` | Same message for different contexts | `Couldn't connect — try adding again` | Context-specific |
| 11.10 | Network error (battle) | `Network error - try again quickly!` | "Quickly" adds unnecessary pressure | `Connection issue — try again` | Calm, confident |
| 11.11 | Prediction failed | `Could not save prediction` | Passive, no next step | `Couldn't save your prediction — try again` | Active, offers recovery |
| 11.12 | Error page heading | `Something went wrong` | ✅ Good | `Something went wrong` | — |
| 11.13 | Error page body | `Don't worry, your data is safe. Try refreshing the page.` | Two instructions in one sentence | `Your data is safe. Refresh to continue.` | Separates reassurance from action |
| 11.14 | Error page retry button | `Try Again` | ✅ Good | `Try Again` | — |
| 11.15 | Error page home button | `Go Home` | ✅ Good | `Go Home` | — |
| 11.16 | ErrorBoundary fallback | `⚠️ Something went wrong. Refresh to try again.` | ✅ Good | `⚠️ Something went wrong. Refresh to reload.` | "Reload" is more accurate than "try again" |
| 11.17 | Battle error fallback | `⚔️ Battle error - refreshing...` | "Error" is technical | `⚔️ Battle couldn't load — refreshing...` | Describes what failed |

### 12. TOAST / INLINE NOTIFICATIONS

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 12.1 | Session loading | `Please wait — loading your session...` | "Session" is jargon, "Please wait" is filler | `Loading...` | Minimal, expected |
| 12.2 | Banned toast | `Your access was paused by a moderator for this session` | Wordy, "session" jargon | `A moderator paused your access` | Shorter, same info |
| 12.3 | Voting not available (no session) | `⏸️ Voting opens when the session starts` | "Session" jargon | `⏸️ Voting opens when we go live` |  Clearer |
| 12.4 | Voting locked | `🔒 The host has locked participation` | "Participation" is formal/vague | `🔒 Voting is paused by the host` | Specific action |
| 12.5 | No username | `👤 Set your DJ name first to vote` | "DJ name" may confuse non-DJs | `👤 Set your name first to vote` | Universal |
| 12.6 | Voting generic fallback | `Voting is not available right now` | Vague — doesn't say why | `Voting is paused` | Short and confident |
| 12.7 | Rate limit (vote) | `One vote per song every few seconds — keeps it fair for everyone 🎯` | Wordy, justification unnecessary | `Too fast — wait a few seconds` | Short, clear |
| 12.8 | Rate limit (API) | `Cooling down... ready in {n}s — keeps it fair for everyone 🎯` | Same wordiness issue | `Rate limited — try again in {n}s` | Precise, actionable |
| 12.9 | All upvotes used | `All upvotes used! Earn karma by staying active for 5 min 🎧` | Two messages in one | `All upvotes used` | One message. Karma info lives elsewhere. |
| 12.10 | All downvotes used | `All downvotes used! Earn karma by staying active for 5 min 🎧` | Same issue | `All downvotes used` | Same fix |
| 12.11 | Song modified | `Song was modified - refreshing...` | "Modified" is vague/technical | `Song was removed — refreshing...` | States what actually happened |
| 12.12 | User banned (from vote) | `You have been banned` | Harsh, no context | `A moderator paused your access` | Matches 12.2, less harsh |
| 12.13 | Name required (add song) | `Please enter your name first` | ✅ Good | `Set your name first` | Drop "please" — CTA, not apology |
| 12.14 | No video found | `No music video found for this song` | ✅ Good | `No video found for this song` | "Music" is redundant in context |
| 12.15 | Video load failed | `Failed to load video preview` | "Preview" is wrong; it opens Jukebox | `Couldn't load the video` | Accurate, shorter |

### 13. MEGA ANNOUNCEMENTS / OVERLAYS

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 13.1 | Purge title | `THE PURGE` | ✅ Thematic, on brand | `THE PURGE` | — |
| 13.2 | Purge subtitle | `Delete ANY song! Choose wisely...` | "Choose wisely" is dramatic filler | `Delete any song — one shot!` | Tighter, same urgency |
| 13.3 | Purge persistent indicator | `PURGE ACTIVE` | ✅ Good | `PURGE ACTIVE` | — |
| 13.4 | Karma rain title | `KARMA RAIN!` | ✅ Good | `KARMA RAIN!` | — |
| 13.5 | Karma rain subtitle | `+1 Karma for everyone! 🎉` | ✅ Good | `+1 Karma for everyone!` | — |
| 13.6 | Wipe title | `PLAYLIST WIPED!` | ✅ Good | `PLAYLIST RESET!` | "Reset" is less destructive-sounding |
| 13.7 | Wipe subtitle | `Fresh start! Add your songs now.` | ✅ Good | `Add your songs now.` | The title already says it's a fresh start |
| 13.8 | Winner title | `YOU WON! 🏆` | ✅ Good | `YOU WON! 🏆` | — |
| 13.9 | Winner song text | `Your song "{name}" hit #1!` | ✅ Good | `"{name}" finished #1!` | Clearer finality |
| 13.10 | Prize CTA | `🎁 CLAIM YOUR FREE HAT` | ✅ Good | `🎁 Claim Your Free Hat` | Title case; less shouty |
| 13.11 | Prize note | `Click to visit DJ.style - code auto-applies!` | ✅ Good | `Opens DJ.style — code applies automatically` | States what the click does |
| 13.12 | Golden Hour title | `GOLDEN HOUR DROP!` | ✅ Good | `GOLDEN HOUR DROP!` | — |
| 13.13 | Golden Hour winner text | `You were randomly selected — you win a FREE HAT!` | ✅ Good | `You've been selected — you win a free hat!` | Slightly more natural |
| 13.14 | Golden Hour viewer text | `🎉 {name} just won a FREE HAT!` | ✅ Good | `🎉 {name} just won a free hat!` | Less caps |
| 13.15 | Golden Hour hint | `Stay active — you could be next! 🎯` | ✅ Good | `Stay active — you could be next!` | — |
| 13.16 | Leaderboard King title | `LEADERBOARD KING!` | ✅ Good | `LEADERBOARD KING!` | — |
| 13.17 | Leaderboard King subtitle (winner) | `You're the #1 contributor with {n} points!` | ✅ Good | `You're #1 with {n} points!` | Shorter |
| 13.18 | Leaderboard King (viewer) | `🏆 {name} is the #1 contributor!` | ✅ Good | `🏆 {name} finished #1!` | Shorter |

### 14. STALE DATA / OFFLINE

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 14.1 | Stale indicator | `⚠️ Offline — showing last known data` | "Last known data" is slightly technical | `⚠️ Offline — showing cached results` | ← Actually, even simpler: `⚠️ You're offline` | Just state the fact |
| 14.2 | Retry button | `Retry` | ✅ Good | `Retry` | — |
| 14.3 | Retrying state | `Retrying...` | ✅ Good | `Retrying...` | — |

### 15. COACH MARKS / ONBOARDING TOOLTIPS

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 15.1 | Vote coach mark | `🏆 Now vote on other tracks — top 3 win prizes!` | Good but "tracks" is DJ jargon | `🏆 Vote on songs — top 3 win prizes!` | Universal language |
| 15.2 | Coach dismiss | `Got it!` | ✅ Good | `Got it` | — |

### 16. BANNED USER BANNER

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 16.1 | Banner text | `⚠️ Your access was paused by a moderator.` + `This resets automatically next round. Watching and browsing still work! Questions? Ask in the stream chat.` | 🔴 **Way too much text** — 4 separate pieces of info crammed into one banner (25 words) | `⚠️ A moderator paused your access. It resets next round.` | 10 words. Two facts. Browsing still works naturally — no need to say it. |

### 17. VERSUS BATTLE COMPONENT

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 17.1 | Battle title | `⚔️ VERSUS BATTLE ⚔️` | Redundant double emoji | `⚔️ VERSUS BATTLE` | Cleaner |
| 17.2 | Lightning title | `⚡ LIGHTNING ROUND ⚡` | Same issue | `⚡ LIGHTNING ROUND` | — |
| 17.3 | Results title | `🏆 BATTLE RESULTS 🏆` | Same | `🏆 BATTLE RESULTS` | — |
| 17.4 | Instruction (pre-vote) | `Tap a song to cast your vote! One vote only.` | "Cast your vote" is formal | `Tap a song to vote. One chance.` | Direct, urgent |
| 17.5 | Instruction (voted) | `✓ Vote locked in! Waiting for results...` | ✅ Good | `✓ Vote locked in — results coming...` | Slightly more active |
| 17.6 | Winner badge | `🏆 WINNER` | ✅ Good | `🏆 WINNER` | — |
| 17.7 | Loser badge | `❌ ELIMINATED` | ✅ Good | `❌ ELIMINATED` | — |
| 17.8 | Vote badge | `✓ Your Vote` | ✅ Good | `✓ Your Vote` | — |

### 18. 404 PAGE

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 18.1 | Heading | `404 - Page Not Found` | ✅ Standard | `Page Not Found` | Drop the error code — users don't need it |
| 18.2 | Body | `Looks like this track got lost in the shuffle.` | Cute but unhelpful | `This page doesn't exist.` | States the fact |
| 18.3 | CTA | `Back to the Playlist` | ✅ Good | `Back to Playlist` | Slightly shorter |

### 19. JUKEBOX PLAYER

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 19.1 | Close button | `← Back` | ✅ Good | `← Back` | — |
| 19.2 | Now playing label | `🎵 NOW PLAYING` | ✅ Good | `🎵 NOW PLAYING` | — |
| 19.3 | Crowdsource banner | `LIVE CROWDSOURCING` | "Crowdsourcing" is jargon | `LIVE VOTING` | Everyone understands "voting" |
| 19.4 | Crowdsource title | `Building the Perfect Playlist` | ✅ Good | `Building the Playlist` | "Perfect" is filler |
| 19.5 | Crowdsource subtitle | `Real-time votes from the crowd determine what plays next` | Verbose | `Votes decide what plays next` | 6 words vs 10 |
| 19.6 | QR label | `Vote Now!` | ✅ Good | `Scan to Vote` | More actionable |
| 19.7 | QR (idle) | `Scan to Join!` | ✅ Good | `Scan to Vote` | Consistent |
| 19.8 | Sidebar: Active DJs | `👥 Active DJs` | ✅ Good | `👥 Active Voters` | Not everyone is a DJ |
| 19.9 | Sidebar: Activity empty | `Waiting for votes...` | ✅ Good | `No activity yet` | Shorter |
| 19.10 | Sidebar: Live Activity | `⚡ Live Activity` | ✅ Good | `⚡ Live Activity` | — |
| 19.11 | Karma indicator (earned) | `✨ +1 Karma earned!` | ✅ Good | `✨ +1 Karma earned!` | — |
| 19.12 | Karma progress | `🎧 Watching: {n}s / 60s for karma` | "for karma" is vague | `🎧 Watch 60s for +1 karma: {n}/60` | States the reward upfront |
| 19.13 | Queue label | `📋 Up Next ({n} songs)` | ✅ Good | `📋 Up Next · {n} songs` | — |
| 19.14 | CTA flash | `Join the vote at crateoftheweek.com` | ✅ Good | `Vote now at crateoftheweek.com` | "Vote now" is a stronger CTA |
| 19.15 | Corner close title | `Return to voting (ESC)` | ✅ Good | `Back to playlist (ESC)` | More accurate |
| 19.16 | How to Vote step 2 | `Enter your name` | ✅ Good | `Pick a name` | More casual, matches the flow |
| 19.17 | How to Vote step 4 | `👎 Downvote skips` | "Skips" is unclear | `👎 Downvote songs you don't want` | Clearer intent |
| 19.18 | Rule: add songs | `🎵 Add up to 3 songs` | Conflicts with actual limit (5 songs) | `🎵 Add up to 5 songs` | Accurate |
| 19.19 | Rule: top songs | `⬆️ Top songs get exported` | "Exported" is technical | `⬆️ Top songs make the final playlist` | States the real outcome |
| 19.20 | Rule: low votes | `⬇️ Low votes = eliminated` | ✅ Good | `⬇️ Low votes = dropped` | "Dropped" is less aggressive |

### 20. GAME TIPS (config.ts)

| # | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|
| 20.1 | `🏆 Get your song in the Top 3 to earn +5 karma!` | ✅ Good | `🏆 Top 3 songs earn +5 karma!` | Shorter |
| 20.2 | `✨ Each karma = +1 song AND +1 upvote AND +1 downvote!` | Three ANDs is hard to parse | `✨ Each karma = +1 song, +1 upvote, +1 downvote` | Easier to scan |
| 20.3 | `💀 Watch for THE PURGE — 30 seconds to eliminate songs!` | ✅ Good | `💀 THE PURGE lets you delete any song for 30 seconds` | Clearer action |
| 20.4 | `👑 The #1 song gets the crown — fight for it!` | "Fight for it" is vague | `👑 Push your song to #1 for the crown` | Clear action |
| 20.5 | `🎧 Export to Spotify when voting ends!` | ✅ Good | `🎧 Export the playlist to Spotify anytime` | Correct — export is available anytime |
| 20.6 | `⬆️ Upvote songs you want played, downvote the rest!` | "The rest" is vague | `⬆️ Upvote songs you love, downvote ones you don't` | Clearer intent |
| 20.7 | `🔥 Songs with negative scores can get bumped!` | "Bumped" is ambiguous (up or removed?) | 🔴 **CUT** — confusing; covered by other tips | Reduces tip count by 1 |
| 20.8 | `⏳ Stay 5 min for +1 karma (loyalty bonus)!` | "Loyalty bonus" is unnecessary label | `⏳ Stay 5 minutes to earn +1 karma` | Straightforward |

### 21. STREAM / PiP CONTROLS

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 21.1 | PiP expand button | `⬜ ᴇxᴘᴀɴᴅ` | Small-caps Unicode is unreadable | `▶ Expand` | Standard, readable |
| 21.2 | Minimize button | `➖` | Ambiguous standalone | `➖` + title `Minimize` | Tooltip adds clarity |
| 21.3 | Tap for sound (PiP) | `🔊 Tap for sound` | ✅ Good | `🔊 Tap for sound` | — |
| 21.4 | Replay badge | `🎬 REPLAY` | ✅ Good | `🎬 Replay` | Title case |
| 21.5 | Twitch live badge | `🟣 LIVE` | ✅ Good | `🟣 Live` | — |
| 21.6 | Open in Twitch | `⇗ Twitch` | ✅ Good | `⇗ Open in Twitch` | Clearer action |
| 21.7 | Dock chat button | `💬 Dock Chat` | ✅ Good | `💬 Pin Chat` | "Pin" is more universally understood |
| 21.8 | Undock chat | `⬇️ Undock` | "Undock" is jargon | `Unpin Chat` | Matches 21.7 |
| 21.9 | PiP search placeholder | `🔍 Add a song...` | ✅ Good | `🔍 Add a song...` | — |
| 21.10 | Docked search placeholder | `Search any song on Spotify...` | Same as 6.1 | `Search for a song...` | Consistent |

### 22. LEADERBOARD PANEL

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 22.1 | Header | `🏆 Top Contributors` | ✅ Good | `🏆 Top Contributors` | — |
| 22.2 | Empty state | `Add songs to appear here!` | ✅ Good | `Add songs or vote to appear here` | Includes voting as a path |
| 22.3 | User indicator | `(you)` | ✅ Good | `(you)` | — |

### 23. PREDICTION MODAL

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 23.1 | Title | `🎯 Predict the Winner!` | ✅ Good | `🎯 Predict the Winner` | Drop exclamation |
| 23.2 | Description | `Which song will be #1 when voting ends? Correct predictions earn +3 karma!` | ✅ Good | `Pick the song you think will finish #1. Get it right = +3 karma.` | Shorter sentences |
| 23.3 | Scroll hint | `↓ Scroll for more options` | ✅ Good | `↓ Scroll for more` | Shorter |
| 23.4 | Cancel button | `Cancel` | ✅ Good | `Cancel` | — |

### 24. EXPORT BUTTON

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 24.1 | Button label | `Export` | ✅ Good | `Save to Spotify` | States where it goes |
| 24.2 | Exporting state | `Opening Spotify...` | ✅ Good (after our fix) | `Opening Spotify...` | — |
| 24.3 | Button title/tooltip | `Export playlist to Spotify anytime!` | Exclamation unnecessary | `Save this playlist to your Spotify` | Calmer, clearer |

### 25. PLAYLIST HEADER BAR

| # | Location | Current Copy | Problem | Improved Copy | Why It Works Better |
|---|---|---|---|---|---|
| 25.1 | Ticker placeholder (live) | `🎵 Vote for your favorites!` | ✅ Good | `🎵 Vote for your favorites` | — |
| 25.2 | Ticker placeholder (no session) | `Waiting for session...` | "Session" jargon | `Waiting for the next event...` | — |
| 25.3 | Loading state text | `Loading playlist...` | ✅ Good | `Loading playlist...` | — |

---

## 📊 Summary

| Category | Total Items | ✅ No Change | 🟡 Minor Polish | 🔴 Needs Rewrite |
|---|---|---|---|---|
| **Onboarding** | 22 | 7 | 8 | 7 |
| **Nav / Header** | 15 | 8 | 5 | 2 |
| **Search** | 12 | 4 | 4 | 4 |
| **Voting / Songs** | 11 | 6 | 3 | 2 |
| **Empty States** | 9 | 2 | 2 | 5 |
| **Success Msgs** | 14 | 5 | 5 | 4 |
| **Error States** | 17 | 8 | 5 | 4 |
| **Toasts** | 15 | 3 | 4 | 8 |
| **Announcements** | 18 | 11 | 4 | 3 |
| **Jukebox** | 20 | 8 | 6 | 6 |
| **Other** | 20+ | 10 | 6 | 4+ |
| **TOTAL** | **~170** | **~72 (42%)** | **~52 (31%)** | **~46 (27%)** |

**Key takeaway:** ~27% of UI copy needs a meaningful rewrite. Most issues fall into three patterns:
1. **Jargon** — "session", "tracks", "crowdsourcing", "drop" used in places visitors see
2. **Overloaded messages** — two actions or two facts crammed into one line
3. **Filler words** — "ultimate", "currently", "the community", "please" adding length without clarity
