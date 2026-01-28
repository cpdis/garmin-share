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
