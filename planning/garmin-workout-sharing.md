# feat: Garmin Workout Sharing Web App

## Overview

Web interface to share Garmin workouts via short links. Upload workout file (`.FIT` or `.json` from Chrome extension) → get shareable link → recipient views summary + downloads file to import into their Garmin Connect.

## Problem Statement

Garmin Connect has no native workout sharing. Current workarounds suck:
- Watch-to-watch sync: proximity required, flaky
- Manual export/email: tedious
- TrainingPeaks: $$$, overkill
- **No export button at all** for structured workouts in Garmin Connect UI

Athletes need simple workout sharing.

## How Users Get Workout Files

**Important:** Garmin Connect doesn't have an export button for workouts. Users need one of:

| Method | Format | How |
|--------|--------|-----|
| **Chrome Extension** (Recommended) | JSON | Install [Share Your Garmin Connect Workout](https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff), click Download on workout page |
| **Watch USB** | FIT | Connect watch via USB, navigate to `/GARMIN/Workouts/` |
| **garmin-workouts CLI** | FIT | `pip install garmin-workouts && garminworkouts export` |
| **DevTools** | JSON | F12 → Network → filter "workout" → copy response |

Our app will accept **both JSON and FIT** formats.

## Stack

```
Framework:    Next.js 15 (App Router)
Parsing:      @garmin-fit/sdk (FIT files)
Storage:      Vercel Blob
Database:     None
Auth:         None
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Upload Page   │────▶│  Server Action  │
│   /             │     │  Detect format  │
│   .fit or .json │     │  Store original │
└─────────────────┘     └─────────────────┘
                                │
                                ▼
┌─────────────────┐     ┌─────────────────┐
│   View Page     │◀────│  Parse file     │
│   /w/[id]       │     │  (FIT or JSON)  │
└─────────────────┘     └─────────────────┘
```

## User Flows

**Upload & Share**
1. User exports workout using Chrome extension (JSON) or USB (FIT)
2. Drop/select file on our site
3. Server validates + stores to Vercel Blob
4. Returns share link (`/w/abc123`)
5. Auto-copy to clipboard

**View & Download**
1. Open `/w/abc123`
2. Server fetches blob, parses (FIT or JSON), renders summary
3. Download button for original file
4. Instructions for importing into Garmin Connect

## Technical Approach

### File Structure (Minimal)

```
garmin-share/
├── app/
│   ├── page.tsx           # Upload form (accepts .fit + .json)
│   ├── layout.tsx         # Root layout
│   ├── w/[id]/page.tsx    # Share view page
│   └── actions.ts         # Server action: upload
├── tailwind.config.ts
└── package.json
```

### Dependencies

```json
{
  "dependencies": {
    "next": "^15",
    "@garmin-fit/sdk": "^21",
    "@vercel/blob": "^0.24"
  }
}
```

### Garmin Connect Workout JSON Structure

The Chrome extension exports JSON like this:

```json
{
  "workoutId": 123456789,
  "ownerId": 12345678,
  "workoutName": "5K Tempo Run",
  "description": "Easy warmup, tempo effort, cooldown",
  "sportType": {
    "sportTypeId": 1,
    "sportTypeKey": "running"
  },
  "workoutSegments": [
    {
      "segmentOrder": 1,
      "sportType": { "sportTypeKey": "running" },
      "workoutSteps": [
        {
          "stepOrder": 1,
          "stepType": { "stepTypeKey": "warmup" },
          "endCondition": { "conditionTypeKey": "time" },
          "endConditionValue": 600,
          "targetType": { "workoutTargetTypeKey": "no.target" }
        },
        {
          "stepOrder": 2,
          "stepType": { "stepTypeKey": "interval" },
          "endCondition": { "conditionTypeKey": "distance" },
          "endConditionValue": 5000,
          "targetType": { "workoutTargetTypeKey": "pace.zone" },
          "targetValueOne": 240,
          "targetValueTwo": 270
        }
      ]
    }
  ]
}
```

### Server Action (Dual Format Support)

```typescript
// app/actions.ts
"use server";

import { put } from "@vercel/blob";
import { randomUUID } from "crypto";

type UploadResult =
  | { success: true; id: string; url: string }
  | { success: false; error: string };

export async function uploadWorkout(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { success: false, error: "No file provided" };
  }

  const name = file.name.toLowerCase();
  const isFit = name.endsWith(".fit");
  const isJson = name.endsWith(".json");

  if (!isFit && !isJson) {
    return { success: false, error: "Must be a .FIT or .JSON file" };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "File too large (max 5MB)" };
  }

  // Validate content
  if (isJson) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.workoutName && !data.workoutSegments) {
        return { success: false, error: "Invalid Garmin workout JSON" };
      }
    } catch {
      return { success: false, error: "Invalid JSON file" };
    }
  }

  if (isFit) {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 14) {
      return { success: false, error: "Invalid FIT file" };
    }
  }

  const id = randomUUID().slice(0, 8);
  const ext = isFit ? "fit" : "json";

  await put(`workouts/${id}.${ext}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  return { success: true, id, url: `/w/${id}` };
}
```

### Share Page (Dual Format)

```typescript
// app/w/[id]/page.tsx
import { head, list } from "@vercel/blob";
import { notFound } from "next/navigation";
import { Decoder, Stream } from "@garmin-fit/sdk";

