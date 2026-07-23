# ALP → Vercel Deployment Tasks

## Phase 1 — Config & Dependencies
- [x] Create `vercel.json`
- [x] Update `package.json` (add Supabase, Vercel Blob, @vercel/node)
- [x] Update `.env.example`
- [x] Update `.gitignore`

## Phase 2 — Database Abstraction Layer
- [x] Create `database/supabase.js`
- [x] Create `database/adapter.js`
- [x] Update `database/init.js` (add Supabase init path)

## Phase 3 — Data Migration Script
- [x] Create `scripts/migrate-to-supabase.js`

## Phase 4 — Route Conversion (sync → async)
- [x] Update `middleware/auth.js`
- [x] Update `routes/auth.js`
- [x] Update `routes/sessions.js`
- [x] Update `routes/redirects.js`
- [x] Update `routes/analytics.js`
- [x] Update `routes/notifications.js`
- [x] Update `routes/logs.js`
- [x] Update `routes/settings.js`
- [x] Update `routes/websites.js`
- [x] Update `routes/telegram.js`
- [x] Update `routes/funnels.js`
- [x] Update `routes/security.js`

## Phase 5 — Tracker HTTP Endpoints
- [x] Create `api/tracker/init.js`
- [x] Create `api/tracker/heartbeat.js`
- [x] Create `api/tracker/pageview.js`
- [x] Create `api/tracker/formdata.js`
- [x] Create `api/tracker/end.js`
- [x] Update `public/tracker.js` (Socket.IO → fetch)

## Phase 6 — Admin Polling
- [x] Create `api/admin/poll.js`
- [x] Create `api/admin/command.js`
- [x] Update `public/admin/js/socket.js` (Socket.IO → polling)

## Phase 7 — Serverless Express Adapter
- [x] Create `api/[...path].js`
- [x] Update `server.js` (dual-mode guard)

## Phase 8 — Demo Pages & Cron
- [x] Create `api/demo/index.js`
- [x] Create `api/cron/cleanup.js`

## Phase 9 — Services Adaptation
- [x] Update `services/redirect.js`
- [x] Update `services/telegram.js`
- [x] Update `services/notification.js`
- [x] Update `services/analytics.js`

## Verification
- [x] Local module syntax and imports verified cleanly
- [x] Local development mode (`npm run dev`) guarded & backward-compatible
- [x] Migration script verified (reads local SQLite safely without modification)
