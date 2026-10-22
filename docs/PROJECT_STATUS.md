# Future Project Status

> Persistent handoff for future Codex sessions. Read this file together with the latest Git status and commit history before continuing.

Last updated: 2026-10-22 (Asia/Taipei)

## Resume snapshot

- Official website: <https://future-planner.claireeek.com/>
- GitHub: <https://github.com/claowennie/future-deploy>
- Production Worker: `future-planner`
- Current branch: `main`
- Latest product change: AI Daily Planner v1.1 — daily review loop and Today-card redesign (app version 3.2.0). Melo Companion remains v0.6.3.
- Latest verified Worker version: `e7a1bc9a-c63e-4df5-af74-3462f366e8ff`
- Public contact: `claowennie@gmail.com`
- AI Daily Planner migration, Worker secret, production deployment, and authenticated end-to-end verification are complete.

The product is live. AI Daily Planner v1 is available on Today after signing in: save a planning profile, answer the daily check-in, then click to generate a plan. Generation is user-triggered; no scheduled daily generation or notification is enabled.

## AI Daily Planner v1.1 — review loop and redesign (production, 2026-10-22)

- UI now uses the Today card system (`.card`, card header, shared night palette) at full page width instead of a centered standalone panel, and sits below the OKR strip: goals → today's plan → todos.
- Plan layout is two columns on desktop (main focus + progress + actions + review on the left, dayparts timeline on the right) and stacks on ≤900px. Items look like todo rows with typed tags. The card can be collapsed to a one-line main-task row (`ai_planner_collapsed_v1`, browser-local).
- `mainTask.reason` is shown as “为什么是它 / Why this”. The “good day” hint is computed from the plan size instead of a hard-coded 4/6.
- New end-of-day review (收尾复盘): feeling `too_much | just_right | too_light`, an optional note, and a completion snapshot are stored in `plan_json.review` (no migration). The check-in shows a recap of the previous planned day.
- The Worker passes per-day completion, review, and the last three Today-page reflections (`state.reflection`, trimmed, treated as untrusted) to the prompt. The model is told to lighten after `too_much` or low completion and to connect today to recent days in one sentence.
- Fixes: profile editing can be cancelled; retry re-runs the failed generate/replan with the same input; hourly token refreshes no longer reset the card to loading; rate-limit, network, timeout, and unconfigured errors have specific copy; the replan sheet closes with Escape.
- Verification: `npm run check` passed. A local Playwright run with mocked Supabase/Worker covered signed-out, profile, check-in with recap, plan (day/night, 1440px/390px), collapsed, Minimum Day in English, and saving a review. Production returned 200 for home/runtime config and served the new bundle, and anonymous planner generation returned 401. No authenticated production run was made with temporary accounts at first.
- Authenticated production QA (after release, 40/40 checks passed): two temporary accounts. Yesterday's plan was seeded with a `too_much` review, and the check-in showed the recap. Live AI generation returned `source: ai`; its message referenced yesterday being busy and kept today lighter, which confirms the review reached the prompt. Also covered: chronological dayparts, completion and review persistence across reload (review stored in `plan_json` with a progress snapshot), profile-edit cancel, collapse persistence, Minimum Day, 390px without horizontal overflow, live AI replan to version 2 with version 1 retained, RLS isolation between accounts, anonymous 401, Chinese default, and saved English UI. Temporary accounts and cascading planner data were deleted. The helper is `.wrangler/planner-v11-production-qa.mjs` (ignored); its result and screenshots are `.wrangler/planner-v11-production-*`.

## AI Daily Planner v1 (production, 2026-10-22)

- Adds a lightweight, reusable planning profile for priorities, interests, planning style, rhythm, and typical activities.
- Adds a 10–20 second daily check-in for energy, available time, day style, and optional must-do.
- Reads existing OKRs/todos from `planner_data` plus the latest seven days of planner history on the Worker; the browser never sends hidden user context.
- Generates exactly one Main Task and a humane set of Explore / Learn / Move / Read / Enjoy items in flexible dayparts.
- Validates structured JSON server-side, retries invalid output once, and persists a conservative personalized fallback if the second output is invalid.
- Supports immediate completion persistence, a non-judgmental Minimum Day, and versioned replanning without overwriting earlier plan rows.
- New database migration: `supabase/ai-daily-planner.sql` (`planner_profiles`, `daily_plans`, indexes, grants, RLS).
- New Worker routes: `POST /api/planner/generate` and `POST /api/planner/replan`.
- Planner AI uses the Worker-side `DEEPSEEK_API_KEY`; Melo remains user BYOK. These are intentionally separate product/security decisions.
- Full release checks pass. Production browser verification with temporary accounts covered profile creation, live AI generation, completion persistence after reload, Minimum Day persistence, versioned live AI replanning, Chinese defaults, saved English UI, and 390px mobile layout. A second account could neither read nor update the first account’s plans or impersonate its profile. Anonymous generation returned 401. Test accounts and cascading planner data were deleted afterward.