const FIT_EPOCH_OFFSET = 631065600;

interface WorkoutData {
  name: string;
  sport: string;
  steps: WorkoutStep[];
  downloadUrl: string;
  format: "fit" | "json";
}

interface WorkoutStep {
  type: string;       // warmup, interval, cooldown, recovery
  duration?: string;  // "10:00" or "5.0 km"
  target?: string;    // "4:00-4:30/km" or "Zone 3"
}

async function findWorkoutBlob(id: string) {
  // Try both extensions
  for (const ext of ["json", "fit"]) {
    try {
      const blob = await head(`workouts/${id}.${ext}`);
      return { blob, format: ext as "fit" | "json" };
    } catch {}
  }
  return null;
}

async function parseJsonWorkout(data: any): Promise<Omit<WorkoutData, "downloadUrl" | "format">> {
  const steps: WorkoutStep[] = [];

  for (const segment of data.workoutSegments || []) {
    for (const step of segment.workoutSteps || []) {
      const type = step.stepType?.stepTypeKey || "interval";
      let duration: string | undefined;
      let target: string | undefined;

      // Parse duration
      const condition = step.endCondition?.conditionTypeKey;
      const value = step.endConditionValue;
      if (condition === "time" && value) {
        const mins = Math.floor(value / 60);
        const secs = value % 60;
        duration = secs ? `${mins}:${secs.toString().padStart(2, "0")}` : `${mins}:00`;
      } else if (condition === "distance" && value) {
        duration = `${(value / 1000).toFixed(1)} km`;
      }

      // Parse target
      const targetType = step.targetType?.workoutTargetTypeKey;
      if (targetType === "pace.zone" && step.targetValueOne && step.targetValueTwo) {
        const formatPace = (secs: number) => {
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          return `${m}:${s.toString().padStart(2, "0")}`;
        };
        target = `${formatPace(step.targetValueOne)}-${formatPace(step.targetValueTwo)}/km`;
      } else if (targetType === "heart.rate.zone") {
        target = `HR Zone ${step.targetValueOne || "?"}`;
      }

      steps.push({ type, duration, target });
    }
  }

  return {
    name: data.workoutName || "Untitled Workout",
    sport: data.sportType?.sportTypeKey || "running",
    steps,
  };
}

async function parseFitWorkout(buffer: ArrayBuffer): Promise<Omit<WorkoutData, "downloadUrl" | "format"> | null> {
  try {
    const stream = Stream.fromArrayBuffer(buffer);
    const decoder = new Decoder(stream);
    if (!decoder.isFIT()) return null;

    const { messages } = decoder.read();
    const workout = messages.workoutMesgs?.[0];
    const workoutSteps = messages.workoutStepMesgs || [];

    const steps: WorkoutStep[] = workoutSteps.map((step: any) => ({
      type: String(step.intensity || "active").toLowerCase(),
      duration: step.durationValue
        ? step.durationType === "time"
          ? `${Math.floor(step.durationValue / 60000)}:00`
          : `${(step.durationValue / 100000).toFixed(1)} km`
        : undefined,
      target: step.targetValue ? `Target: ${step.targetValue}` : undefined,
    }));

    return {
      name: workout?.wktName || "Untitled Workout",
      sport: String(workout?.sport || "running"),
      steps,
    };
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ id: string }> };

export default async function WorkoutPage({ params }: Props) {
  const { id } = await params;
  const found = await findWorkoutBlob(id);

  if (!found) notFound();

  const { blob, format } = found;
  const res = await fetch(blob.url);

  let workout: WorkoutData | null = null;

  if (format === "json") {
    const data = await res.json();
    const parsed = await parseJsonWorkout(data);
    workout = { ...parsed, downloadUrl: blob.url, format };
  } else {
    const buffer = await res.arrayBuffer();
    const parsed = await parseFitWorkout(buffer);
    if (!parsed) notFound();
    workout = { ...parsed, downloadUrl: blob.url, format };
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">{workout.name}</h1>
      <p className="text-gray-500 mb-6 capitalize">{workout.sport}</p>

      <div className="space-y-2 mb-6">
        {workout.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-xs font-medium uppercase text-gray-500 w-20">
              {step.type}
            </span>
            {step.duration && (
              <span className="font-medium">{step.duration}</span>
            )}
            {step.target && (
              <span className="text-sm text-blue-600">{step.target}</span>
            )}
          </div>
        ))}
      </div>

      <a
        href={workout.downloadUrl}
        download={`${workout.name.replace(/\s+/g, "-")}.${workout.format}`}
        className="block w-full text-center bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
      >
        Download .{workout.format.toUpperCase()} File
      </a>

      <details className="mt-6 text-sm text-gray-600">
        <summary className="cursor-pointer font-medium">How to import into Garmin Connect</summary>
        <ol className="mt-2 ml-4 list-decimal space-y-1">
          {workout.format === "json" ? (
            <>
              <li>Install the <a href="https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff" className="text-blue-600 underline">Share Your Garmin Connect Workout</a> extension</li>
              <li>Go to Garmin Connect → Training → Workouts</li>
              <li>Click the extension icon → Upload → select downloaded file</li>
            </>
          ) : (
            <>
              <li>Connect your Garmin watch via USB</li>
              <li>Copy the .FIT file to <code>/GARMIN/NewFiles/</code></li>
              <li>Safely eject and sync your watch</li>
            </>
          )}
        </ol>
      </details>
    </main>
  );
}
```

### Upload Page

```typescript
// app/page.tsx
"use client";

