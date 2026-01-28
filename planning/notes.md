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

### Next Steps

- [ ] Initialize Next.js project
- [ ] Implement upload action
- [ ] Implement share page with dual parsing
- [ ] Deploy to Vercel
- [ ] Test with real workout files