## Daily Planner release verification (2026-10-22)

- Full `npm run check` passed: lint, all test suites, Worker syntax checks, and production build.
- DeepSeek model discovery confirmed `deepseek-flash`; legacy flash aliases now normalize to that supported model. A live synthetic generation passed the planner contract.
- Chinese profile options and item labels are localized. Plan completion saves are serialized, disabled while pending, and roll back visibly on failure. Calendar-date validation rejects invalid dates; recent history respects Minimum Day completion.
- Applied the transactional migration for `planner_profiles` and `daily_plans`, grants, and RLS; read-back confirmed both tables exist. Supabase CLI temporary metadata is ignored by Git.
- Supabase reported a Management API incident affecting dashboard login at 19:32 Asia/Taipei. The initial CLI login attempt was stopped. After dashboard recovery, the user completed CLI authorization and the migration succeeded. No Supabase login configuration was changed.
- Deployed with `npm run deploy`; official home and runtime config return 200. The final Worker version is `3682dd05-b254-435b-9b04-a5c6fd829e4c`.
- Production screenshots exposed JSONB object-key reordering. The UI now explicitly orders morning, afternoon, evening, and night; regression and production browser checks cover the database round trip.
- Cloudflare Build deployment accepts the planner key as an optional supplied secret and preserves the existing runtime secret. Set it once before enabling the planner, or supply it when rotating.
- Local verification artifacts are ignored under `.wrangler/`: `planner-production-qa-result.json`, desktop/mobile screenshots, and release check/deploy logs. The QA helper uses temporary account credentials in memory and cleans up its accounts.

## Product positioning

Future is a bilingual personal growth operating system that connects long-term goals, daily action, focus, reflection, habits, notes, and the Melo AI music companion into one continuous growth loop.

The primary product story is:

```text
Long-term direction → today's action → focused execution → reflection → visible growth
                                                    ↘ Melo music companion
```

The README is structured as the formal product entry for visitors who want to try the product, understand its evolution, or inspect its architecture and local setup.

## Repositories and directories

### Main public repository

```text
D:\谷歌下载\future-deploy
```

- React/Vite frontend
- Cloudflare Worker API and Static Assets deployment
- Supabase migrations and documentation
- Tests, screenshots, README, and public Companion download
- Git remote: `https://github.com/claowennie/future-deploy.git`

### Companion packaging source

```text
D:\谷歌下载\future-companion
```

- Local Node.js bridge for NetEase Cloud Music playback
- Listens on `127.0.0.1:45731`
- Not currently a Git repository
- Do not package `.future-companion/`, cookies, pairing tokens, App Private Keys, API keys, or user audio

## Production architecture

```text
Browser / installed PWA
  ├─ React 18 + Vite 8 UI
  ├─ Supabase Auth, Postgres/RLS, Realtime, private Storage
  ├─ YouTube official embedded player
  ├─ Browser speechSynthesis (default free voice)
  ├─ Optional Future Companion on 127.0.0.1
  └─ Cloudflare Worker /api/*
       ├─ validates Supabase user identity
       ├─ reads user-scoped data through JWT + RLS
       ├─ validates structured Melo/DeepSeek output
       ├─ handles optional Google or MiniMax TTS
       └─ applies per-account/route rate limiting
```

Core stack: React, Vite, JavaScript, CSS, PWA, Cloudflare Workers and Static Assets, Wrangler, Supabase Auth/Postgres/RLS/Realtime/Storage, DeepSeek BYOK, Google Chirp 3 HD BYOK, MiniMax Speech BYOK, Web Speech API, YouTube IFrame API, Node.js, `@music163/ncm-cli`, and mpv.

## Stable product decisions

### Language

- New visitors with no `locale_v1` preference always start in Chinese.
- Users who explicitly select English keep that saved preference.
- Chinese browser/PWA title: `future · 个人成长规划`.
- English runtime title: `future · Personal Growth Planner`.
- Website UI language and Melo voice language are separate controls. Changing Melo between Chinese and English must not change the website UI.

### Melo voice

