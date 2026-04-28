# LOCKED — Known-Good Working State

> **Read this before editing anything in this repo.**

## What's locked

The vote app at `cratehackathon.com` and `crateoftheweek.com` is in a clean, working state as of **April 26, 2026**.

| Thing | Value |
| --- | --- |
| Git tag | `v1.0-working-embed` |
| Commit | `a186ae3` |
| Vercel deployment | `dpl_Arj3ChkpCdefQGTdYU35ouPZkfEV` |
| Vercel project | `crate-vote` (scope: `aaron-6624s-projects`) |
| Live aliases | `crateoftheweek.com`, `www.crateoftheweek.com` (and `cratehackathon.com` 302 redirects in via Squarespace DNS) |

## Why this is "the good version"

- The in-app Kartra signup gate was removed. Visitors land on a single clean "pick a name" overlay and are inside the jukebox in one tap.
- The app is intentionally embeddable (no `X-Frame-Options`, permissive `frame-ancestors`) so it can be iframed inside any parent page (Squarespace, Kartra, etc.) without breaking.
- The Content Security Policy still whitelists Kartra (`app.kartra.com`) for scripts, styles, frames, and form submissions — so if you later wrap this app inside a Kartra page, Kartra's own widgets will run alongside it without browser blocks.

## DO NOT TOUCH (without me)

These three are the single points of failure. If any of them get edited carelessly the embed/lead capture pipeline breaks.

1. **[middleware.ts](middleware.ts)** — security headers + CSP.
   - Lines 14-15: comment that explains why `X-Frame-Options` is intentionally NOT set.
   - Lines 32-40: CSP whitelist for `app.kartra.com`, `cratehackathon.com`, `crateoftheweek.com`.
   - If you remove any of those origins, the iframe or Kartra widgets stop working.
2. **[app/page.tsx](app/page.tsx)** join overlay (lines ~2227-2253) — the simple username modal. Don't put a Kartra opt-in form back inside this app. Lead capture lives on the parent page that frames this app, not in the app itself.
3. **[next.config.js](next.config.js)** — keep it minimal. Don't add custom headers here that conflict with the middleware CSP.

## If something breaks → restore in 60 seconds

```bash
git fetch --tags
git checkout v1.0-working-embed
npx vercel --prod --scope aaron-6624s-projects
```

Or, faster, in the Vercel dashboard:

1. Go to the `crate-vote` project → Deployments
2. Find deployment `dpl_Arj3ChkpCdefQGTdYU35ouPZkfEV` (Apr 26, 2026)
3. Click "Promote to Production"

## Where the leads are actually captured

**Not in this repo.** The Kartra opt-in form lives on whatever marketing/landing page sends traffic to `crateoftheweek.com`. This app does not collect emails. Don't try to put a form back in it without talking to Aaron first.

## What to tell the team

> The vote app is locked at tag `v1.0-working-embed` (commit `a186ae3`). If the embed on cratehackathon.com ever stops working, the fix is `git checkout v1.0-working-embed` then redeploy. Do not edit `middleware.ts`, the join overlay in `app/page.tsx`, or `next.config.js` without checking with Aaron first. Kartra lead capture is NOT in this repo — it lives on whatever page collects emails before sending traffic here.