import { useState, useCallback } from "react";
import { uploadWorkout } from "./actions";

export default function HomePage() {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("uploading");
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await uploadWorkout(formData);

    if (result.success) {
      const fullUrl = `${window.location.origin}${result.url}`;
      setShareUrl(fullUrl);
      setStatus("done");

      try {
        await navigator.clipboard.writeText(fullUrl);
        setCopied(true);
      } catch {}
    } else {
      setError(result.error);
      setStatus("error");
    }
  }, []);

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Share Garmin Workout</h1>
      <p className="text-gray-600 mb-6">
        Upload a workout file to get a shareable link.
      </p>

      {status === "done" && shareUrl ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800 mb-2">
              {copied ? "Link copied to clipboard!" : "Share this link:"}
            </p>
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="w-full p-2 border rounded text-sm"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>
          <button
            onClick={() => {
              setStatus("idle");
              setShareUrl(null);
              setCopied(false);
            }}
            className="text-blue-600 text-sm"
          >
            Upload another
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                name="file"
                accept=".fit,.json"
                required
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              <p className="text-xs text-gray-400 mt-2">
                .FIT (from watch) or .JSON (from Chrome extension)
              </p>
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={status === "uploading"}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {status === "uploading" ? "Uploading..." : "Generate Share Link"}
            </button>
          </form>

          <details className="mt-8 text-sm text-gray-600">
            <summary className="cursor-pointer font-medium">How do I get my workout file?</summary>
            <div className="mt-3 space-y-3">
              <div>
                <p className="font-medium">Option 1: Chrome Extension (Easiest)</p>
                <ol className="ml-4 list-decimal">
                  <li>Install <a href="https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff" className="text-blue-600 underline">Share Your Garmin Connect Workout</a></li>
                  <li>Open your workout in Garmin Connect</li>
                  <li>Click the extension icon → Download</li>
                </ol>
              </div>
              <div>
                <p className="font-medium">Option 2: Watch USB</p>
                <ol className="ml-4 list-decimal">
                  <li>Connect watch via USB cable</li>
                  <li>Navigate to <code>/GARMIN/Workouts/</code></li>
                  <li>Copy the .FIT file you want to share</li>
                </ol>
              </div>
            </div>
          </details>
        </>
      )}
    </main>
  );
}
```

## Acceptance Criteria

### Functional
- [ ] Upload `.FIT` or `.JSON` workout files
- [ ] Validate: file type, size < 5MB, valid format
- [ ] Generate 8-char share link
- [ ] Auto-copy link to clipboard
- [ ] Share page shows: workout name, sport, steps with duration/targets
- [ ] Download button for original file
- [ ] Import instructions for both JSON and FIT formats
- [ ] Invalid links show 404

### Non-Functional
- [ ] Server-side parsing only
- [ ] Single storage artifact per workout
- [ ] Works on Chrome, Safari, Firefox
- [ ] Mobile-responsive

## Security / Rate Limiting

**MVP:** Rely on Vercel's built-in protections.

**Phase 2 (if needed):**
- IP-based rate limiting: 10 uploads/hour
- Vercel Edge Middleware or Upstash Redis

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| FIT SDK throws | Try-catch, friendly error |
| JSON format changes | Graceful fallback, show raw data |
| Storage abuse | 5MB limit, future rate limiting |
| Link enumeration | 8-char UUID = 2.8 trillion combos |

## Open Questions

1. **Link expiration?** — Start with never, add 30-day TTL if storage grows
2. **Domain?** — `sharemy.run`? `fitshare.io`? Use Vercel subdomain for MVP.
3. **JSON→FIT conversion?** — Would let JSON uploads sync directly to watch. Phase 2.

## References

- [Garmin FIT SDK](https://developer.garmin.com/fit/)
- [@garmin-fit/sdk npm](https://www.npmjs.com/package/@garmin-fit/sdk)
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
- [Share Your Garmin Connect Workout (Chrome)](https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff)

---

*Plan updated 2025-01-28 — added JSON support for Chrome extension workflow*