- Default provider: free browser speech.
- Optional BYOK providers: Google Chirp 3 HD and MiniMax.
- API keys are kept only in the current tab/session and must not be stored in Supabase, Worker configuration, logs, or build output.
- Chinese and English voices are selectable independently.

### Player and volume

- Melo speaks the opening and first-track introduction before playback.
- The displayed player state must follow real playback, including automatic track transitions.
- Selecting a playlist item triggers its introduction before playing it.
- Play/pause remains on the left in the compact player layout.
- The volume button sits to its right; the slider appears only when the volume button is activated.
- Volume changes continuously while dragging and uses a perceptually useful curve.

### Privacy and local playback

- User rows and private audio are isolated with Supabase RLS.
- Browser and cloud TTS receive only the text required for synthesis.
- Future Companion accepts only paired, allowlisted commands and keeps NetEase credentials/audio local.
- The old `workers.dev` origin is retained in Companion v0.6.3 only for migration compatibility.

## Completed iteration history

### Planning and core product

- Built Today / Week / Month / Year planning, annual OKRs, recurring tasks, habits, Pomodoro focus, ambient sound, reflections, success journal, notes, seasonal growth tree, time-of-day lighting, immersive mode, mobile responsiveness, and PWA support.
- Added Supabase authentication, cross-device sync, RLS isolation, private audio storage, export, self-service account deletion, and optional push support.
- Added complete Chinese and English UI coverage and made Settings internally scrollable with the scrollbar inset inside the modal frame.
- Updated the public contact email to `claowennie@gmail.com`.

### Melo radio and playback

- Rebuilt Melo as a deployable AI radio experience with structured recommendations and narrated track introductions.
- Added private Supabase audio, YouTube playlists, and the NetEase local Companion as separate music sources.
- Fixed queue construction, playable-track matching, same-title cover avoidance, artist diversity, introduction timing, player-state synchronization, real track-end detection, and automatic next-track playback.
- Fixed the state where music was audible but the player still displayed “not playing”.
- Added live volume control and refined the compact control layout.
- Separated website UI language from Melo voice language.

### Voice providers

- Added browser speech, Google Chirp 3 HD, and MiniMax BYOK voice configuration.
- Browser speech is the default.
- Added Chinese/English voice choices, actionable TTS test feedback, MiniMax error mapping, cloud-speech playback unlock handling, and privacy documentation.

### Public launch and deployment

- Hardened security headers, same-origin/API checks, rate limits, runtime configuration, CI checks, and Cloudflare deployment.
- Reworked the README into the formal product entry: About, Core Features, Product Journey, What I Built, Tech Stack, Architecture, Local Development, Deployment, and Roadmap.
- Removed recruiter-specific wording from Roadmap and refocused it on product reliability and evolution.
- Bound the Worker to `future-planner.claireeek.com` and kept `workers.dev` available as a migration fallback.
- Updated canonical metadata, Open Graph URL/title, README links, deployment docs, and GitHub repository Website.
- Changed the default UI from browser-language detection to Chinese-first while preserving saved English preferences.

## Melo playback repair (2026-10-22)

- Companion v0.6.3 accepts CLI upgrade notices before/after JSON. The installed ncm-cli 0.1.6 prints its 0.1.7 update notice on stdout, which previously broke login checks and player state parsing.
- Setup/login verification now exits unsuccessfully when the CLI reports `success: false`, even if the CLI process exits with code 0. Search execution errors are preserved when every search fails.
- Browser command requests allow 180 seconds for native login/search/queue/play steps; connection checks keep the 12-second deadline.
- Companion regression coverage includes upgrade notices, malformed JSON, failed login verification, and the deferred search-to-play flow using a fixture CLI. After reauthentication, real CLI playback and Companion HTTP playback were both verified: the player reported playing, a nonzero duration, and advancing position. Test audio was stopped/paused afterward.
- Verification: all 11 Companion tests and both working-tree/release `npm run check` passed. Deployed with `npm run deploy`; custom-domain home/runtime config return 200, and the production v0.6.3 ZIP hash matches the package below. Browser UI automation was unavailable. The local v0.6.3 bridge was subsequently stopped at the user?s request (port 45731 released); before stopping it, and authenticated requests carrying the official website Origin successfully exercised health, resume, advancing playback state, and pause. Some tracks are explicitly unavailable through the NetEase API even when signed in; matching continues to respect playFlag/visible and exact artists.
- Release is built from the committed baseline plus only the Melo fix. Existing local AI Daily Planner work is preserved and is not part of this release.

## Future Companion release

Current public release: `v0.6.3`

Download:

<https://future-planner.claireeek.com/downloads/future-companion-windows-v0.6.3.zip>

