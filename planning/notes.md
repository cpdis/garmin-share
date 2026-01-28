# Garmin Workout Sharing - Development Notes

## 2025-01-28

### Project Kickoff

**Goal:** Build web app to share Garmin workouts via short links

**Problem discovered:** Garmin Connect has NO export button for structured workouts (only activities). Users need:
1. Chrome extension "Share Your Garmin Connect Workout" → exports JSON
2. Watch USB → `/GARMIN/Workouts/*.fit`
3. CLI tool `garmin-workouts` → FIT export

**Decision:** Support both JSON and FIT formats

### Planning Phase

- Created initial plan with Next.js 15 + Vercel Blob + @garmin-fit/sdk
- Ran 3 parallel reviews:
  - **DHH:** Cut client-side parsing, use server-only. 8-char IDs plenty.
  - **Kieran:** Fix FIT epoch timestamp bug (Dec 31 1989 ≠ Unix epoch). Validate FormData properly.
  - **Simplicity:** 4 files total. No lib/, no components/, no separate metadata storage.

### Final Architecture

```
app/
├── page.tsx           # Upload (.fit + .json)
├── layout.tsx
├── w/[id]/page.tsx    # View + download
└── actions.ts         # Server action
```

**Stack:** Next.js 15, @garmin-fit/sdk, @vercel/blob

**Key technical notes:**
- FIT epoch = seconds since Dec 31, 1989. Add 631065600 before converting to JS Date.
- Garmin workout JSON has `workoutSegments[].workoutSteps[]` structure
- Pace targets in JSON are seconds/km (e.g., 240 = 4:00/km)

### Implementation Complete

- [x] Initialize Next.js project
- [x] Implement upload action
- [x] Implement share page with dual parsing
- [x] Deploy to Vercel
- [x] Test with real workout files

**Live URL:** https://garmin-import.vercel.app

**Test Share Link:** https://garmin-import.vercel.app/w/ebed22a7

### Files Created
- `app/page.tsx` - Upload page with file picker
- `app/actions.ts` - Server action for upload to Vercel Blob
- `app/w/[id]/page.tsx` - Share page with dual JSON/FIT parsing
- `garmin-fitsdk.d.ts` - Type declarations for Garmin FIT SDK

### Known Limitations (MVP)
- No link expiration
- No rate limiting (relies on Vercel defaults)
- FIT file parsing less tested than JSON

---

## 2025-01-28 (continued)

### ShareMyRun Chrome Extension

**Goal:** One-click workout sharing from Garmin Connect + one-click import on share pages

**Architecture:**
```
sharemyrun-extension/
├── manifest.json       # MV3, permissions for garmin + our domain
├── background.js       # Service worker: upload/import handlers
├── content/
│   ├── garmin.js      # Share button on connect.garmin.com/modern/workout/*
│   └── sharemyrun.js  # Import button on garmin-import.vercel.app/w/*
├── styles.css          # Button styles
└── icons/              # 16/48/128 placeholders
```

### Implementation

**Files created:**
- `sharemyrun-extension/manifest.json` - MV3 manifest with host permissions
- `sharemyrun-extension/content/garmin.js` - Extracts workout via Garmin API, sends to background
- `sharemyrun-extension/content/sharemyrun.js` - Injects import button, triggers Garmin import
- `sharemyrun-extension/background.js` - Handles uploadWorkout/importWorkout, CSRF extraction
- `sharemyrun-extension/styles.css` - Button styling matching Garmin/our site
- `app/api/upload/route.ts` - POST endpoint for JSON workout upload (CORS enabled)

**Key technical details:**
- Garmin workout API: `GET /gc-api/workout-service/workout/{id}` (extract)
- Garmin import API: `POST /gc-api/workout-service/workout` (create)
- CSRF token extracted from Garmin Connect page meta tag
- Workout prep for import: remove IDs, add " - shared" suffix, clear stepIds
- MutationObserver for SPA navigation detection

### Status
- [x] Create extension folder structure
- [x] Write manifest.json
- [x] Write garmin.js content script (share button)
- [x] Write sharemyrun.js content script (import button)
- [x] Write background.js service worker
- [x] Write styles.css
- [x] Add /api/upload route to Next.js
- [x] Create placeholder icons
- [ ] Local testing
- [ ] Deploy API route to Vercel