```text
Size:    19,223 bytes
SHA-256: 8153B8149BA1A8B40118598A43CE57F63DBDBDF00524A55E85C56F862D7533C8
```

Default allowed website origins in v0.6.3:

```text
https://future-planner.claireeek.com
https://future-planner.claowennie.workers.dev
http://localhost:5173
http://127.0.0.1:5173
```

Users on v0.6.2 or earlier should upgrade to v0.6.3 for CLI output compatibility. v0.6.0 also lacks the custom-domain origin. Existing local users can keep their pairing configuration, then run login-companion.cmd and restart Companion.

When releasing another Companion version:

1. Update the source version and allowed origins in `D:\谷歌下载\future-companion`.
2. Run its tests.
3. Package only the public source/scripts under a versioned top-level folder.
4. Add the ZIP to `public/downloads/`.
5. Update the filename, version copy, headers, size, and SHA-256 in the main app, tests, and README.
6. Run the complete main-repository check and verify the downloaded production hash.

## External configuration to confirm

Cloudflare custom-domain routing is complete. Supabase Auth URL settings could not be verified from the previous session because the signed-in browser-control connection was unavailable.

Before considering domain migration fully closed, confirm in Supabase:

```text
Authentication → URL Configuration

Site URL:
https://future-planner.claireeek.com

Redirect URLs:
https://future-planner.claireeek.com/**
https://future-planner.claowennie.workers.dev/**
http://localhost:5173/**
```

Keep the old production origin temporarily so existing email confirmation and password-reset links do not break during migration.

## Demonstration video plan

Target length: 90–120 seconds. The video should tell one complete story instead of listing every feature.

Recommended sequence:

1. `0–8s` — seasonal home, time-of-day lighting, growth tree.
2. `8–20s` — Year → Month → Week → Today, showing long-term goals reaching daily action.
3. `20–45s` — create/organize a task and complete a habit.
4. `45–65s` — start Pomodoro and enter immersive mode.
5. `65–82s` — finish work, write Reflection, show growth feedback.
6. `82–105s` — ask Melo for quiet focus music; show introduction, playback, and transition.
7. `105–115s` — bilingual UI, sync, privacy/BYOK flashes.
8. `115–120s` — Future logo, official domain, and GitHub.

Primary message: Future turns long-term direction into today's action, then closes the loop through focus and reflection. Melo is the memorable supporting differentiator.

Use a prepared demo account, hide email/API keys, record at 1920×1080, avoid long real-time typing, add subtitles, and use only copyright-safe audio. Prepare an English-UI/English-subtitle export for GitHub and a Chinese version for domestic platforms if needed.

## Current roadmap and known follow-ups

- Confirm Supabase Auth Site URL and redirect allowlist for the custom domain.
- Record and publish the two-minute product demo and concise iteration Case Study.
- Improve first-load feedback, weak-network recovery, and error fallback to reduce perceived blank screens.
- Split or reduce the large initial JavaScript/CSS assets where practical.
- Upgrade Future Companion to a signed installer with dependency checks, diagnostics, and automatic updates.
- Add a limited no-key Melo experience when usage economics allow it.
- Improve Melo recommendation feedback, queue editing, and long-term taste evolution.
- Expand end-to-end tests, accessibility checks, production alerts, offline behavior, push reliability, and sync-conflict UX.

## Verification and release workflow

From `D:\谷歌下载\future-deploy`:

```powershell
npm run check
npm run deploy
```

`npm run check` covers ESLint, date/merge/i18n/Melo/Companion-package tests, Worker syntax checks, and a production Vite build.

After deployment, verify at minimum:

- `/` returns 200 and contains the current title/canonical URL.
- `/api/runtime-config.js` returns 200 without exposing private secrets.
- login, signup, email confirmation, password reset, sync, and account deletion.
- Melo chat, browser voice, configured cloud TTS, YouTube, and private audio.
- Companion pairing, state synchronization, volume, automatic next track, and the versioned ZIP hash.
- mobile layout, PWA/service-worker refresh, and language switching.

Then commit only intended changes and push `main`. Never use destructive Git commands against unrelated user changes.

## Security reminders

- `.env.local` and `.env.worker` contain environment configuration. Never quote their values in chat or documentation.
- Never commit DeepSeek, Google, MiniMax, Supabase service-role, Cloudflare, NetEase, or Companion secrets.
- Supabase public URL/publishable configuration may be shipped to the browser, but private credentials must not be.
- Treat `D:\谷歌下载\future-companion\.future-companion` as private runtime data and never include it in a release ZIP.
